'use client';

import { useState } from 'react';
import { Header } from '@/app/components/Header';
import { PageAlerts } from '@/app/components/Alert';
import { StatusBadge } from '@/app/components/StatusBadge';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  deactivateCatalogItem,
  activateCatalogItem,
  type CatalogItem,
  type ItemCategory,
  type CreateCatalogItemRequest,
  type UpdateCatalogItemRequest,
} from '@/lib/api';

const CATEGORIES: ItemCategory[] = ['IMPLANT', 'INSTRUMENT', 'HIGH_VALUE_SUPPLY', 'LOANER'];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  IMPLANT: 'Implant',
  INSTRUMENT: 'Instrument',
  HIGH_VALUE_SUPPLY: 'High-Value Supply',
  LOANER: 'Loaner',
};

const CATEGORY_COLORS: Record<ItemCategory, { bg: string; color: string }> = {
  IMPLANT: { bg: '#feebc8', color: '#c05621' },
  INSTRUMENT: { bg: '#bee3f8', color: '#2b6cb0' },
  HIGH_VALUE_SUPPLY: { bg: '#e9d8fd', color: '#6b46c1' },
  LOANER: { bg: '#fed7e2', color: '#c53030' },
};

export default function AdminCatalogPage() {
  // Filter state (managed locally since it affects data fetching)
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ItemCategory | ''>('');

  // Use shared hook for data loading, auth, and error handling
  const {
    data,
    isLoading,
    isLoadingData,
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
      const result = await getCatalogItems(token, {
        category: filterCategory || undefined,
        includeInactive: showInactive,
      });
      return result.items;
    },
    requiredRoles: ['ADMIN'],
    deps: [showInactive, filterCategory],
  });

  const items = data || [];

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [formData, setFormData] = useState<Partial<CreateCatalogItemRequest>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    await withErrorHandling(
      () => createCatalogItem(token, formData as CreateCatalogItemRequest),
      setError,
      () => {
        setSuccessMessage('Catalog item created successfully');
        setShowCreateForm(false);
        setFormData({});
        refetch();
      }
    );
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingItem) return;

    const updateData: UpdateCatalogItemRequest = {};
    if (formData.name && formData.name !== editingItem.name) {
      updateData.name = formData.name;
    }
    if (formData.description !== editingItem.description) {
      updateData.description = formData.description || null;
    }
    if (formData.category && formData.category !== editingItem.category) {
      updateData.category = formData.category;
    }
    if (formData.manufacturer !== editingItem.manufacturer) {
      updateData.manufacturer = formData.manufacturer || null;
    }
    if (formData.catalogNumber !== editingItem.catalogNumber) {
      updateData.catalogNumber = formData.catalogNumber || null;
    }
    if (formData.requiresSterility !== editingItem.requiresSterility) {
      updateData.requiresSterility = formData.requiresSterility;
    }
    if (formData.isLoaner !== editingItem.isLoaner) {
      updateData.isLoaner = formData.isLoaner;
    }

    await withErrorHandling(
      () => updateCatalogItem(token, editingItem.id, updateData),
      setError,
      () => {
        setSuccessMessage('Catalog item updated successfully');
        setEditingItem(null);
        setFormData({});
        refetch();
      }
    );
  };

  const handleDeactivate = async (itemId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this catalog item?')) return;

    await withErrorHandling(
      () => deactivateCatalogItem(token, itemId),
      setError,
      () => {
        setSuccessMessage('Catalog item deactivated successfully');
        refetch();
      }
    );
  };

  const handleActivate = async (itemId: string) => {
    if (!token) return;

    await withErrorHandling(
      () => activateCatalogItem(token, itemId),
      setError,
      () => {
        setSuccessMessage('Catalog item activated successfully');
        refetch();
      }
    );
  };

  const startEdit = (item: CatalogItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      category: item.category,
      manufacturer: item.manufacturer || '',
      catalogNumber: item.catalogNumber || '',
      requiresSterility: item.requiresSterility,
      isLoaner: item.isLoaner,
    });
    setShowCreateForm(false);
  };

  // Compute counts by category
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat).length;
    return acc;
  }, {} as Record<ItemCategory, number>);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (accessDenied) {
    return (
      <>
        <Header title="Catalog Management" />
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
      <Header title="Catalog Management" />

      <main className="container admin-catalog-page">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="summary-cards">
          {CATEGORIES.map(cat => (
            <div
              key={cat}
              className={`summary-card ${filterCategory === cat ? 'selected' : ''}`}
              onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              style={{
                borderColor: filterCategory === cat ? CATEGORY_COLORS[cat].color : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="summary-value"
                style={{ color: CATEGORY_COLORS[cat].color }}
              >
                {categoryCounts[cat]}
              </div>
              <div className="summary-label">{CATEGORY_LABELS[cat]}</div>
            </div>
          ))}
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowCreateForm(true);
              setEditingItem(null);
              setFormData({});
            }}
          >
            + Add Catalog Item
          </button>
          <div className="filters">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive items
            </label>
            {filterCategory && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setFilterCategory('')}
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingItem) && (
          <div className="form-card">
            <h2>{editingItem ? 'Edit Catalog Item' : 'Create New Catalog Item'}</h2>
            <form onSubmit={editingItem ? handleUpdate : handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Hip Prosthesis Model X"
                  />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                    required
                  >
                    <option value="">Select category...</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer || ''}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    placeholder="e.g., Stryker"
                  />
                </div>
                <div className="form-group">
                  <label>Catalog Number</label>
                  <input
                    type="text"
                    value={formData.catalogNumber || ''}
                    onChange={(e) => setFormData({ ...formData, catalogNumber: e.target.value })}
                    placeholder="e.g., SKU-12345"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.requiresSterility || false}
                      onChange={(e) => setFormData({ ...formData, requiresSterility: e.target.checked })}
                    />
                    Requires Sterility
                  </label>
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.isLoaner || false}
                      onChange={(e) => setFormData({ ...formData, isLoaner: e.target.checked })}
                    />
                    Is Loaner Item
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingItem(null);
                    setFormData({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Catalog Table */}
        {isLoadingData ? (
          <div className="loading">Loading catalog items...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Manufacturer</th>
                  <th>Catalog #</th>
                  <th>Sterility</th>
                  <th>Loaner</th>
                  <th>Inventory</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      No catalog items found. Create your first item to get started.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={!item.active ? 'inactive-row' : ''}>
                      <td className="name-cell">{item.name}</td>
                      <td>
                        <span
                          className="category-badge"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category].bg,
                            color: CATEGORY_COLORS[item.category].color,
                          }}
                        >
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td>{item.manufacturer || '-'}</td>
                      <td className="catalog-number">{item.catalogNumber || '-'}</td>
                      <td>{item.requiresSterility ? 'Yes' : 'No'}</td>
                      <td>{item.isLoaner ? 'Yes' : 'No'}</td>
                      <td>{item.inventoryCount}</td>
                      <td>
                        <StatusBadge
                          status={item.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        {item.active ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeactivate(item.id)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(item.id)}
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <style jsx>{`
        .admin-catalog-page {
          padding: 2rem 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .summary-card:hover {
          border-color: #e2e8f0;
        }

        .summary-card.selected {
          border-width: 2px;
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
        }

        .summary-label {
          font-size: 0.875rem;
          color: #718096;
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .form-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .form-card h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group input[type="text"],
        .form-group input[type="email"],
        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

        .data-table tr.inactive-row {
          opacity: 0.6;
        }

        .name-cell {
          font-weight: 500;
        }

        .catalog-number {
          font-family: monospace;
        }

        .category-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
        }

        .btn-danger {
          background: #e53e3e;
          color: white;
        }

        .btn-danger:hover {
          background: #c53030;
        }

        .btn-success {
          background: #38a169;
          color: white;
        }

        .btn-success:hover {
          background: #2f855a;
        }
      `}</style>
    </>
  );
}
