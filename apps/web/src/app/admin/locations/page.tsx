'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  type Location,
  type CreateLocationRequest,
  type UpdateLocationRequest,
} from '@/lib/api';

export default function AdminLocationsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState<Partial<CreateLocationRequest>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getLocations(token);
      setLocations(result.locations);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      loadData();
    }
  }, [token, user, loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createLocation(token, formData as CreateLocationRequest);
      setSuccessMessage('Location created successfully');
      setShowCreateForm(false);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingLocation) return;

    try {
      const updateData: UpdateLocationRequest = {};
      if (formData.name && formData.name !== editingLocation.name) {
        updateData.name = formData.name;
      }
      if (formData.description !== editingLocation.description) {
        updateData.description = formData.description || null;
      }
      if (formData.parentLocationId !== editingLocation.parentLocationId) {
        updateData.parentLocationId = formData.parentLocationId || null;
      }

      await updateLocation(token, editingLocation.id, updateData);
      setSuccessMessage('Location updated successfully');
      setEditingLocation(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update location');
    }
  };

  const handleDelete = async (locationId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      await deleteLocation(token, locationId);
      setSuccessMessage('Location deleted successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location');
    }
  };

  const startEdit = (loc: Location) => {
    setEditingLocation(loc);
    setFormData({
      name: loc.name,
      description: loc.description || '',
      parentLocationId: loc.parentLocationId || undefined,
    });
    setShowCreateForm(false);
  };

  // Get available parent locations (exclude self and children for editing)
  const getAvailableParents = () => {
    if (!editingLocation) return locations;
    return locations.filter(loc => loc.id !== editingLocation.id);
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (user.role !== 'ADMIN') {
    return (
      <>
        <header className="header">
          <div className="container header-content">
            <div className="header-left">
              <button
                className="btn btn-secondary btn-sm back-btn"
                onClick={() => router.push('/calendar')}
              >
                &larr; Back
              </button>
              <h1>Location Management</h1>
            </div>
            <div className="header-user">
              <span>{user.name} ({user.role})</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Sign Out
              </button>
            </div>
          </div>
        </header>
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="container header-content">
          <div className="header-left">
            <button
              className="btn btn-secondary btn-sm back-btn"
              onClick={() => router.push('/calendar')}
            >
              &larr; Back
            </button>
            <h1>Location Management</h1>
          </div>
          <div className="header-user">
            <span>{user.name} ({user.role})</span>
            <span>{user.facilityName}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container admin-locations-page">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">{locations.length}</div>
            <div className="summary-label">Total Locations</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{locations.filter(l => !l.parentLocationId).length}</div>
            <div className="summary-label">Top-Level Locations</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{locations.reduce((sum, l) => sum + l.itemCount, 0)}</div>
            <div className="summary-label">Total Items Stored</div>
          </div>
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowCreateForm(true);
              setEditingLocation(null);
              setFormData({});
            }}
          >
            + Add Location
          </button>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingLocation) && (
          <div className="form-card">
            <h2>{editingLocation ? 'Edit Location' : 'Create New Location'}</h2>
            <form onSubmit={editingLocation ? handleUpdate : handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Storage Room A"
                  />
                </div>
                <div className="form-group">
                  <label>Parent Location</label>
                  <select
                    value={formData.parentLocationId || ''}
                    onChange={(e) => setFormData({ ...formData, parentLocationId: e.target.value || undefined })}
                  >
                    <option value="">None (Top-Level)</option>
                    {getAvailableParents().map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
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
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingLocation ? 'Save Changes' : 'Create Location'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingLocation(null);
                    setFormData({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Locations Table */}
        {isLoadingData ? (
          <div className="loading">Loading locations...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Parent</th>
                  <th>Description</th>
                  <th>Children</th>
                  <th>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      No locations found. Create your first location to get started.
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id}>
                      <td className="name-cell">{loc.name}</td>
                      <td>{loc.parentLocationName || '-'}</td>
                      <td>{loc.description || '-'}</td>
                      <td>{loc.childCount}</td>
                      <td>{loc.itemCount}</td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(loc)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(loc.id)}
                          disabled={loc.childCount > 0 || loc.itemCount > 0}
                          title={
                            loc.childCount > 0
                              ? 'Cannot delete: has child locations'
                              : loc.itemCount > 0
                              ? 'Cannot delete: has items stored'
                              : ''
                          }
                        >
                          Delete
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
        .admin-locations-page {
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
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
          color: #2d3748;
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

        .btn-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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
