'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  type User,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@/lib/api';

const ROLES = ['ADMIN', 'SCHEDULER', 'INVENTORY_TECH', 'CIRCULATOR', 'SCRUB', 'SURGEON', 'ANESTHESIA'];

export default function AdminUsersPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [users, setUsers] = useState<User[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<CreateUserRequest>>({});

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getUsers(token, showInactive);
      setUsers(result.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive]);

  useEffect(() => {
    if (token && hasRole('ADMIN')) {
      loadData();
    }
  }, [token, hasRole, loadData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      // Use roles array instead of single role
      const createData = {
        ...formData,
        roles: formData.roles || [],
      } as CreateUserRequest;
      delete (createData as any).role; // Remove old single role field
      await createUser(token, createData);
      setSuccessMessage('User created successfully');
      setShowCreateForm(false);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;

    try {
      const updateData: UpdateUserRequest = {};
      if (formData.username && formData.username !== editingUser.username) {
        updateData.username = formData.username;
      }
      if (formData.name && formData.name !== editingUser.name) {
        updateData.name = formData.name;
      }
      if (formData.email !== editingUser.email) {
        updateData.email = formData.email || null;
      }
      // Compare roles arrays - ensure existingRoles is always an array
      let existingRoles: string[];
      if (Array.isArray(editingUser.roles)) {
        existingRoles = editingUser.roles;
      } else if (typeof editingUser.roles === 'string') {
        existingRoles = (editingUser.roles as string).replace(/[{}]/g, '').split(',').filter(Boolean);
      } else {
        existingRoles = [editingUser.role];
      }
      const newRoles = formData.roles || [];
      if (JSON.stringify([...newRoles].sort()) !== JSON.stringify([...existingRoles].sort())) {
        updateData.roles = newRoles;
      }
      if (formData.password) {
        updateData.password = formData.password;
      }

      await updateUser(token, editingUser.id, updateData);
      setSuccessMessage('User updated successfully');
      setEditingUser(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this user?')) return;

    try {
      await deactivateUser(token, userId);
      setSuccessMessage('User deactivated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
    }
  };

  const handleActivate = async (userId: string) => {
    if (!token) return;

    try {
      await activateUser(token, userId);
      setSuccessMessage('User activated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate user');
    }
  };

  const startEdit = (u: User) => {
    setEditingUser(u);
    // Ensure roles is always an array
    let editRoles: string[];
    if (Array.isArray(u.roles)) {
      editRoles = u.roles;
    } else if (typeof u.roles === 'string') {
      editRoles = (u.roles as string).replace(/[{}]/g, '').split(',').filter(Boolean);
    } else {
      editRoles = [u.role];
    }
    setFormData({
      username: u.username,
      name: u.name,
      email: u.email || '',
      roles: editRoles,
      password: '',
    });
    setShowCreateForm(false);
  };

  // Check if user has ADMIN role (support both roles array and legacy single role)
  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="User Management" />
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
      <Header title="User Management" />

      <main className="container py-8">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <button
            className="btn btn-create"
            onClick={() => {
              setShowCreateForm(true);
              setEditingUser(null);
              setFormData({ roles: [] });
            }}
          >
            + Add User
          </button>
          <label className="flex items-center gap-2 cursor-pointer text-text-primary">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive users
          </label>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingUser) && (
          <div className="bg-surface-primary rounded-lg p-6 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <h2 className="mt-0 mb-4">{editingUser ? 'Edit User' : 'Create New User'}</h2>
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser}>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required={!editingUser}
                    placeholder="e.g., jsmith"
                  />
                </div>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!editingUser}
                    placeholder="e.g., John Smith"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div className="form-group">
                  <label>Email {(formData.roles || []).includes('ADMIN') && '*'}</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required={(formData.roles || []).includes('ADMIN')}
                    placeholder="email@facility.com"
                  />
                  <small className="text-text-muted text-sm">Required for ADMIN role</small>
                </div>
                <div className="form-group">
                  <label>Roles *</label>
                  <div className="pill-toggle-group">
                    {ROLES.map(r => (
                      <label key={r} className="pill-toggle">
                        <input
                          type="checkbox"
                          checked={(formData.roles || []).includes(r)}
                          onChange={(e) => {
                            const currentRoles = formData.roles || [];
                            if (e.target.checked) {
                              setFormData({ ...formData, roles: [...currentRoles, r] });
                            } else {
                              setFormData({ ...formData, roles: currentRoles.filter(role => role !== r) });
                            }
                          }}
                        />
                        {r.replace('_', ' ')}
                      </label>
                    ))}
                  </div>
                  {!editingUser && (!formData.roles || formData.roles.length === 0) && (
                    <small className="form-hint">Select at least one role</small>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Password {!editingUser && '*'}</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? 'Leave blank to keep current' : 'Minimum 8 characters'}
                  minLength={editingUser ? 0 : 8}
                />
              </div>
              <div className="flex gap-4 mt-4">
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingUser(null);
                    setFormData({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        {isLoadingData ? (
          <div className="loading">Loading users...</div>
        ) : (
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-x-auto">
            <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_tr:hover]:bg-surface-secondary">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  // Ensure userRoles is always an array
                  let userRoles: string[];
                  const roles = u.roles as string[] | string | undefined;
                  if (Array.isArray(roles)) {
                    userRoles = roles;
                  } else if (typeof roles === 'string') {
                    // Handle PostgreSQL array format like "{ADMIN,SCRUB}"
                    userRoles = roles.replace(/[{}]/g, '').split(',').filter(Boolean);
                  } else {
                    userRoles = [u.role];
                  }
                  return (
                  <tr key={u.id} className={!u.active ? 'opacity-60' : ''}>
                    <td className="font-medium font-mono">{u.username}</td>
                    <td>{u.name}</td>
                    <td>{u.email || '-'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map(r => (
                          <span key={r} className={`role-badge role-${r.toLowerCase()}`}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${u.active ? 'active' : 'inactive'}`}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="flex gap-2">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(u)}
                      >
                        Edit
                      </button>
                      {u.active ? (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeactivate(u.id)}
                          disabled={u.id === user?.id}
                          title={u.id === user?.id ? 'Cannot deactivate yourself' : ''}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleActivate(u.id)}
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Role and status badge colors require dark mode overrides */}
      <style jsx>{`
        .role-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .role-admin { background: #feebc8; color: #c05621; }
        .role-scheduler { background: #c6f6d5; color: #276749; }
        .role-inventory_tech { background: #bee3f8; color: #2b6cb0; }
        .role-circulator { background: #e9d8fd; color: #6b46c1; }
        .role-scrub { background: #fed7e2; color: #c53030; }
        .role-surgeon { background: #b2f5ea; color: #234e52; }
        .role-anesthesia { background: #fef3c7; color: #92400e; }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status-badge.active { background: #c6f6d5; color: #276749; }
        .status-badge.inactive { background: #fed7d7; color: #c53030; }

        :global([data-theme="dark"]) .role-admin { background: #744210; color: #feebc8; }
        :global([data-theme="dark"]) .role-scheduler { background: #22543d; color: #c6f6d5; }
        :global([data-theme="dark"]) .role-inventory_tech { background: #2a4365; color: #bee3f8; }
        :global([data-theme="dark"]) .role-circulator { background: #44337a; color: #e9d8fd; }
        :global([data-theme="dark"]) .role-scrub { background: #742a2a; color: #fed7e2; }
        :global([data-theme="dark"]) .role-surgeon { background: #234e52; color: #b2f5ea; }
        :global([data-theme="dark"]) .role-anesthesia { background: #78350f; color: #fef3c7; }
        :global([data-theme="dark"]) .status-badge.active { background: #22543d; color: #c6f6d5; }
        :global([data-theme="dark"]) .status-badge.inactive { background: #742a2a; color: #fed7d7; }
      `}</style>
    </>
  );
}
