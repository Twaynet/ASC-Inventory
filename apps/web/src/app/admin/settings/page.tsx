'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getFacilitySettings,
  updateFacilitySettings,
  getSettingsRooms,
  createRoom,
  updateRoom,
  deactivateRoom,
  activateRoom,
  type FacilitySettings,
  type RoomDetail,
  type CreateRoomRequest,
  type UpdateRoomRequest,
} from '@/lib/api';

export default function AdminSettingsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<FacilitySettings | null>(null);
  const [rooms, setRooms] = useState<RoomDetail[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Room form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomDetail | null>(null);
  const [formData, setFormData] = useState<Partial<CreateRoomRequest>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [settingsResult, roomsResult] = await Promise.all([
        getFacilitySettings(token),
        getSettingsRooms(token, showInactive),
      ]);
      setSettings(settingsResult);
      setRooms(roomsResult.rooms);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      loadData();
    }
  }, [token, user, loadData]);

  const handleToggleFeature = async () => {
    if (!token || !settings) return;
    setIsSavingSettings(true);
    try {
      const result = await updateFacilitySettings(token, {
        enableTimeoutDebrief: !settings.enableTimeoutDebrief,
      });
      setSettings(result);
      setSuccessMessage(
        result.enableTimeoutDebrief
          ? 'Time Out & Debrief feature enabled'
          : 'Time Out & Debrief feature disabled'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createRoom(token, formData as CreateRoomRequest);
      setSuccessMessage('Room created successfully');
      setShowCreateForm(false);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingRoom) return;

    try {
      const updateData: UpdateRoomRequest = {};
      if (formData.name && formData.name !== editingRoom.name) {
        updateData.name = formData.name;
      }

      await updateRoom(token, editingRoom.id, updateData);
      setSuccessMessage('Room updated successfully');
      setEditingRoom(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update room');
    }
  };

  const handleDeactivateRoom = async (roomId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this room?')) return;

    try {
      await deactivateRoom(token, roomId);
      setSuccessMessage('Room deactivated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate room');
    }
  };

  const handleActivateRoom = async (roomId: string) => {
    if (!token) return;

    try {
      await activateRoom(token, roomId);
      setSuccessMessage('Room activated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate room');
    }
  };

  const startEdit = (room: RoomDetail) => {
    setEditingRoom(room);
    setFormData({ name: room.name });
    setShowCreateForm(false);
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (user.role !== 'ADMIN') {
    return (
      <>
        <Header title="Settings" />
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
      <Header title="Settings" />

      <main className="container admin-settings-page">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        {isLoadingData ? (
          <div className="loading">Loading settings...</div>
        ) : (
          <>
            {/* Feature Toggles Section */}
            <div className="settings-section">
              <h2>Feature Toggles</h2>
              <div className="feature-toggle">
                <div className="feature-info">
                  <h3>Time Out & Debrief Checklists</h3>
                  <p>
                    Enable surgical safety checklists for case time out (before surgery)
                    and post-operative debrief with role-based signatures.
                  </p>
                </div>
                <div className="toggle-control">
                  <button
                    className={`toggle-btn ${settings?.enableTimeoutDebrief ? 'active' : ''}`}
                    onClick={handleToggleFeature}
                    disabled={isSavingSettings}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                  <span className="toggle-label">
                    {settings?.enableTimeoutDebrief ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Rooms Section */}
            <div className="settings-section">
              <div className="section-header">
                <h2>Operating Rooms</h2>
                <div className="section-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setShowCreateForm(true);
                      setEditingRoom(null);
                      setFormData({});
                    }}
                  >
                    + Add Room
                  </button>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showInactive}
                      onChange={(e) => setShowInactive(e.target.checked)}
                    />
                    Show inactive
                  </label>
                </div>
              </div>

              {/* Create/Edit Room Form */}
              {(showCreateForm || editingRoom) && (
                <div className="form-card">
                  <h3>{editingRoom ? 'Edit Room' : 'Create New Room'}</h3>
                  <form onSubmit={editingRoom ? handleUpdateRoom : handleCreateRoom}>
                    <div className="form-group">
                      <label>Room Name *</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="e.g., OR 1, Operating Room A"
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary">
                        {editingRoom ? 'Save Changes' : 'Create Room'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowCreateForm(false);
                          setEditingRoom(null);
                          setFormData({});
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Rooms Table */}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room Name</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-state">
                          No rooms found. Create your first room to get started.
                        </td>
                      </tr>
                    ) : (
                      rooms.map((room) => (
                        <tr key={room.id} className={!room.active ? 'inactive-row' : ''}>
                          <td className="name-cell">{room.name}</td>
                          <td>
                            <span className={`status-badge ${room.active ? 'active' : 'inactive'}`}>
                              {room.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{new Date(room.createdAt).toLocaleDateString()}</td>
                          <td className="actions-cell">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => startEdit(room)}
                            >
                              Edit
                            </button>
                            {room.active ? (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeactivateRoom(room.id)}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleActivateRoom(room.id)}
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
            </div>
          </>
        )}
      </main>

      <style jsx>{`
        .admin-settings-page {
          padding: 2rem 0;
        }

        .settings-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .settings-section h2 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.25rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .section-header h2 {
          margin: 0;
        }

        .section-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .feature-toggle {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          gap: 2rem;
        }

        .feature-info h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .feature-info p {
          margin: 0;
          color: #718096;
          font-size: 0.875rem;
        }

        .toggle-control {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .toggle-btn {
          position: relative;
          width: 50px;
          height: 26px;
          background: #cbd5e0;
          border: none;
          border-radius: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-btn.active {
          background: #38a169;
        }

        .toggle-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .toggle-slider {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .toggle-btn.active .toggle-slider {
          transform: translateX(24px);
        }

        .toggle-label {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .form-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .form-card h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
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

        .data-table tr.inactive-row {
          opacity: 0.6;
        }

        .name-cell {
          font-weight: 500;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.active {
          background: #c6f6d5;
          color: #276749;
        }

        .status-badge.inactive {
          background: #fed7d7;
          color: #c53030;
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
