'use client';

import { useState } from 'react';
import { Header } from '@/app/components/Header';
import { PageAlerts } from '@/app/components/Alert';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
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
      const result = await getLocations(token);
      return result.locations;
    },
    requiredRoles: ['ADMIN'],
  });

  const locations = data || [];

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState<Partial<CreateLocationRequest>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    await withErrorHandling(
      () => createLocation(token, formData as CreateLocationRequest),
      setError,
      () => {
        setSuccessMessage('Location created successfully');
        setShowCreateForm(false);
        setFormData({});
        refetch();
      }
    );
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingLocation) return;

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

    await withErrorHandling(
      () => updateLocation(token, editingLocation.id, updateData),
      setError,
      () => {
        setSuccessMessage('Location updated successfully');
        setEditingLocation(null);
        setFormData({});
        refetch();
      }
    );
  };

  const handleDelete = async (locationId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this location?')) return;

    await withErrorHandling(
      () => deleteLocation(token, locationId),
      setError,
      () => {
        setSuccessMessage('Location deleted successfully');
        refetch();
      }
    );
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

  // Get available parent locations (exclude self for editing)
  const getAvailableParents = () => {
    if (!editingLocation) return locations;
    return locations.filter(loc => loc.id !== editingLocation.id);
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (accessDenied) {
    return (
      <>
        <Header title="Location Management" />
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
      <Header title="Location Management" />

      <main className="container py-8">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-6">
          <div className="bg-surface-primary rounded-lg p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="text-[2rem] font-bold text-text-primary">{locations.length}</div>
            <div className="text-sm text-text-muted">Total Locations</div>
          </div>
          <div className="bg-surface-primary rounded-lg p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="text-[2rem] font-bold text-text-primary">{locations.filter(l => !l.parentLocationId).length}</div>
            <div className="text-sm text-text-muted">Top-Level Locations</div>
          </div>
          <div className="bg-surface-primary rounded-lg p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="text-[2rem] font-bold text-text-primary">{locations.reduce((sum, l) => sum + l.itemCount, 0)}</div>
            <div className="text-sm text-text-muted">Total Items Stored</div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <button
            className="btn btn-create"
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
          <div className="bg-surface-primary rounded-lg p-6 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <h2 className="mt-0 mb-4">{editingLocation ? 'Edit Location' : 'Create New Location'}</h2>
            <form onSubmit={editingLocation ? handleUpdate : handleCreate}>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
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
              <div className="flex gap-4 mt-4">
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
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-x-auto">
            <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_tr:hover]:bg-surface-secondary">
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
                    <td colSpan={6} className="!text-center text-text-muted !p-8">
                      No locations found. Create your first location to get started.
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id}>
                      <td className="font-medium">{loc.name}</td>
                      <td>{loc.parentLocationName || '-'}</td>
                      <td>{loc.description || '-'}</td>
                      <td>{loc.childCount}</td>
                      <td>{loc.itemCount}</td>
                      <td className="flex gap-2">
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
    </>
  );
}
