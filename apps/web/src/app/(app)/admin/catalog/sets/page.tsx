'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageAlerts } from '@/app/components/Alert';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogSets,
  getSetComponents,
  getCatalogItems,
  addSetComponent,
  updateSetComponent,
  removeSetComponent,
  createCatalogSet,
  type CatalogSet,
  type SetComponent,
  type CatalogItem,
  type ItemCategory,
  type CreateContainerRequest,
} from '@/lib/api';

/**
 * LAW NOTICE: Catalog Set Components define EXPECTED composition only.
 * They DO NOT assert physical state, presence, readiness, or verification.
 * See docs/LAW/catalog.md v2.1 Amendment.
 */

// LAW catalog.md v2.0 Section 4A: Engine Category
// Using CSS variables for dark mode support
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  IMPLANT: { bg: 'var(--category-implant-bg)', color: 'var(--category-implant-text)' },
  INSTRUMENT: { bg: 'var(--category-instrument-bg)', color: 'var(--category-instrument-text)' },
  EQUIPMENT: { bg: 'var(--category-equipment-bg)', color: 'var(--category-equipment-text)' },
  MEDICATION: { bg: 'var(--category-medication-bg)', color: 'var(--category-medication-text)' },
  CONSUMABLE: { bg: 'var(--category-consumable-bg)', color: 'var(--category-consumable-text)' },
  PPE: { bg: 'var(--category-ppe-bg)', color: 'var(--category-ppe-text)' },
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
  const [showCreateSetModal, setShowCreateSetModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SetComponent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [formData, setFormData] = useState({
    requiredQuantity: 1,
    optionalQuantity: 0,
    notes: '',
  });
  const [createSetForm, setCreateSetForm] = useState<CreateContainerRequest>({
    name: '',
    category: 'INSTRUMENT',
  });
  const [isCreatingSet, setIsCreatingSet] = useState(false);

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

  const handleCreateSet = async () => {
    if (!token || !createSetForm.name.trim()) return;

    setIsCreatingSet(true);
    await withErrorHandling(
      () => createCatalogSet(token, createSetForm),
      setError,
      (result) => {
        setSuccessMessage('Set/Tray created');
        setShowCreateSetModal(false);
        setCreateSetForm({ name: '', category: 'INSTRUMENT' });
        setSelectedSetId(result.set.id);
        refetch();
      }
    );
    setIsCreatingSet(false);
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

      <main className="container-full sets-page">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="catalog-nav">
          <Link href="/admin/catalog" className="nav-link">Items</Link>
          <Link href="/admin/catalog/groups" className="nav-link">Groups</Link>
          <Link href="/admin/catalog/sets" className="nav-link active">Set Definitions</Link>
        </div>

        <div className="sets-page-header">
          <div className="header-row">
            <Breadcrumbs items={[
              { label: 'Catalog', href: '/admin/catalog' },
              { label: 'Set Definitions' },
            ]} />
            <button
              className="btn btn-create"
              onClick={() => setShowCreateSetModal(true)}
            >
              + Create Set / Tray
            </button>
          </div>
          <p className="description">
            Define expected contents for sets, trays, and kits.
            <br />
            <strong>Note:</strong> Set definitions declare expectations only — they do not verify physical presence or readiness.
          </p>
        </div>

        <div className="sets-layout">
          {/* Left: Set List */}
          <div className="sets-list-panel">
            <h3>Sets / Trays</h3>
            <p className="helper-text">Select a container to define its expected contents</p>
            <div className="sets-list">
              {sets.length === 0 ? (
                <p className="empty-message">No sets or trays found. Click &quot;Create Set / Tray&quot; to add one.</p>
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
                          backgroundColor: CATEGORY_COLORS[set.category]?.bg || 'var(--category-default-bg)',
                          color: CATEGORY_COLORS[set.category]?.color || 'var(--category-default-text)',
                        }}
                      >
                        {CATEGORY_LABELS[set.category] || set.category}
                      </span>
                      {set.componentCount > 0 && (
                        <span className="component-count">{set.componentCount} items</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Expected Contents Panel */}
          <div className="components-panel">
            {!selectedSet ? (
              <div className="empty-panel">
                <p>Select a set or tray to view or define its expected contents</p>
              </div>
            ) : (
              <>
                <div className="panel-header">
                  <h3>{selectedSet.name}</h3>
                  <span
                    className="category-badge"
                    style={{
                      backgroundColor: CATEGORY_COLORS[selectedSet.category]?.bg || 'var(--category-default-bg)',
                      color: CATEGORY_COLORS[selectedSet.category]?.color || 'var(--category-default-text)',
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
                    + Add Item to Set
                  </button>
                </div>

                {/* Add Item Form */}
                {showAddForm && (
                  <div className="add-form-card">
                    <h4>Add Item to Set</h4>
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
                                backgroundColor: CATEGORY_COLORS[item.category]?.bg || 'var(--category-default-bg)',
                                color: CATEGORY_COLORS[item.category]?.color || 'var(--category-default-text)',
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
                        Add to Set
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

                {/* Expected Contents Table */}
                {loadingComponents ? (
                  <div className="loading">Loading expected contents...</div>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Expected Item</th>
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
                              No expected contents defined. Click &quot;Add Item to Set&quot; to define what this set should contain.
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
                                    backgroundColor: CATEGORY_COLORS[comp.componentCategory]?.bg || 'var(--category-default-bg)',
                                    color: CATEGORY_COLORS[comp.componentCategory]?.color || 'var(--category-default-text)',
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
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => openEditForm(comp)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger btn-xs"
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

        {/* Create Set/Tray Modal */}
        {showCreateSetModal && (
          <div className="modal-overlay" onClick={() => setShowCreateSetModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Create Set / Tray</h3>
              <p className="modal-description">
                Create a new container catalog item. Only Instrument or Equipment categories
                are allowed for sets and trays.
              </p>
              <div className="modal-form">
                <div className="field">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={createSetForm.name}
                    onChange={(e) => setCreateSetForm({ ...createSetForm, name: e.target.value })}
                    placeholder="e.g., Spine Instrument Tray"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Category *</label>
                  <select
                    value={createSetForm.category}
                    onChange={(e) => setCreateSetForm({ ...createSetForm, category: e.target.value as 'INSTRUMENT' | 'EQUIPMENT' })}
                  >
                    <option value="INSTRUMENT">Instrument</option>
                    <option value="EQUIPMENT">Equipment</option>
                  </select>
                </div>
                <div className="field">
                  <label>Manufacturer</label>
                  <input
                    type="text"
                    value={createSetForm.manufacturer || ''}
                    onChange={(e) => setCreateSetForm({ ...createSetForm, manufacturer: e.target.value || undefined })}
                    placeholder="Optional"
                  />
                </div>
                <div className="field">
                  <label>Catalog Number</label>
                  <input
                    type="text"
                    value={createSetForm.catalogNumber || ''}
                    onChange={(e) => setCreateSetForm({ ...createSetForm, catalogNumber: e.target.value || undefined })}
                    placeholder="Optional"
                  />
                </div>
                <div className="field">
                  <label>Description</label>
                  <input
                    type="text"
                    value={createSetForm.description || ''}
                    onChange={(e) => setCreateSetForm({ ...createSetForm, description: e.target.value || undefined })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleCreateSet}
                  disabled={!createSetForm.name.trim() || isCreatingSet}
                >
                  {isCreatingSet ? 'Creating...' : 'Create Set'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateSetModal(false);
                    setCreateSetForm({ name: '', category: 'INSTRUMENT' });
                  }}
                  disabled={isCreatingSet}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .sets-page {
          padding: 2rem 1.5rem;
        }

        .catalog-nav {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-default);
          padding-bottom: 0.75rem;
        }

        .catalog-nav :global(.nav-link) {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          text-decoration: none;
          color: var(--text-secondary);
          font-weight: 500;
          transition: background 0.2s, color 0.2s;
        }

        .catalog-nav :global(.nav-link:hover) {
          background: var(--surface-secondary);
        }

        .catalog-nav :global(.nav-link.active) {
          background: var(--color-blue-500);
          color: var(--text-on-primary);
        }

        .sets-page-header {
          margin-bottom: 1.5rem;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }

        .breadcrumb a {
          color: var(--color-blue-500);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb .separator {
          color: var(--text-muted);
        }

        .description {
          color: var(--text-muted);
          margin: 0.15rem 0;
          font-size: 0.875rem;
          text-align: start;
        }

        .sets-layout {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 1.5rem;
          align-items: start;
        }

        .sets-list-panel {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px var(--shadow-sm);
        }

        .sets-list-panel h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1rem;
          color: var(--text-primary);
        }

        .helper-text {
          font-size: 0.75rem;
          color: var(--text-muted);
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
          background: var(--surface-secondary);
        }

        .set-item.selected {
          background: var(--color-blue-50);
          border-color: var(--color-blue-500);
        }

        .set-name {
          font-weight: 500;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .set-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
        }

        .component-count {
          color: var(--text-muted);
        }

        .components-panel {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px var(--shadow-sm);
          min-height: 400px;
        }

        .empty-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          color: var(--text-muted);
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .panel-header h3 {
          margin: 0;
          color: var(--text-primary);
        }

        .panel-actions {
          margin-bottom: 1rem;
        }

        .add-form-card {
          background: var(--surface-secondary);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .add-form-card h4 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: var(--text-primary);
        }

        .search-box {
          margin-bottom: 0.75rem;
        }

        .search-box input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border-default);
          border-radius: 4px;
          background: var(--surface-primary);
          color: var(--text-primary);
        }

        .available-items {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid var(--border-default);
          border-radius: 4px;
          margin-bottom: 0.75rem;
          background: var(--surface-primary);
        }

        .item-option {
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--text-primary);
        }

        .item-option:hover {
          background: var(--color-blue-50);
        }

        .item-option.selected {
          background: var(--color-blue-100);
        }

        .item-name {
          font-weight: 500;
        }

        .limit-message {
          padding: 0.5rem;
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-muted);
          background: var(--surface-secondary);
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
          color: var(--text-secondary);
        }

        .field input {
          padding: 0.5rem;
          border: 1px solid var(--border-default);
          border-radius: 4px;
          background: var(--surface-primary);
          color: var(--text-primary);
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
          border-bottom: 1px solid var(--border-default);
          color: var(--text-primary);
        }

        .data-table th {
          background: var(--surface-secondary);
          font-weight: 600;
        }

        .data-table tr:hover {
          background: var(--surface-secondary);
        }

        .name-cell {
          font-weight: 500;
        }

        .name-cell .meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: normal;
        }

        .qty-cell {
          text-align: center;
          font-family: monospace;
        }

        .notes-cell {
          font-size: 0.875rem;
          color: var(--text-muted);
          max-width: 200px;
        }

        .empty-state {
          text-align: center;
          color: var(--text-muted);
          padding: 2rem !important;
        }

        .empty-message {
          padding: 1rem;
          text-align: center;
          color: var(--text-muted);
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
          background: var(--color-red);
          color: var(--text-on-primary);
        }

        .btn-danger:hover {
          background: var(--color-red-700);
        }

        @media (max-width: 900px) {
          .sets-layout {
            grid-template-columns: 1fr;
          }

          .sets-list-panel {
            max-height: 300px;
            overflow-y: auto;
          }

          .header-row {
            flex-direction: column;
          }
        }

        /* Modal styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--shadow-overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1.5rem;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px var(--shadow-md);
        }

        .modal h3 {
          margin: 0 0 0.5rem 0;
          color: var(--text-primary);
        }

        .modal-description {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .modal-form .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .modal-form .field label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .modal-form .field input,
        .modal-form .field select {
          padding: 0.5rem;
          border: 1px solid var(--border-default);
          border-radius: 4px;
          font-size: 1rem;
          background: var(--surface-primary);
          color: var(--text-primary);
        }

        .modal-form .field input:focus,
        .modal-form .field select:focus {
          outline: none;
          border-color: var(--color-blue-500);
          box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
        }

        .modal-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }
      `}</style>
    </>
  );
}
