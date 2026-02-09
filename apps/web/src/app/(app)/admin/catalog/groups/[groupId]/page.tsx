'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
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
        <main className="container-full">
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

      <main className="container-full py-8">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="mb-6">
          <Breadcrumbs items={[
            { label: 'Catalog', href: '/admin/catalog' },
            { label: 'Groups', href: '/admin/catalog/groups' },
            { label: group.name },
          ]} />
          {group.description && (
            <p className="text-text-muted my-2">{group.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2">
            <StatusBadge
              status={group.active ? 'ACTIVE' : 'INACTIVE'}
              size="sm"
            />
            <span className="text-text-muted text-sm">{items.length} items</span>
          </div>
        </div>

        <div className="mb-6">
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
          <div className="bg-surface-primary rounded-lg p-6 mb-6 shadow-[0_1px_3px_var(--shadow-sm)]">
            <h3 className="mt-0 mb-4 text-text-primary">Add Catalog Items to Group</h3>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by name, manufacturer, or catalog number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 border border-border rounded text-base bg-surface-primary text-text-primary"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto border border-border rounded mb-4 bg-surface-primary">
              {availableItems.length === 0 ? (
                <p className="p-8 text-center text-text-muted">
                  {searchTerm
                    ? 'No matching items found.'
                    : 'All catalog items are already in this group.'}
                </p>
              ) : (
                <>
                  <div className="p-2">
                    {availableItems.slice(0, 50).map(item => (
                      <label key={item.id} className="flex items-center gap-3 p-2 rounded cursor-pointer text-text-primary hover:bg-surface-secondary">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium">{item.name}</span>
                          <span className="flex gap-2 text-xs text-text-muted">
                            {item.manufacturer && <span>{item.manufacturer}</span>}
                            {item.catalogNumber && <span className="font-mono">{item.catalogNumber}</span>}
                          </span>
                        </span>
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category]?.bg || 'var(--category-default-bg)',
                            color: CATEGORY_COLORS[item.category]?.color || 'var(--category-default-text)',
                          }}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </label>
                    ))}
                  </div>
                  {availableItems.length > 50 && (
                    <p className="p-2 text-center text-text-muted text-sm bg-surface-secondary">
                      Showing first 50 results. Use search to narrow down.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-4">
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
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_var(--shadow-sm)] overflow-x-auto">
            <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_th]:text-text-primary [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_td]:text-text-primary [&_tr:hover]:bg-surface-secondary">
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
                    <td colSpan={6} className="!text-center text-text-muted !p-8">
                      No items in this group yet. Click &quot;Add Items&quot; to add catalog items.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={!item.active ? 'opacity-60' : ''}>
                      <td className="font-medium">{item.name}</td>
                      <td>
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category]?.bg || 'var(--category-default-bg)',
                            color: CATEGORY_COLORS[item.category]?.color || 'var(--category-default-text)',
                          }}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </td>
                      <td>{item.manufacturer || '-'}</td>
                      <td className="font-mono">{item.catalogNumber || '-'}</td>
                      <td>
                        <StatusBadge
                          status={item.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          Remove
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
