'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getVendors,
  createVendor,
  updateVendor,
  type Vendor,
  type VendorType,
  type CreateVendorRequest,
} from '@/lib/api/vendors';

const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'LOANER_PROVIDER', label: 'Loaner Provider' },
  { value: 'CONSIGNMENT', label: 'Consignment' },
];

export default function VendorsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.roles?.includes('ADMIN');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [filterType, setFilterType] = useState<VendorType | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<Partial<CreateVendorRequest>>({});

  const loadVendors = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getVendors(token, {
        isActive: showInactive ? undefined : true,
        vendorType: filterType || undefined,
        search: searchTerm || undefined,
      });
      setVendors(result.vendors);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive, filterType, searchTerm]);

  useEffect(() => {
    if (token && user && isAdmin) {
      loadVendors();
    }
  }, [token, user, isAdmin, loadVendors]);

  const resetForm = () => {
    setFormData({});
    setShowCreateForm(false);
    setEditingVendor(null);
  };

  const startEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      vendorType: vendor.vendorType,
      contactName: vendor.contactName || '',
      contactEmail: vendor.contactEmail || '',
      contactPhone: vendor.contactPhone || '',
      notes: vendor.notes || '',
    });
    setShowCreateForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formData.name || !formData.vendorType) return;

    try {
      await createVendor(token, formData as CreateVendorRequest);
      setSuccessMessage('Vendor created successfully');
      resetForm();
      loadVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingVendor) return;

    const updateData: Record<string, unknown> = {};
    if (formData.name !== editingVendor.name) updateData.name = formData.name;
    if (formData.vendorType !== editingVendor.vendorType) updateData.vendorType = formData.vendorType;
    if (formData.contactName !== (editingVendor.contactName || '')) updateData.contactName = formData.contactName || null;
    if (formData.contactEmail !== (editingVendor.contactEmail || '')) updateData.contactEmail = formData.contactEmail || null;
    if (formData.contactPhone !== (editingVendor.contactPhone || '')) updateData.contactPhone = formData.contactPhone || null;
    if (formData.notes !== (editingVendor.notes || '')) updateData.notes = formData.notes || null;

    if (Object.keys(updateData).length === 0) {
      resetForm();
      return;
    }

    try {
      await updateVendor(token, editingVendor.id, updateData);
      setSuccessMessage('Vendor updated successfully');
      resetForm();
      loadVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  };

  const handleToggleActive = async (vendor: Vendor) => {
    if (!token) return;
    const action = vendor.isActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} "${vendor.name}"?`)) return;

    try {
      await updateVendor(token, vendor.id, { isActive: !vendor.isActive });
      setSuccessMessage(`Vendor ${action}d successfully`);
      loadVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} vendor`);
    }
  };

  if (!isAdmin) {
    return (
      <>
        <Header title="Vendors" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  const filteredVendors = vendors;

  return (
    <>
      <Header title="Vendors" />

      <main className="container vendors-page">
        {error && (
          <div className="alert alert-error">
            {error}
            <button className="alert-close" onClick={() => setError('')}>x</button>
          </div>
        )}
        {successMessage && (
          <div className="alert alert-success">
            {successMessage}
            <button className="alert-close" onClick={() => setSuccessMessage('')}>x</button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">{vendors.filter(v => v.isActive).length}</div>
            <div className="summary-label">Active Vendors</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{vendors.filter(v => v.vendorType === 'LOANER_PROVIDER').length}</div>
            <div className="summary-label">Loaner Providers</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{vendors.filter(v => v.vendorType === 'CONSIGNMENT').length}</div>
            <div className="summary-label">Consignment</div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="actions-bar">
          <div className="actions-left">
            <button
              className="btn btn-create"
              onClick={() => {
                setShowCreateForm(true);
                setEditingVendor(null);
                setFormData({});
              }}
            >
              + Add Vendor
            </button>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button className="search-clear" onClick={() => setSearchTerm('')}>x</button>
              )}
            </div>
          </div>
          <div className="actions-right">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as VendorType | '')}
              className="filter-select"
            >
              <option value="">All Types</option>
              {VENDOR_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={`pill-toggle ${showInactive ? 'selected' : ''}`}
              onClick={() => setShowInactive(!showInactive)}
            >
              Show Inactive
            </button>
          </div>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingVendor) && (
          <div className="form-card">
            <h3>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h3>
            <form onSubmit={editingVendor ? handleUpdate : handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Vendor Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Stryker, Medtronic"
                  />
                </div>
                <div className="form-group">
                  <label>Vendor Type *</label>
                  <select
                    value={formData.vendorType || ''}
                    onChange={(e) => setFormData({ ...formData, vendorType: e.target.value as VendorType })}
                    required
                  >
                    <option value="">Select type...</option>
                    {VENDOR_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    value={formData.contactName || ''}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div className="form-group">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="e.g., rep@vendor.com"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="e.g., (555) 123-4567"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes..."
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingVendor ? 'Save Changes' : 'Add Vendor'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Vendors Table */}
        {isLoadingData ? (
          <div className="loading">Loading vendors...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No vendors found. Click &quot;Add Vendor&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map(vendor => (
                    <tr key={vendor.id} className={!vendor.isActive ? 'inactive-row' : ''}>
                      <td className="name-cell">{vendor.name}</td>
                      <td>
                        <span className={`type-badge type-${vendor.vendorType.toLowerCase()}`}>
                          {VENDOR_TYPES.find(t => t.value === vendor.vendorType)?.label || vendor.vendorType}
                        </span>
                      </td>
                      <td className="contact-cell">
                        {vendor.contactName && <div>{vendor.contactName}</div>}
                        {vendor.contactEmail && <div className="contact-email">{vendor.contactEmail}</div>}
                        {vendor.contactPhone && <div className="contact-phone">{vendor.contactPhone}</div>}
                        {!vendor.contactName && !vendor.contactEmail && !vendor.contactPhone && (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${vendor.isActive ? 'active' : 'inactive'}`}>
                          {vendor.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(vendor)}
                        >
                          Edit
                        </button>
                        <button
                          className={`btn btn-sm ${vendor.isActive ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => handleToggleActive(vendor)}
                        >
                          {vendor.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <style jsx>{`
          .vendors-page {
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
            font-size: 0.75rem;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .actions-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            flex-wrap: wrap;
            gap: 1rem;
          }

          .actions-left, .actions-right {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
          }

          .btn-create {
            background: #3182ce;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            font-weight: 500;
            border: none;
            cursor: pointer;
          }

          .btn-create:hover {
            background: #2c5282;
          }

          .search-box {
            position: relative;
          }

          .search-input {
            padding: 0.5rem 2rem 0.5rem 0.75rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 0.875rem;
            width: 200px;
          }

          .search-clear {
            position: absolute;
            right: 0.5rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #a0aec0;
            cursor: pointer;
          }

          .filter-select {
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 0.875rem;
          }

          .pill-toggle {
            padding: 0.5rem 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 9999px;
            background: white;
            cursor: pointer;
            font-size: 0.875rem;
          }

          .pill-toggle.selected {
            background: #3182ce;
            color: white;
            border-color: #3182ce;
          }

          .form-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          .form-card h3 {
            margin: 0 0 1rem 0;
            font-size: 1.125rem;
          }

          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-bottom: 1rem;
          }

          @media (max-width: 768px) {
            .form-row {
              grid-template-columns: 1fr;
            }
          }

          .form-group {
            display: flex;
            flex-direction: column;
          }

          .form-group label {
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 0.25rem;
            color: #4a5568;
          }

          .form-group input, .form-group select {
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 0.875rem;
          }

          .form-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
          }

          .btn {
            padding: 0.5rem 1rem;
            border-radius: 4px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            border: none;
          }

          .btn-primary {
            background: #3182ce;
            color: white;
          }

          .btn-primary:hover {
            background: #2c5282;
          }

          .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
          }

          .btn-secondary:hover {
            background: #cbd5e0;
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

          .btn-sm {
            padding: 0.25rem 0.5rem;
            font-size: 0.8125rem;
          }

          .table-container {
            background: white;
            border-radius: 8px;
            padding: 1rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
          }

          .data-table {
            width: 100%;
            border-collapse: collapse;
          }

          .data-table th, .data-table td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
          }

          .data-table th {
            background: #f8f9fa;
            font-weight: 600;
            font-size: 0.875rem;
          }

          .data-table tr:hover {
            background: #f8f9fa;
          }

          .inactive-row {
            opacity: 0.6;
          }

          .name-cell {
            font-weight: 500;
          }

          .contact-cell {
            font-size: 0.875rem;
          }

          .contact-email, .contact-phone {
            color: #718096;
            font-size: 0.8125rem;
          }

          .muted {
            color: #a0aec0;
          }

          .type-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
          }

          .type-manufacturer {
            background: #ebf8ff;
            color: #2b6cb0;
          }

          .type-distributor {
            background: #e9d8fd;
            color: #6b46c1;
          }

          .type-loaner_provider {
            background: #feebc8;
            color: #c05621;
          }

          .type-consignment {
            background: #c6f6d5;
            color: #276749;
          }

          .status-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
          }

          .status-badge.active {
            background: #c6f6d5;
            color: #276749;
          }

          .status-badge.inactive {
            background: #fed7d7;
            color: #c53030;
          }

          .actions-cell {
            display: flex;
            gap: 0.5rem;
          }

          .empty-state {
            text-align: center;
            color: #718096;
            padding: 2rem !important;
          }

          .alert {
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .alert-error {
            background: #fed7d7;
            border: 1px solid #fc8181;
            color: #c53030;
          }

          .alert-success {
            background: #c6f6d5;
            border: 1px solid #68d391;
            color: #276749;
          }

          .alert-close {
            background: none;
            border: none;
            font-size: 1.25rem;
            cursor: pointer;
            opacity: 0.5;
          }

          .alert-close:hover {
            opacity: 1;
          }

          .loading {
            text-align: center;
            padding: 2rem;
            color: #718096;
          }

          /* Dark mode overrides */
          :global([data-theme="dark"]) .summary-card {
            background: var(--surface-secondary);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }
          :global([data-theme="dark"]) .summary-value {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .summary-label {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .search-input {
            background: var(--surface-tertiary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .search-clear {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .filter-select {
            background: var(--surface-tertiary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .pill-toggle {
            background: var(--surface-secondary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .pill-toggle.selected {
            background: var(--color-blue-500);
            border-color: var(--color-blue-500);
            color: var(--text-on-primary);
          }
          :global([data-theme="dark"]) .form-card {
            background: var(--surface-secondary);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }
          :global([data-theme="dark"]) .form-card h3 {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .form-group label {
            color: var(--text-secondary);
          }
          :global([data-theme="dark"]) .form-group input,
          :global([data-theme="dark"]) .form-group select {
            background: var(--surface-tertiary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .btn-secondary {
            background: var(--surface-tertiary);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .btn-secondary:hover {
            background: var(--color-gray-400);
          }
          :global([data-theme="dark"]) .table-container {
            background: var(--surface-secondary);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          }
          :global([data-theme="dark"]) .data-table th {
            background: var(--surface-tertiary);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .data-table th,
          :global([data-theme="dark"]) .data-table td {
            border-bottom-color: var(--border-default);
          }
          :global([data-theme="dark"]) .data-table tr:hover {
            background: var(--surface-tertiary);
          }
          :global([data-theme="dark"]) .name-cell {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .contact-email,
          :global([data-theme="dark"]) .contact-phone {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .muted {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .empty-state {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .alert-error {
            background: var(--color-red-bg);
            border-color: var(--color-red);
            color: var(--color-red);
          }
          :global([data-theme="dark"]) .alert-success {
            background: var(--color-green-bg);
            border-color: var(--color-green);
            color: var(--color-green-700);
          }
          :global([data-theme="dark"]) .loading {
            color: var(--text-muted);
          }
        `}</style>
      </main>
    </>
  );
}
