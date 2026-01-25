'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/app/components/Header';
import { PageAlerts } from '@/app/components/Alert';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogSets,
  getSetComponents,
  getCatalogItems,
  addSetComponent,
  updateSetComponent,
  removeSetComponent,
  type CatalogSet,
  type SetComponent,
  type CatalogItem,
  type ItemCategory,
} from '@/lib/api';

/**
 * LAW NOTICE: Catalog Set Components define EXPECTED composition only.
 * They DO NOT assert physical state, presence, readiness, or verification.
 * See docs/LAW/catalog.md v2.1 Amendment.
 */

// LAW catalog.md v2.0 Section 4A: Engine Category
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  IMPLANT: { bg: '#feebc8', color: '#c05621' },
  INSTRUMENT: { bg: '#bee3f8', color: '#2b6cb0' },
  EQUIPMENT: { bg: '#c6f6d5', color: '#276749' },
  MEDICATION: { bg: '#fed7e2', color: '#c53030' },
  CONSUMABLE: { bg: '#e9d8fd', color: '#6b46c1' },
  PPE: { bg: '#faf089', color: '#975a16' },
};

const CATEGORY_LABELS: Record<string, string> = {
  IMPLANT: 'Implant',
  INSTRUMENT: 'Instrument',
  EQUIPMENT: 'Equipment',
  MEDICATION: 'Medication',
  CONSUMABLE: 'Consumable',
  PPE: 'PPE',
};

export default function CatalogSetsPage() {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [components, setComponents] = useState<SetComponent[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SetComponent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [formData, setFormData] = useState({
    requiredQuantity: 1,
    optionalQuantity: 0,
    notes: '',
  });

  const {
    data,
    isLoading,
    error,
    successMessage,
    setError,
    setSuccessMessage,
    clearError,
    clearSuccess,
    refetch,
    user,
    token,
    accessDenied,
  } = usePageData({
    fetchFn: async (token) => {
      const result = await getCatalogSets(token, true);
      return result.sets;
    },
    requiredRoles: ['ADMIN'],
  });

  const sets = data || [];
  const selectedSet = sets.find(s => s.id === selectedSetId);

  // Load components when a set is selected
  useEffect(() => {
    const loadComponents = async () => {
      if (!selectedSetId || !token) {
        setComponents([]);
        return;
      }
      setLoadingComponents(true);
      try {
        const result = await getSetComponents(token, selectedSetId);
        setComponents(result.components);
      } catch (err) {
        console.error('Failed to load components:', err);
        setError(err instanceof Error ? err.message : 'Failed to load components');
      } finally {
        setLoadingComponents(false);
      }
    };
    loadComponents();
  }, [selectedSetId, token, setError]);

  // Load all catalog items when opening add form
  useEffect(() => {
    const loadCatalogItems = async () => {
      if (showAddForm && token && allCatalogItems.length === 0) {
        try {
          const result = await getCatalogItems(token, { includeInactive: false });
          setAllCatalogItems(result.items);
        } catch (err) {
          console.error('Failed to load catalog items:', err);
        }
      }
    };
    loadCatalogItems();
  }, [showAddForm, token, allCatalogItems.length]);

  const handleAddComponent = async () => {
    if (!token || !selectedSetId || !selectedCatalogId) return;

    await withErrorHandling(
      () => addSetComponent(token, selectedSetId, {
        componentCatalogId: selectedCatalogId,
        requiredQuantity: formData.requiredQuantity,
        optionalQuantity: formData.optionalQuantity,
        notes: formData.notes || undefined,
      }),
      setError,
      (result) => {
        setSuccessMessage('Component added');
        setComponents(prev => [...prev, result.component].sort((a, b) => a.componentName.localeCompare(b.componentName)));
        setShowAddForm(false);
        resetForm();
        refetch(); // Refresh set list to update component count
      }
    );
  };

  const handleUpdateComponent = async () => {
    if (!token || !selectedSetId || !editingComponent) return;

    await withErrorHandling(
      () => updateSetComponent(token, selectedSetId, editingComponent.id, {
        requiredQuantity: formData.requiredQuantity,
        optionalQuantity: formData.optionalQuantity,
        notes: formData.notes || null,
      }),
      setError,
      (result) => {
        setSuccessMessage('Component updated');
        setComponents(prev => prev.map(c => c.id === result.component.id ? result.component : c));
        setEditingComponent(null);
        resetForm();
      }
    );
  };

  const handleRemoveComponent = async (componentId: string) => {
    if (!token || !selectedSetId) return;
    if (!confirm('Remove this component from the set definition?')) return;

    await withErrorHandling(
      () => removeSetComponent(token, selectedSetId, componentId),
      setError,
      () => {
        setSuccessMessage('Component removed');
        setComponents(prev => prev.filter(c => c.id !== componentId));
        refetch(); // Refresh set list to update component count
      }
    );
  };

  const resetForm = () => {
    setSelectedCatalogId('');
    setFormData({ requiredQuantity: 1, optionalQuantity: 0, notes: '' });
    setSearchTerm('');
  };

  const openEditForm = (component: SetComponent) => {
    setEditingComponent(component);
    setFormData({
      requiredQuantity: component.requiredQuantity,
      optionalQuantity: component.optionalQuantity,
      notes: component.notes || '',
    });
  };

  // Filter available catalog items (exclude already in set)
  const existingComponentIds = new Set(components.map(c => c.componentCatalogId));
  const availableItems = allCatalogItems
    .filter(item => !existingComponentIds.has(item.id))
    .filter(item => item.id !== selectedSetId) // Can't add set to itself
    .filter(item => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        (item.manufacturer?.toLowerCase().includes(term)) ||
        (item.catalogNumber?.toLowerCase().includes(term))
      );
    });

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (accessDenied) {
    return (
      <>
        <Header title="Set Definitions" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Catalog Set Definitions" />

      <main className="container sets-page">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="page-header">
          <div className="breadcrumb">
            <Link href="/admin/catalog">Catalog</Link>
            <span className="separator">/</span>
            <span>Set Definitions</span>
          </div>
          <p className="description">
            Define expected components for kits, trays, and composite items.
            <br />
            <strong>Note:</strong> Set definitions declare expectations only — they do not verify physical presence or readiness.
          </p>
        </div>

        <div className="sets-layout">
          {/* Left: Set List */}
          <div className="sets-list-panel">
            <h3>Catalog Items</h3>
            <p className="helper-text">Select an item to define its components</p>
            <div className="sets-list">
              {sets.length === 0 ? (
                <p className="empty-message">No catalog items found.</p>
              ) : (
                sets.map(set => (
                  <div
                    key={set.id}
                    className={`set-item ${selectedSetId === set.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSetId(set.id)}
                  >
                    <div className="set-name">{set.name}</div>
                    <div className="set-meta">
                      <span
                        className="category-badge"
                        style={{
                          backgroundColor: CATEGORY_COLORS[set.category]?.bg || '#e2e8f0',
                          color: CATEGORY_COLORS[set.category]?.color || '#4a5568',
                        }}
                      >
                        {CATEGORY_LABELS[set.category] || set.category}
                      </span>
                      {set.componentCount > 0 && (
                        <span className="component-count">{set.componentCount} components</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Components Panel */}
          <div className="components-panel">
            {!selectedSet ? (
              <div className="empty-panel">
                <p>Select a catalog item to view or define its components</p>
              </div>
            ) : (
              <>
                <div className="panel-header">
                  <h3>{selectedSet.name}</h3>
                  <span
                    className="category-badge"
                    style={{
                      backgroundColor: CATEGORY_COLORS[selectedSet.category]?.bg || '#e2e8f0',
                      color: CATEGORY_COLORS[selectedSet.category]?.color || '#4a5568',
                    }}
                  >
                    {CATEGORY_LABELS[selectedSet.category] || selectedSet.category}
                  </span>
                </div>

                <div className="panel-actions">
                  <button
                    className="btn btn-create"
                    onClick={() => {
                      setShowAddForm(true);
                      setEditingComponent(null);
                      resetForm();
                    }}
                  >
                    + Add Component
                  </button>
                </div>

                {/* Add Component Form */}
                {showAddForm && (
                  <div className="add-form-card">
                    <h4>Add Component to Set</h4>
                    <div className="search-box">
                      <input
                        type="text"
                        placeholder="Search catalog items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="available-items">
                      {availableItems.length === 0 ? (
                        <p className="empty-message">
                          {searchTerm ? 'No matching items found.' : 'No available items.'}
                        </p>
                      ) : (
                        availableItems.slice(0, 30).map(item => (
                          <div
                            key={item.id}
                            className={`item-option ${selectedCatalogId === item.id ? 'selected' : ''}`}
                            onClick={() => setSelectedCatalogId(item.id)}
                          >
                            <span className="item-name">{item.name}</span>
                            <span
                              className="category-badge small"
                              style={{
                                backgroundColor: CATEGORY_COLORS[item.category]?.bg || '#e2e8f0',
                                color: CATEGORY_COLORS[item.category]?.color || '#4a5568',
                              }}
                            >
                              {CATEGORY_LABELS[item.category] || item.category}
                            </span>
                          </div>
                        ))
                      )}
                      {availableItems.length > 30 && (
                        <p className="limit-message">Use search to narrow down results</p>
                      )}
                    </div>
                    {selectedCatalogId && (
                      <div className="quantity-fields">
                        <div className="field">
                          <label>Required Qty</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.requiredQuantity}
                            onChange={(e) => setFormData({ ...formData, requiredQuantity: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="field">
                          <label>Optional Qty</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.optionalQuantity}
                            onChange={(e) => setFormData({ ...formData, optionalQuantity: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="field wide">
                          <label>Notes</label>
                          <input
                            type="text"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Optional notes..."
                          />
                        </div>
                      </div>
                    )}
                    <div className="form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleAddComponent}
                        disabled={!selectedCatalogId}
                      >
                        Add Component
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowAddForm(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit Component Form */}
                {editingComponent && (
                  <div className="add-form-card">
                    <h4>Edit: {editingComponent.componentName}</h4>
                    <div className="quantity-fields">
                      <div className="field">
                        <label>Required Qty</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.requiredQuantity}
                          onChange={(e) => setFormData({ ...formData, requiredQuantity: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="field">
                        <label>Optional Qty</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.optionalQuantity}
                          onChange={(e) => setFormData({ ...formData, optionalQuantity: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="field wide">
                        <label>Notes</label>
                        <input
                          type="text"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Optional notes..."
                        />
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-primary" onClick={handleUpdateComponent}>
                        Save Changes
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingComponent(null);
                          resetForm();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Components Table */}
                {loadingComponents ? (
                  <div className="loading">Loading components...</div>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Category</th>
                          <th>Required</th>
                          <th>Optional</th>
                          <th>Notes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="empty-state">
                              No components defined. Click &quot;Add Component&quot; to define expected items.
                            </td>
                          </tr>
                        ) : (
                          components.map(comp => (
                            <tr key={comp.id}>
                              <td className="name-cell">
                                <div>{comp.componentName}</div>
                                {comp.componentManufacturer && (
                                  <div className="meta">{comp.componentManufacturer}</div>
                                )}
                              </td>
                              <td>
                                <span
                                  className="category-badge"
                                  style={{
                                    backgroundColor: CATEGORY_COLORS[comp.componentCategory]?.bg || '#e2e8f0',
                                    color: CATEGORY_COLORS[comp.componentCategory]?.color || '#4a5568',
                                  }}
                                >
                                  {CATEGORY_LABELS[comp.componentCategory] || comp.componentCategory}
                                </span>
                              </td>
                              <td className="qty-cell">{comp.requiredQuantity}</td>
                              <td className="qty-cell">{comp.optionalQuantity}</td>
                              <td className="notes-cell">{comp.notes || '-'}</td>
                              <td className="actions-cell">
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openEditForm(comp)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemoveComponent(comp.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .sets-page {
          padding: 2rem 0;
        }

        .page-header {
          margin-bottom: 1.5rem;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }

        .breadcrumb a {
          color: #4299e1;
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb .separator {
          color: #718096;
        }

        .description {
          color: #718096;
          margin: 0.5rem 0;
          font-size: 0.875rem;
        }

        .sets-layout {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 1.5rem;
          align-items: start;
        }

        .sets-list-panel {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .sets-list-panel h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1rem;
        }

        .helper-text {
          font-size: 0.75rem;
          color: #718096;
          margin: 0 0 0.75rem 0;
        }

        .sets-list {
          max-height: 600px;
          overflow-y: auto;
        }

        .set-item {
          padding: 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          border: 1px solid transparent;
          margin-bottom: 0.25rem;
        }

        .set-item:hover {
          background: #f8f9fa;
        }

        .set-item.selected {
          background: #ebf8ff;
          border-color: #4299e1;
        }

        .set-name {
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .set-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
        }

        .component-count {
          color: #718096;
        }

        .components-panel {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          min-height: 400px;
        }

        .empty-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          color: #718096;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .panel-header h3 {
          margin: 0;
        }

        .panel-actions {
          margin-bottom: 1rem;
        }

        .add-form-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .add-form-card h4 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
        }

        .search-box {
          margin-bottom: 0.75rem;
        }

        .search-box input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        .available-items {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          margin-bottom: 0.75rem;
        }

        .item-option {
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .item-option:hover {
          background: #ebf8ff;
        }

        .item-option.selected {
          background: #bee3f8;
        }

        .item-name {
          font-weight: 500;
        }

        .limit-message {
          padding: 0.5rem;
          text-align: center;
          font-size: 0.75rem;
          color: #718096;
          background: #f8f9fa;
        }

        .quantity-fields {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .field.wide {
          flex: 1;
          min-width: 200px;
        }

        .field label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #4a5568;
        }

        .field input {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        .field input[type="number"] {
          width: 80px;
        }

        .form-actions {
          display: flex;
          gap: 0.5rem;
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table th {
          background: #f8f9fa;
          font-weight: 600;
        }

        .data-table tr:hover {
          background: #f8f9fa;
        }

        .name-cell {
          font-weight: 500;
        }

        .name-cell .meta {
          font-size: 0.75rem;
          color: #718096;
          font-weight: normal;
        }

        .qty-cell {
          text-align: center;
          font-family: monospace;
        }

        .notes-cell {
          font-size: 0.875rem;
          color: #718096;
          max-width: 200px;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .empty-message {
          padding: 1rem;
          text-align: center;
          color: #718096;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
        }

        .category-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .category-badge.small {
          padding: 0.125rem 0.375rem;
          font-size: 0.625rem;
        }

        .btn-danger {
          background: #e53e3e;
          color: white;
        }

        .btn-danger:hover {
          background: #c53030;
        }

        @media (max-width: 900px) {
          .sets-layout {
            grid-template-columns: 1fr;
          }

          .sets-list-panel {
            max-height: 300px;
            overflow-y: auto;
          }
        }
      `}</style>
    </>
  );
}
