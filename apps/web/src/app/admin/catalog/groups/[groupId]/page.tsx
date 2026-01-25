'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { PageAlerts } from '@/app/components/Alert';
import { StatusBadge } from '@/app/components/StatusBadge';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogGroups,
  getCatalogGroupItems,
  getCatalogItems,
  addCatalogGroupItems,
  removeCatalogGroupItem,
  type CatalogGroup,
  type CatalogGroupItem,
  type CatalogItem,
} from '@/lib/api';

// LAW catalog.md v2.0 §4A: Engine Category
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  IMPLANT: { bg: '#feebc8', color: '#c05621' },      // Orange
  INSTRUMENT: { bg: '#bee3f8', color: '#2b6cb0' },   // Blue
  EQUIPMENT: { bg: '#c6f6d5', color: '#276749' },    // Green
  MEDICATION: { bg: '#fed7e2', color: '#c53030' },   // Red
  CONSUMABLE: { bg: '#e9d8fd', color: '#6b46c1' },   // Purple
  PPE: { bg: '#faf089', color: '#975a16' },          // Yellow
};

const CATEGORY_LABELS: Record<string, string> = {
  IMPLANT: 'Implant',
  INSTRUMENT: 'Instrument',
  EQUIPMENT: 'Equipment',
  MEDICATION: 'Medication',
  CONSUMABLE: 'Consumable',
  PPE: 'PPE',
};

export default function CatalogGroupDetailPage() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [group, setGroup] = useState<CatalogGroup | null>(null);

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
      const [groupsResult, itemsResult] = await Promise.all([
        getCatalogGroups(token, true),
        getCatalogGroupItems(token, groupId, true),
      ]);
      const foundGroup = groupsResult.groups.find(g => g.id === groupId);
      setGroup(foundGroup || null);
      return itemsResult.items;
    },
    requiredRoles: ['ADMIN'],
    deps: [groupId],
  });

  const items = data || [];

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

  const handleAddItems = async () => {
    if (!token || selectedItems.length === 0) return;

    await withErrorHandling(
      () => addCatalogGroupItems(token, groupId, selectedItems),
      setError,
      (result) => {
        setSuccessMessage(`Added ${result.addedCount} item(s) to group`);
        setShowAddForm(false);
        setSelectedItems([]);
        refetch();
      }
    );
  };

  const handleRemoveItem = async (catalogId: string) => {
    if (!token) return;
    if (!confirm('Remove this item from the group?')) return;

    await withErrorHandling(
      () => removeCatalogGroupItem(token, groupId, catalogId),
      setError,
      () => {
        setSuccessMessage('Item removed from group');
        refetch();
      }
    );
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Filter catalog items for add form (exclude already in group)
  const existingIds = new Set(items.map(i => i.id));
  const availableItems = allCatalogItems
    .filter(item => !existingIds.has(item.id))
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
        <Header title="Group Details" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <Header title="Group Details" />
        <main className="container">
          <div className="alert alert-error">Group not found.</div>
          <Link href="/admin/catalog/groups" className="btn btn-secondary">
            Back to Groups
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title={group.name} />

      <main className="container group-detail-page">
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
            <Link href="/admin/catalog/groups">Groups</Link>
            <span className="separator">/</span>
            <span>{group.name}</span>
          </div>
          {group.description && (
            <p className="description">{group.description}</p>
          )}
          <div className="group-meta">
            <StatusBadge
              status={group.active ? 'ACTIVE' : 'INACTIVE'}
              size="sm"
            />
            <span className="item-count">{items.length} items</span>
          </div>
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-create"
            onClick={() => {
              setShowAddForm(true);
              setSearchTerm('');
              setSelectedItems([]);
            }}
          >
            + Add Items
          </button>
        </div>

        {/* Add Items Form */}
        {showAddForm && (
          <div className="add-form-card">
            <h3>Add Catalog Items to Group</h3>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name, manufacturer, or catalog number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="available-items">
              {availableItems.length === 0 ? (
                <p className="empty-message">
                  {searchTerm
                    ? 'No matching items found.'
                    : 'All catalog items are already in this group.'}
                </p>
              ) : (
                <>
                  <div className="items-list">
                    {availableItems.slice(0, 50).map(item => (
                      <label key={item.id} className="item-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                        />
                        <span className="item-info">
                          <span className="item-name">{item.name}</span>
                          <span className="item-meta">
                            {item.manufacturer && <span>{item.manufacturer}</span>}
                            {item.catalogNumber && <span className="catalog-num">{item.catalogNumber}</span>}
                          </span>
                        </span>
                        <span
                          className="category-badge"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category]?.bg || '#e2e8f0',
                            color: CATEGORY_COLORS[item.category]?.color || '#4a5568',
                          }}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </label>
                    ))}
                  </div>
                  {availableItems.length > 50 && (
                    <p className="limit-message">
                      Showing first 50 results. Use search to narrow down.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleAddItems}
                disabled={selectedItems.length === 0}
              >
                Add {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setSelectedItems([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Group Items Table */}
        {isLoadingData ? (
          <div className="loading">Loading items...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Manufacturer</th>
                  <th>Catalog #</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      No items in this group yet. Click &quot;Add Items&quot; to add catalog items.
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
                            backgroundColor: CATEGORY_COLORS[item.category]?.bg || '#e2e8f0',
                            color: CATEGORY_COLORS[item.category]?.color || '#4a5568',
                          }}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </td>
                      <td>{item.manufacturer || '-'}</td>
                      <td className="catalog-number">{item.catalogNumber || '-'}</td>
                      <td>
                        <StatusBadge
                          status={item.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveItem(item.id)}
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
      </main>

      <style jsx>{`
        .group-detail-page {
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
        }

        .group-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .item-count {
          color: #718096;
          font-size: 0.875rem;
        }

        .actions-bar {
          margin-bottom: 1.5rem;
        }

        .add-form-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .add-form-card h3 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .search-box {
          margin-bottom: 1rem;
        }

        .search-box input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .available-items {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .items-list {
          padding: 0.5rem;
        }

        .item-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          border-radius: 4px;
          cursor: pointer;
        }

        .item-checkbox:hover {
          background: #f8f9fa;
        }

        .item-checkbox input {
          flex-shrink: 0;
        }

        .item-info {
          flex: 1;
          min-width: 0;
        }

        .item-name {
          display: block;
          font-weight: 500;
        }

        .item-meta {
          display: flex;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #718096;
        }

        .catalog-num {
          font-family: monospace;
        }

        .empty-message {
          padding: 2rem;
          text-align: center;
          color: #718096;
        }

        .limit-message {
          padding: 0.5rem;
          text-align: center;
          color: #718096;
          font-size: 0.875rem;
          background: #f8f9fa;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
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
      `}</style>
    </>
  );
}
