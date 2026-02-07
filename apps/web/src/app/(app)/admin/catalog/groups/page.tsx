'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageAlerts } from '@/app/components/Alert';
import { StatusBadge } from '@/app/components/StatusBadge';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogGroups,
  createCatalogGroup,
  updateCatalogGroup,
  type CatalogGroup,
  type CreateCatalogGroupRequest,
  type UpdateCatalogGroupRequest,
} from '@/lib/api';

export default function AdminCatalogGroupsPage() {
  const [showInactive, setShowInactive] = useState(false);

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
      const result = await getCatalogGroups(token, showInactive);
      return result.groups;
    },
    requiredRoles: ['ADMIN'],
    deps: [showInactive],
  });

  const groups = data || [];

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CatalogGroup | null>(null);
  const [formData, setFormData] = useState<Partial<CreateCatalogGroupRequest>>({});

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    await withErrorHandling(
      () => createCatalogGroup(token, formData as CreateCatalogGroupRequest),
      setError,
      () => {
        setSuccessMessage('Group created successfully');
        setShowCreateForm(false);
        setFormData({});
        refetch();
      }
    );
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingGroup) return;

    const updateData: UpdateCatalogGroupRequest = {};
    if (formData.name && formData.name !== editingGroup.name) {
      updateData.name = formData.name;
    }
    if (formData.description !== editingGroup.description) {
      updateData.description = formData.description || null;
    }

    await withErrorHandling(
      () => updateCatalogGroup(token, editingGroup.id, updateData),
      setError,
      () => {
        setSuccessMessage('Group updated successfully');
        setEditingGroup(null);
        setFormData({});
        refetch();
      }
    );
  };

  const handleToggleActive = async (group: CatalogGroup) => {
    if (!token) return;

    await withErrorHandling(
      () => updateCatalogGroup(token, group.id, { active: !group.active }),
      setError,
      () => {
        setSuccessMessage(`Group ${group.active ? 'deactivated' : 'activated'} successfully`);
        refetch();
      }
    );
  };

  const startEdit = (group: CatalogGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
    });
    setShowCreateForm(false);
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (accessDenied) {
    return (
      <>
        <Header title="Catalog Groups" />
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
      <Header title="Catalog Groups" />

      <main className="container admin-groups-page">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="catalog-nav">
          <Link href="/admin/catalog" className="nav-link">Items</Link>
          <Link href="/admin/catalog/groups" className="nav-link active">Groups</Link>
          <Link href="/admin/catalog/sets" className="nav-link">Set Definitions</Link>
        </div>

        <div className="page-header">
          <Breadcrumbs items={[
            { label: 'Catalog', href: '/admin/catalog' },
            { label: 'Groups' },
          ]} />
          <p className="description">
            Organize catalog items into groups for reporting and purchasing.
            Groups are for human organization only and do not affect readiness or alarms.
          </p>
        </div>

        <div className="summary-card">
          <div className="summary-value">{groups.length}</div>
          <div className="summary-label">
            {showInactive ? 'Total Groups' : 'Active Groups'}
          </div>
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-create"
            onClick={() => {
              setShowCreateForm(true);
              setEditingGroup(null);
              setFormData({});
            }}
          >
            + Create Group
          </button>
          <div className="filters">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive groups
            </label>
          </div>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingGroup) && (
          <div className="form-card">
            <h2>{editingGroup ? 'Edit Group' : 'Create New Group'}</h2>
            <form onSubmit={editingGroup ? handleUpdate : handleCreate}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Ortho Supplies, Cardiac Implants"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description for this group"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingGroup(null);
                    setFormData({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Groups Table */}
        {isLoadingData ? (
          <div className="loading">Loading groups...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No groups found. Create your first group to organize catalog items.
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id} className={!group.active ? 'inactive-row' : ''}>
                      <td className="name-cell">
                        <Link href={`/admin/catalog/groups/${group.id}`}>
                          {group.name}
                        </Link>
                      </td>
                      <td>{group.description || '-'}</td>
                      <td>
                        <span className="item-count">{group.itemCount}</span>
                      </td>
                      <td>
                        <StatusBadge
                          status={group.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td className="actions-cell">
                        <Link
                          href={`/admin/catalog/groups/${group.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Manage Items
                        </Link>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(group)}
                        >
                          Edit
                        </button>
                        {group.active ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleToggleActive(group)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleToggleActive(group)}
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
        )}
      </main>

      <style jsx>{`
        .admin-groups-page {
          padding: 2rem 0;
        }

        .catalog-nav {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-default);
          padding-bottom: 0.75rem;
        }

        .catalog-nav :global(.nav-link) {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          text-decoration: none;
          color: var(--text-secondary);
          font-weight: 500;
          transition: background 0.2s, color 0.2s;
        }

        .catalog-nav :global(.nav-link:hover) {
          background: var(--surface-secondary);
        }

        .catalog-nav :global(.nav-link.active) {
          background: var(--color-blue-500);
          color: var(--text-on-primary);
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
          color: var(--color-blue-500);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb .separator {
          color: var(--text-muted);
        }

        .description {
          color: var(--text-muted);
          margin: 0;
        }

        .summary-card {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1rem 1.5rem;
          display: inline-flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 1px 3px var(--shadow-sm);
          margin-bottom: 1.5rem;
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--color-blue-500);
        }

        .summary-label {
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: var(--text-primary);
        }

        .form-card {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px var(--shadow-sm);
        }

        .form-card h2 {
          margin-top: 0;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .form-group input[type="text"] {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border-default);
          border-radius: 4px;
          font-size: 1rem;
          background: var(--surface-primary);
          color: var(--text-primary);
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .table-container {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px var(--shadow-sm);
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
          border-bottom: 1px solid var(--border-default);
          color: var(--text-primary);
        }

        .data-table th {
          background: var(--surface-secondary);
          font-weight: 600;
        }

        .data-table tr:hover {
          background: var(--surface-secondary);
        }

        .data-table tr.inactive-row {
          opacity: 0.6;
        }

        .name-cell {
          font-weight: 500;
        }

        .name-cell a {
          color: var(--color-blue-500);
          text-decoration: none;
        }

        .name-cell a:hover {
          text-decoration: underline;
        }

        .item-count {
          display: inline-block;
          background: var(--surface-tertiary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .empty-state {
          text-align: center;
          color: var(--text-muted);
          padding: 2rem !important;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
        }

        .btn-danger {
          background: var(--color-red);
          color: var(--text-on-primary);
        }

        .btn-danger:hover {
          background: var(--color-red-700);
        }

        .btn-success {
          background: var(--color-green);
          color: var(--text-on-primary);
        }

        .btn-success:hover {
          background: var(--color-green-700);
        }
      `}</style>
    </>
  );
}
