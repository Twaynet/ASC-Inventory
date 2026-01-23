'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  getInventoryItemHistory,
  getCatalogItems,
  getLocations,
  type InventoryItem,
  type InventoryItemDetail,
  type InventoryItemEvent,
  type CreateInventoryItemRequest,
  type UpdateInventoryItemRequest,
  type CatalogItem,
  type Location,
} from '@/lib/api';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  AVAILABLE: { bg: '#c6f6d5', color: '#276749' },
  RESERVED: { bg: '#feebc8', color: '#c05621' },
  IN_USE: { bg: '#bee3f8', color: '#2b6cb0' },
  UNAVAILABLE: { bg: '#fed7d7', color: '#c53030' },
};

const STERILITY_STATUSES = ['STERILE', 'NOT_STERILE', 'EXPIRED', 'UNKNOWN'];

export default function AdminInventoryPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemDetail | null>(null);
  const [formData, setFormData] = useState<Partial<CreateInventoryItemRequest>>({});

  // History modal
  const [viewingHistoryItem, setViewingHistoryItem] = useState<InventoryItem | null>(null);
  const [historyEvents, setHistoryEvents] = useState<InventoryItemEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

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
    if (token && user?.role === 'ADMIN') {
      loadData();
    }
  }, [token, user, loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createInventoryItem(token, formData as CreateInventoryItemRequest);
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
        updateData.sterilityExpiresAt = formData.sterilityExpiresAt || null;
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

  // Compute status counts
  const statusCounts = items.reduce((acc, item) => {
    acc[item.availability_status] = (acc[item.availability_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (user.role !== 'ADMIN') {
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

      <main className="container admin-inventory-page">
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
              onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
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
        </div>

        <div className="actions-bar">
          <div className="actions-left">
            <button
              className="btn btn-create"
              onClick={() => {
                setShowCreateForm(true);
                setEditingItem(null);
                setFormData({});
              }}
            >
              + Add Inventory Item
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => router.push('/admin/inventory/check-in')}
            >
              Scanner Check-In
            </button>
          </div>
          <div className="filters">
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
            {(filterCatalog || filterLocation || filterStatus) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilterCatalog('');
                  setFilterLocation('');
                  setFilterStatus('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

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
                  <th>Item Name</th>
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
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="name-cell">{item.catalog_name}</td>
                      <td className="barcode">{item.barcode || '-'}</td>
                      <td className="serial">{item.serial_number || '-'}</td>
                      <td>{item.location_name || '-'}</td>
                      <td>{item.sterility_status}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: STATUS_COLORS[item.availability_status]?.bg || '#e2e8f0',
                            color: STATUS_COLORS[item.availability_status]?.color || '#4a5568',
                          }}
                        >
                          {(item.availability_status || 'UNKNOWN').replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {item.last_verified_at
                          ? new Date(item.last_verified_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => viewHistory(item)}
                        >
                          History
                        </button>
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
                <h2>Event History: {viewingHistoryItem.catalog_name}</h2>
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
                          {event.userName || event.deviceName || 'System'}
                        </div>
                        {event.eventData && Object.keys(event.eventData).length > 0 && (
                          <div className="history-data">
                            {JSON.stringify(event.eventData)}
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

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
        }

        .summary-label {
          font-size: 0.875rem;
          color: #718096;
          text-transform: capitalize;
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

        .actions-cell {
          display: flex;
          gap: 0.5rem;
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
      `}</style>
    </>
  );
}
