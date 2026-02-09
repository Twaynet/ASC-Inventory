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

const NAV_BASE = 'py-2 px-4 rounded no-underline text-text-secondary font-medium transition-colors hover:bg-surface-secondary';
const NAV_ACTIVE = 'py-2 px-4 rounded no-underline font-medium bg-[var(--color-blue-500)] text-[var(--text-on-primary)]';

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

      <main className="container py-8">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="flex gap-2 mb-6 border-b border-border pb-3">
          <Link href="/admin/catalog" className={NAV_BASE}>Items</Link>
          <Link href="/admin/catalog/groups" className={NAV_ACTIVE}>Groups</Link>
          <Link href="/admin/catalog/sets" className={NAV_BASE}>Set Definitions</Link>
        </div>

        <div className="mb-6">
          <Breadcrumbs items={[
            { label: 'Catalog', href: '/admin/catalog' },
            { label: 'Groups' },
          ]} />
          <p className="text-text-muted m-0">
            Organize catalog items into groups for reporting and purchasing.
            Groups are for human organization only and do not affect readiness or alarms.
          </p>
        </div>

        <div className="bg-surface-primary rounded-lg py-4 px-6 inline-flex items-center gap-4 shadow-[0_1px_3px_var(--shadow-sm)] mb-6">
          <div className="text-[2rem] font-bold text-[var(--color-blue-500)]">{groups.length}</div>
          <div className="text-sm text-text-muted">
            {showInactive ? 'Total Groups' : 'Active Groups'}
          </div>
        </div>

        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
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
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-text-primary">
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
          <div className="bg-surface-primary rounded-lg p-6 mb-6 shadow-[0_1px_3px_var(--shadow-sm)]">
            <h2 className="mt-0 mb-4 text-text-primary">{editingGroup ? 'Edit Group' : 'Create New Group'}</h2>
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
              <div className="flex gap-4 mt-4">
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
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_var(--shadow-sm)] overflow-x-auto">
            <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_th]:text-text-primary [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_td]:text-text-primary [&_tr:hover]:bg-surface-secondary">
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
                    <td colSpan={5} className="!text-center text-text-muted !p-8">
                      No groups found. Create your first group to organize catalog items.
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id} className={!group.active ? 'opacity-60' : ''}>
                      <td className="font-medium">
                        <Link href={`/admin/catalog/groups/${group.id}`} className="text-accent no-underline hover:underline">
                          {group.name}
                        </Link>
                      </td>
                      <td>{group.description || '-'}</td>
                      <td>
                        <span className="inline-block bg-surface-tertiary px-2 py-1 rounded text-sm font-medium text-text-primary">{group.itemCount}</span>
                      </td>
                      <td>
                        <StatusBadge
                          status={group.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td className="flex gap-2">
                        <Link
                          href={`/admin/catalog/groups/${group.id}`}
                          className="btn btn-secondary btn-xs"
                        >
                          Manage Items
                        </Link>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => startEdit(group)}
                        >
                          Edit
                        </button>
                        {group.active ? (
                          <button
                            className="btn btn-danger btn-xs"
                            onClick={() => handleToggleActive(group)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-xs"
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
    </>
  );
}
