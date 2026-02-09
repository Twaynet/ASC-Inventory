'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  getInventoryItemHistory,
  type InventoryItem,
  type InventoryItemDetail,
  type InventoryItemEvent,
  type CreateInventoryItemRequest,
  type UpdateInventoryItemRequest,
} from '@/lib/api/inventory';
import { getCatalogItems, type CatalogItem } from '@/lib/api/catalog';
import { getLocations, type Location } from '@/lib/api/settings';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  AVAILABLE: { bg: '#c6f6d5', color: '#276749' },
  RESERVED: { bg: '#feebc8', color: '#c05621' },
  IN_USE: { bg: '#bee3f8', color: '#2b6cb0' },
  UNAVAILABLE: { bg: '#fed7d7', color: '#c53030' },
};

const STERILITY_STATUSES = ['STERILE', 'NON_STERILE', 'EXPIRED', 'UNKNOWN'];

const EXPIRY_WINDOW_DAYS = 30;
type ExpiryFilter = '' | 'EXPIRED' | 'EXPIRING_SOON';

function isItemExpired(item: InventoryItem): boolean {
  if (!item.sterilityExpiresAt) return false;
  if (item.availabilityStatus === 'UNAVAILABLE' || item.availabilityStatus === 'MISSING') return false;
  return new Date(item.sterilityExpiresAt) < new Date();
}

function isItemExpiringSoon(item: InventoryItem): boolean {
  if (!item.sterilityExpiresAt) return false;
  if (item.availabilityStatus === 'UNAVAILABLE' || item.availabilityStatus === 'MISSING') return false;
  const expiresAt = new Date(item.sterilityExpiresAt);
  const now = new Date();
  const cutoff = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return expiresAt >= now && expiresAt <= cutoff;
}

export default function AdminInventoryPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep link support: ?expiry=EXPIRED or ?expiry=EXPIRING_SOON
  const urlExpiry = searchParams.get('expiry') as ExpiryFilter | null;
  const initialExpiry: ExpiryFilter =
    urlExpiry === 'EXPIRED' || urlExpiry === 'EXPIRING_SOON' ? urlExpiry : '';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState(initialExpiry ? '' : '');
  const [filterExpiry, setFilterExpiry] = useState<ExpiryFilter>(initialExpiry);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemDetail | null>(null);
  const [formData, setFormData] = useState<Partial<CreateInventoryItemRequest>>({});

  // History modal
  const [viewingHistoryItem, setViewingHistoryItem] = useState<InventoryItem | null>(null);
  const [historyEvents, setHistoryEvents] = useState<InventoryItemEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [itemsResult, catalogResult, locationsResult] = await Promise.all([
        getInventoryItems(token, {
          catalogId: filterCatalog || undefined,
          locationId: filterLocation || undefined,
          status: filterStatus || undefined,
        }),
        getCatalogItems(token),
        getLocations(token),
      ]);
      setItems(itemsResult.items);
      setCatalogItems(catalogResult.items);
      setLocations(locationsResult.locations);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, filterCatalog, filterLocation, filterStatus]);

  useEffect(() => {
    if (token && hasRole('ADMIN')) {
      loadData();
    }
  }, [token, hasRole, loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const submitData = { ...formData };
      // Convert date-only string to ISO datetime for Zod validation
      if (submitData.sterilityExpiresAt && !submitData.sterilityExpiresAt.includes('T')) {
        submitData.sterilityExpiresAt = new Date(submitData.sterilityExpiresAt).toISOString();
      }
      await createInventoryItem(token, submitData as CreateInventoryItemRequest);
      setSuccessMessage('Inventory item created successfully');
      setShowCreateForm(false);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create inventory item');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingItem) return;

    try {
      const updateData: UpdateInventoryItemRequest = {};
      if (formData.locationId !== editingItem.locationId) {
        updateData.locationId = formData.locationId || null;
      }
      if (formData.sterilityStatus && formData.sterilityStatus !== editingItem.sterilityStatus) {
        updateData.sterilityStatus = formData.sterilityStatus;
      }
      if (formData.sterilityExpiresAt !== editingItem.sterilityExpiresAt) {
        let expVal = formData.sterilityExpiresAt || null;
        if (expVal && !expVal.includes('T')) {
          expVal = new Date(expVal).toISOString();
        }
        updateData.sterilityExpiresAt = expVal;
      }
      if (formData.barcode !== editingItem.barcode) {
        updateData.barcode = formData.barcode || null;
      }
      if (formData.serialNumber !== editingItem.serialNumber) {
        updateData.serialNumber = formData.serialNumber || null;
      }
      if (formData.lotNumber !== editingItem.lotNumber) {
        updateData.lotNumber = formData.lotNumber || null;
      }

      await updateInventoryItem(token, editingItem.id, updateData);
      setSuccessMessage('Inventory item updated successfully');
      setEditingItem(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update inventory item');
    }
  };

  const startEdit = async (item: InventoryItem) => {
    if (!token) return;
    try {
      const result = await getInventoryItem(token, item.id);
      const detail = result.item;
      setEditingItem(detail);
      setFormData({
        locationId: detail.locationId || undefined,
        sterilityStatus: detail.sterilityStatus,
        sterilityExpiresAt: detail.sterilityExpiresAt || undefined,
        barcode: detail.barcode || '',
        serialNumber: detail.serialNumber || '',
        lotNumber: detail.lotNumber || '',
      });
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item details');
    }
  };

  const viewHistory = async (item: InventoryItem) => {
    if (!token) return;
    setViewingHistoryItem(item);
    setIsLoadingHistory(true);
    try {
      const result = await getInventoryItemHistory(token, item.id);
      setHistoryEvents(result.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Compute expiry counts from loaded items
  const expiryCounts = useMemo(() => {
    let expired = 0;
    let expiringSoon = 0;
    for (const item of items) {
      if (isItemExpired(item)) expired++;
      else if (isItemExpiringSoon(item)) expiringSoon++;
    }
    return { expired, expiringSoon };
  }, [items]);

  // Client-side search + expiry filter
  const filteredItems = items.filter((item) => {
    // Expiry filter (client-side, date-based)
    if (filterExpiry === 'EXPIRED' && !isItemExpired(item)) return false;
    if (filterExpiry === 'EXPIRING_SOON' && !isItemExpiringSoon(item)) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.catalogName.toLowerCase().includes(q) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.serialNumber && item.serialNumber.toLowerCase().includes(q)) ||
      (item.locationName && item.locationName.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Compute status counts
  const statusCounts = items.reduce((acc, item) => {
    acc[item.availabilityStatus] = (acc[item.availabilityStatus] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Inventory Management" />
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
      <Header title="Inventory Management" />

      <main className="container-full admin-inventory-page">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="summary-cards">
          {['AVAILABLE', 'RESERVED', 'IN_USE', 'UNAVAILABLE'].map(status => (
            <div
              key={status}
              className={`summary-card ${filterStatus === status ? 'selected' : ''}`}
              onClick={() => {
                setFilterExpiry('');
                setFilterStatus(filterStatus === status ? '' : status);
              }}
              style={{
                borderColor: filterStatus === status ? STATUS_COLORS[status].color : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="summary-value"
                style={{ color: STATUS_COLORS[status].color }}
              >
                {statusCounts[status] || 0}
              </div>
              <div className="summary-label">{status.replace('_', ' ')}</div>
            </div>
          ))}
          <div
            className={`summary-card expiry-card expiry-expired ${filterExpiry === 'EXPIRED' ? 'selected' : ''} ${expiryCounts.expired > 0 ? 'has-items' : ''}`}
            onClick={() => {
              setFilterStatus('');
              setFilterExpiry(filterExpiry === 'EXPIRED' ? '' : 'EXPIRED');
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-value expiry-expired-value">
              {expiryCounts.expired}
            </div>
            <div className="summary-label">Expired</div>
          </div>
          <div
            className={`summary-card expiry-card expiry-soon ${filterExpiry === 'EXPIRING_SOON' ? 'selected' : ''} ${expiryCounts.expiringSoon > 0 ? 'has-items' : ''}`}
            onClick={() => {
              setFilterStatus('');
              setFilterExpiry(filterExpiry === 'EXPIRING_SOON' ? '' : 'EXPIRING_SOON');
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-value expiry-soon-value">
              {expiryCounts.expiringSoon}
            </div>
            <div className="summary-label">Expiring Soon</div>
          </div>
        </div>

        <div className="actions-bar">
          <div className="actions-left">
            <button
              className="btn btn-create btn-sm"
              onClick={() => {
                setShowCreateForm(true);
                setEditingItem(null);
                setFormData({});
              }}
            >
              + Add Inventory Item
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => router.push('/admin/inventory/check-in')}
            >
              Scanner Check-In
            </button>
          </div>
          <div className="filters">
            <input
              type="text"
              className="search-input"
              placeholder="Search name, barcode, serial, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              value={filterCatalog}
              onChange={(e) => setFilterCatalog(e.target.value)}
            >
              <option value="">All Catalog Items</option>
              {catalogItems.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            {(filterCatalog || filterLocation || filterStatus || filterExpiry || searchQuery) && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  setFilterCatalog('');
                  setFilterLocation('');
                  setFilterStatus('');
                  setFilterExpiry('');
                  setSearchQuery('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {filterExpiry && (
          <div className={`expiry-banner ${filterExpiry === 'EXPIRED' ? 'expiry-banner-critical' : 'expiry-banner-warning'}`}>
            {filterExpiry === 'EXPIRED'
              ? `Showing ${filteredItems.length} expired item${filteredItems.length !== 1 ? 's' : ''}`
              : `Showing ${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''} expiring within ${EXPIRY_WINDOW_DAYS} days`}
          </div>
        )}

        {/* Create/Edit Form */}
        {(showCreateForm || editingItem) && (
          <div className="form-card">
            <h2>{editingItem ? 'Edit Inventory Item' : 'Create New Inventory Item'}</h2>
            <form onSubmit={editingItem ? handleUpdate : handleCreate}>
              {!editingItem && (
                <div className="form-group">
                  <label>Catalog Item *</label>
                  <select
                    value={formData.catalogId || ''}
                    onChange={(e) => setFormData({ ...formData, catalogId: e.target.value })}
                    required
                  >
                    <option value="">Select catalog item...</option>
                    {catalogItems.filter(c => c.active).map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {editingItem && (
                <div className="form-group">
                  <label>Catalog Item</label>
                  <input type="text" value={editingItem.catalogName} disabled />
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Barcode</label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Scan or enter barcode"
                  />
                </div>
                <div className="form-group">
                  <label>Serial Number</label>
                  <input
                    type="text"
                    value={formData.serialNumber || ''}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    placeholder="Optional serial number"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Lot Number</label>
                  <input
                    type="text"
                    value={formData.lotNumber || ''}
                    onChange={(e) => setFormData({ ...formData, lotNumber: e.target.value })}
                    placeholder="Optional lot number"
                  />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <select
                    value={formData.locationId || ''}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value || undefined })}
                  >
                    <option value="">No location assigned</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Sterility Status</label>
                  <select
                    value={formData.sterilityStatus || ''}
                    onChange={(e) => setFormData({ ...formData, sterilityStatus: e.target.value })}
                  >
                    <option value="">Select status...</option>
                    {STERILITY_STATUSES.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sterility Expires At</label>
                  <input
                    type="date"
                    value={formData.sterilityExpiresAt ? formData.sterilityExpiresAt.split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, sterilityExpiresAt: e.target.value || undefined })}
                  />
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

        {/* Inventory Table */}
        {isLoadingData ? (
          <div className="loading">Loading inventory...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Catalog Item</th>
                  <th>Barcode</th>
                  <th>Serial #</th>
                  <th>Location</th>
                  <th>Sterility</th>
                  <th>Status</th>
                  <th>Last Verified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      {searchQuery ? 'No items match your search.' : 'No inventory items found.'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="name-cell">{item.catalogName}</td>
                      <td className="barcode">{item.barcode || '-'}</td>
                      <td className="serial">{item.serialNumber || '-'}</td>
                      <td>{item.locationName || '-'}</td>
                      <td>{item.sterilityStatus}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: STATUS_COLORS[item.availabilityStatus]?.bg || '#e2e8f0',
                            color: STATUS_COLORS[item.availabilityStatus]?.color || '#4a5568',
                          }}
                        >
                          {(item.availabilityStatus || 'UNKNOWN').replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {item.lastVerifiedAt
                          ? new Date(item.lastVerifiedAt).toLocaleDateString()
                          : '-'}
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => viewHistory(item)}
                        >
                          History
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

        {/* History Modal */}
        {viewingHistoryItem && (
          <div className="modal-overlay" onClick={() => setViewingHistoryItem(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Event History: {viewingHistoryItem.catalogName}</h2>
                <button
                  className="close-btn"
                  onClick={() => setViewingHistoryItem(null)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                {isLoadingHistory ? (
                  <div className="loading">Loading history...</div>
                ) : historyEvents.length === 0 ? (
                  <p className="empty-state">No events recorded for this item.</p>
                ) : (
                  <div className="history-list">
                    {historyEvents.map((event) => (
                      <div key={event.id} className="history-item">
                        <div className="history-time">
                          {new Date(event.occurredAt).toLocaleString()}
                        </div>
                        <div className="history-type">{event.eventType}</div>
                        <div className="history-actor">
                          {event.performedByName || 'System'}
                        </div>
                        {event.notes && (
                          <div className="history-data">
                            {event.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .admin-inventory-page {
          padding: 2rem 1.5rem;
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

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
        }

        .summary-label {
          font-size: 0.875rem;
          color: #718096;
          text-transform: capitalize;
        }

        /* Expiry cards — visual emphasis */
        .expiry-expired-value {
          color: #718096;
        }
        .expiry-expired.has-items .expiry-expired-value {
          color: #c53030;
        }
        .expiry-expired.has-items {
          border-color: #fc8181;
          background: #fff5f5;
        }
        .expiry-expired.selected {
          border-color: #c53030 !important;
        }

        .expiry-soon-value {
          color: #718096;
        }
        .expiry-soon.has-items .expiry-soon-value {
          color: #c05621;
        }
        .expiry-soon.has-items {
          border-color: #f6ad55;
          background: #fffaf0;
        }
        .expiry-soon.selected {
          border-color: #c05621 !important;
        }

        /* Expiry banner */
        .expiry-banner {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }
        .expiry-banner-critical {
          background: #fff5f5;
          border: 1px solid #fc8181;
          color: #c53030;
        }
        .expiry-banner-warning {
          background: #fffaf0;
          border: 1px solid #f6ad55;
          color: #c05621;
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .actions-left {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .search-input {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
          min-width: 260px;
        }

        .filters select {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
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

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group input:disabled {
          background: #f7fafc;
          color: #718096;
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

        .name-cell {
          font-weight: 500;
        }

        .barcode, .serial {
          font-family: monospace;
          font-size: 0.875rem;
        }

        .status-badge {
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


        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #718096;
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .history-item {
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .history-time {
          font-size: 0.75rem;
          color: #718096;
        }

        .history-type {
          font-weight: 600;
          margin: 0.25rem 0;
        }

        .history-actor {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .history-data {
          font-family: monospace;
          font-size: 0.75rem;
          color: #718096;
          margin-top: 0.5rem;
          word-break: break-all;
        }

        .alert-success {
          background: #c6f6d5;
          border: 1px solid #9ae6b4;
          color: #276749;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          cursor: pointer;
        }

        :global([data-theme="dark"]) .summary-card,
        :global([data-theme="dark"]) .form-card,
        :global([data-theme="dark"]) .table-container {
          background: var(--surface-secondary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        :global([data-theme="dark"]) .summary-card:hover {
          border-color: var(--border-default);
        }
        :global([data-theme="dark"]) .summary-label,
        :global([data-theme="dark"]) .empty-state {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .search-input,
        :global([data-theme="dark"]) .form-group input,
        :global([data-theme="dark"]) .form-group select,
        :global([data-theme="dark"]) .filters select {
          background: var(--surface-tertiary);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .form-group input:disabled {
          background: var(--surface-tertiary);
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .data-table th,
        :global([data-theme="dark"]) .data-table td {
          border-bottom-color: var(--border-default);
        }
        :global([data-theme="dark"]) .data-table th {
          background: var(--surface-tertiary);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .data-table tr:hover {
          background: var(--surface-tertiary);
        }
        :global([data-theme="dark"]) .modal {
          background: var(--surface-secondary);
        }
        :global([data-theme="dark"]) .modal-header {
          border-bottom-color: var(--border-default);
        }
        :global([data-theme="dark"]) .modal-header h2 {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .close-btn {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .history-item {
          background: var(--surface-tertiary);
        }
        :global([data-theme="dark"]) .history-time,
        :global([data-theme="dark"]) .history-data {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .history-actor {
          color: var(--text-secondary);
        }
        :global([data-theme="dark"]) .alert-success {
          background: #22543d;
          border-color: #276749;
          color: #c6f6d5;
        }
        :global([data-theme="dark"]) .expiry-expired.has-items {
          background: rgba(197, 48, 48, 0.15);
          border-color: #c53030;
        }
        :global([data-theme="dark"]) .expiry-soon.has-items {
          background: rgba(192, 86, 33, 0.15);
          border-color: #c05621;
        }
        :global([data-theme="dark"]) .expiry-banner-critical {
          background: rgba(197, 48, 48, 0.15);
          border-color: #c53030;
          color: #fc8181;
        }
        :global([data-theme="dark"]) .expiry-banner-warning {
          background: rgba(192, 86, 33, 0.15);
          border-color: #c05621;
          color: #f6ad55;
        }
      `}</style>
    </>
  );
}
