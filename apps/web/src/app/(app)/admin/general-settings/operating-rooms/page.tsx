'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getSettingsRooms,
  createRoom,
  updateRoom,
  deactivateRoom,
  activateRoom,
  reorderRooms,
  type RoomDetail,
  type CreateRoomRequest,
  type UpdateRoomRequest,
} from '@/lib/api';

export default function OperatingRoomsPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<RoomDetail[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Room form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomDetail | null>(null);
  const [formData, setFormData] = useState<Partial<CreateRoomRequest>>({});

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const roomsResult = await getSettingsRooms(token, showInactive);
      setRooms(roomsResult.rooms);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive]);

  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN')) {
        loadData();
      }
    }
  }, [token, user, loadData]);

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

  const handleMoveRoom = async (roomId: string, direction: 'up' | 'down') => {
    if (!token) return;

    const currentIndex = rooms.findIndex(r => r.id === roomId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= rooms.length) return;

    // Create new order by swapping
    const newOrder = [...rooms];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    // Optimistically update UI
    setRooms(newOrder);

    try {
      await reorderRooms(token, newOrder.map(r => r.id));
    } catch (err) {
      // Revert on error
      loadData();
      setError(err instanceof Error ? err.message : 'Failed to reorder rooms');
    }
  };

  const startEdit = (room: RoomDetail) => {
    setEditingRoom(room);
    setFormData({ name: room.name });
    setShowCreateForm(false);
  };

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  if (!isAdmin) {
    return (
      <>
        <Header title="Operating Rooms" />
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
      <Header title="Operating Rooms" />

      <main className="container-full operating-rooms-page">
        <button className="back-link" onClick={() => router.push('/admin/general-settings')}>
          ← Back to General Settings
        </button>

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        {isLoadingData ? (
          <div className="loading">Loading rooms...</div>
        ) : (
          <div className="settings-section">
            <div className="section-header">
              <div>
                <h2>Operating Rooms</h2>
                <p className="section-description">
                  Manage the operating rooms available at your facility. Rooms can be assigned to cases on the schedule.
                </p>
              </div>
              <div className="section-actions">
                <button
                  className="btn btn-create"
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
                    <th className="order-column">Order</th>
                    <th>Room Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-state">
                        No rooms found. Create your first room to get started.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room, index) => (
                      <tr key={room.id} className={!room.active ? 'inactive-row' : ''}>
                        <td className="order-cell">
                          <div className="order-buttons">
                            <button
                              className="order-btn"
                              onClick={() => handleMoveRoom(room.id, 'up')}
                              disabled={index === 0}
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              className="order-btn"
                              onClick={() => handleMoveRoom(room.id, 'down')}
                              disabled={index === rooms.length - 1}
                              title="Move down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>
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
        )}
      </main>

      <style jsx>{`
        .operating-rooms-page {
          padding: 2rem 0;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: #3182ce;
          font-size: 0.875rem;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1.5rem;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .settings-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .section-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
        }

        .section-description {
          margin: 0;
          color: #718096;
          font-size: 0.875rem;
          max-width: 500px;
        }

        .section-actions {
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

        .order-column {
          width: 70px;
          text-align: center;
        }

        .order-cell {
          text-align: center;
        }

        .order-buttons {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .order-btn {
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          width: 24px;
          height: 20px;
          font-size: 0.625rem;
          cursor: pointer;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
        }

        .order-btn:hover:not(:disabled) {
          background: #e5e7eb;
          color: #374151;
        }

        .order-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
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
