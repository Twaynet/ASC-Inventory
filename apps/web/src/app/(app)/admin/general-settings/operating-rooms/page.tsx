'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { AdminSettingsSubnav } from '@/components/AdminSettingsSubnav';
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

      <main className="container-full py-8">
        <Breadcrumbs items={[
          { label: 'General Settings', href: '/admin/general-settings' },
          { label: 'Operating Rooms' },
        ]} />
        <AdminSettingsSubnav />

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        {isLoadingData ? (
          <div className="loading">Loading rooms...</div>
        ) : (
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
              <div>
                <h2 className="m-0 mb-2 text-xl text-text-primary">Operating Rooms</h2>
                <p className="m-0 text-text-muted text-sm max-w-[500px]">
                  Manage the operating rooms available at your facility. Rooms can be assigned to cases on the schedule.
                </p>
              </div>
              <div className="flex items-center gap-4">
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
                <label className="flex items-center gap-2 cursor-pointer text-text-primary">
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
              <div className="bg-surface-secondary rounded-lg p-4 mb-4">
                <h3 className="mt-0 mb-4 text-base text-text-primary">{editingRoom ? 'Edit Room' : 'Create New Room'}</h3>
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
                  <div className="flex gap-4">
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_tr:hover]:bg-surface-secondary">
                <thead>
                  <tr>
                    <th className="w-[70px] !text-center">Order</th>
                    <th>Room Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="!text-center text-text-muted !p-8">
                        No rooms found. Create your first room to get started.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room, index) => (
                      <tr key={room.id} className={!room.active ? 'opacity-60' : ''}>
                        <td className="!text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              className="bg-surface-tertiary border border-border rounded w-6 h-5 text-[0.625rem] cursor-pointer text-text-muted flex items-center justify-center p-0 leading-none hover:enabled:bg-surface-secondary hover:enabled:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={() => handleMoveRoom(room.id, 'up')}
                              disabled={index === 0}
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              className="bg-surface-tertiary border border-border rounded w-6 h-5 text-[0.625rem] cursor-pointer text-text-muted flex items-center justify-center p-0 leading-none hover:enabled:bg-surface-secondary hover:enabled:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={() => handleMoveRoom(room.id, 'down')}
                              disabled={index === rooms.length - 1}
                              title="Move down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>
                        <td className="font-medium text-text-primary">{room.name}</td>
                        <td>
                          <span className={`status-badge ${room.active ? 'active' : 'inactive'}`}>
                            {room.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{new Date(room.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="flex gap-1.5">
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => startEdit(room)}
                          >
                            Edit
                          </button>
                          {room.active ? (
                            <button
                              className="btn btn-danger btn-xs"
                              onClick={() => handleDeactivateRoom(room.id)}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-xs"
                              onClick={() => handleActivateRoom(room.id)}
                            >
                              Activate
                            </button>
                          )}
                          </div>
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

      {/* Status badge colors with dark mode */}
      <style jsx>{`
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status-badge.active { background: #c6f6d5; color: #276749; }
        .status-badge.inactive { background: #fed7d7; color: #c53030; }
        :global([data-theme="dark"]) .status-badge.active { background: #22543d; color: #c6f6d5; }
        :global([data-theme="dark"]) .status-badge.inactive { background: #742a2a; color: #fed7d7; }
      `}</style>
    </>
  );
}
