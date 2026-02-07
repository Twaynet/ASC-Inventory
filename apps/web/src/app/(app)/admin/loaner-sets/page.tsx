'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getLoanerSets,
  createLoanerSet,
  returnLoanerSet,
  type LoanerSet,
  type CreateLoanerSetRequest,
} from '@/lib/api/loaner-sets';
import { getVendors, type Vendor } from '@/lib/api/vendors';

type FilterMode = 'all' | 'open' | 'overdue' | 'returned';

export default function LoanerSetsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.roles?.includes('ADMIN');

  const [loanerSets, setLoanerSets] = useState<LoanerSet[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [returningSet, setReturningSet] = useState<LoanerSet | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('open');
  const [filterVendor, setFilterVendor] = useState('');

  const [formData, setFormData] = useState<Partial<CreateLoanerSetRequest>>({});
  const [returnNotes, setReturnNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const filters: { isOpen?: boolean; isOverdue?: boolean; vendorId?: string } = {};
      if (filterMode === 'open') filters.isOpen = true;
      else if (filterMode === 'overdue') filters.isOverdue = true;
      else if (filterMode === 'returned') filters.isOpen = false;
      if (filterVendor) filters.vendorId = filterVendor;

      const [setsResult, vendorsResult] = await Promise.all([
        getLoanerSets(token, filters),
        getVendors(token, { vendorType: 'LOANER_PROVIDER', isActive: true }),
      ]);
      setLoanerSets(setsResult.loanerSets);
      setVendors(vendorsResult.vendors);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, filterMode, filterVendor]);

  useEffect(() => {
    if (token && user && isAdmin) {
      loadData();
    }
  }, [token, user, isAdmin, loadData]);

  const resetForm = () => {
    setFormData({});
    setShowReceiveForm(false);
    setReturningSet(null);
    setReturnNotes('');
  };

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formData.vendorId || !formData.setIdentifier) return;

    try {
      await createLoanerSet(token, formData as CreateLoanerSetRequest);
      setSuccessMessage('Loaner set received successfully');
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to receive loaner set');
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !returningSet) return;

    try {
      const result = await returnLoanerSet(token, returningSet.id, {
        notes: returnNotes || undefined,
      });
      setSuccessMessage(`Loaner set returned. ${result.itemsReturned} item(s) marked as returned.`);
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return loaner set');
    }
  };

  if (!isAdmin) {
    return (
      <>
        <Header title="Loaner Sets" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  const openCount = loanerSets.filter(s => s.isOpen).length;
  const overdueCount = loanerSets.filter(s => s.isOverdue).length;

  return (
    <>
      <Header title="Loaner Sets" />

      <main className="container loaner-sets-page">
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
          <div
            className={`summary-card clickable ${filterMode === 'open' ? 'selected' : ''}`}
            onClick={() => setFilterMode('open')}
          >
            <div className="summary-value">{openCount}</div>
            <div className="summary-label">Open Sets</div>
          </div>
          <div
            className={`summary-card clickable warning ${filterMode === 'overdue' ? 'selected' : ''}`}
            onClick={() => setFilterMode('overdue')}
          >
            <div className="summary-value">{overdueCount}</div>
            <div className="summary-label">Overdue</div>
          </div>
          <div
            className={`summary-card clickable ${filterMode === 'all' ? 'selected' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            <div className="summary-value">{loanerSets.length}</div>
            <div className="summary-label">Total</div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="actions-bar">
          <div className="actions-left">
            <button
              className="btn btn-create"
              onClick={() => {
                setShowReceiveForm(true);
                setReturningSet(null);
                setFormData({});
              }}
            >
              + Receive Loaner Set
            </button>
          </div>
          <div className="actions-right">
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="filter-select"
            >
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="filter-tabs">
              <button
                className={`filter-tab ${filterMode === 'open' ? 'active' : ''}`}
                onClick={() => setFilterMode('open')}
              >
                Open
              </button>
              <button
                className={`filter-tab ${filterMode === 'overdue' ? 'active' : ''}`}
                onClick={() => setFilterMode('overdue')}
              >
                Overdue
              </button>
              <button
                className={`filter-tab ${filterMode === 'returned' ? 'active' : ''}`}
                onClick={() => setFilterMode('returned')}
              >
                Returned
              </button>
              <button
                className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                All
              </button>
            </div>
          </div>
        </div>

        {/* Receive Form */}
        {showReceiveForm && (
          <div className="form-card">
            <h3>Receive Loaner Set</h3>
            <form onSubmit={handleReceive}>
              <div className="form-row">
                <div className="form-group">
                  <label>Vendor *</label>
                  <select
                    value={formData.vendorId || ''}
                    onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                    required
                  >
                    <option value="">Select vendor...</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Set Identifier *</label>
                  <input
                    type="text"
                    value={formData.setIdentifier || ''}
                    onChange={(e) => setFormData({ ...formData, setIdentifier: e.target.value })}
                    required
                    placeholder="e.g., TRAY-2024-001"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Expected Return Date</label>
                  <input
                    type="date"
                    value={formData.expectedReturnDate || ''}
                    onChange={(e) => setFormData({ ...formData, expectedReturnDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Item Count</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.itemCount || ''}
                    onChange={(e) => setFormData({ ...formData, itemCount: parseInt(e.target.value) || undefined })}
                    placeholder="Number of items in set"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Hip revision tray"
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
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Receive Set
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Return Modal */}
        {returningSet && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Return Loaner Set</h3>
                <button className="modal-close" onClick={resetForm}>x</button>
              </div>
              <form onSubmit={handleReturn}>
                <div className="modal-body">
                  <div className="return-details">
                    <p><strong>Set:</strong> {returningSet.setIdentifier}</p>
                    <p><strong>Vendor:</strong> {returningSet.vendorName}</p>
                    <p><strong>Received:</strong> {new Date(returningSet.receivedAt).toLocaleDateString()}</p>
                    {returningSet.description && <p><strong>Description:</strong> {returningSet.description}</p>}
                  </div>
                  <div className="form-group">
                    <label>Return Notes (optional)</label>
                    <textarea
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="Any notes about the return..."
                      rows={3}
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn btn-primary">
                    Confirm Return
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Loaner Sets Table */}
        {isLoadingData ? (
          <div className="loading">Loading loaner sets...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Set ID</th>
                  <th>Vendor</th>
                  <th>Description</th>
                  <th>Received</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loanerSets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      {filterMode === 'open'
                        ? 'No open loaner sets. Click "Receive Loaner Set" to add one.'
                        : filterMode === 'overdue'
                        ? 'No overdue loaner sets.'
                        : 'No loaner sets found.'}
                    </td>
                  </tr>
                ) : (
                  loanerSets.map(set => (
                    <tr key={set.id} className={set.isOverdue ? 'overdue-row' : ''}>
                      <td className="id-cell">
                        <span className="set-id">{set.setIdentifier}</span>
                        {set.caseName && (
                          <div className="case-link">{set.caseName}</div>
                        )}
                      </td>
                      <td>{set.vendorName}</td>
                      <td className="desc-cell">{set.description || <span className="muted">-</span>}</td>
                      <td className="date-cell">
                        {new Date(set.receivedAt).toLocaleDateString()}
                        <div className="received-by">{set.receivedByUserName}</div>
                      </td>
                      <td className="date-cell">
                        {set.expectedReturnDate ? (
                          <>
                            {set.expectedReturnDate}
                            {set.isOverdue && (
                              <div className="overdue-badge">OVERDUE</div>
                            )}
                          </>
                        ) : (
                          <span className="muted">Not set</span>
                        )}
                      </td>
                      <td>
                        {set.returnedAt ? (
                          <span className="status-badge returned">
                            Returned {new Date(set.returnedAt).toLocaleDateString()}
                          </span>
                        ) : set.isOverdue ? (
                          <span className="status-badge overdue">Overdue</span>
                        ) : (
                          <span className="status-badge open">Open</span>
                        )}
                      </td>
                      <td className="actions-cell">
                        {!set.returnedAt && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setReturningSet(set)}
                          >
                            Return
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

        <style jsx>{`
          .loaner-sets-page {
            padding: 2rem 0;
          }

          .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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

          .summary-card.clickable {
            cursor: pointer;
          }

          .summary-card.clickable:hover {
            border-color: #e2e8f0;
          }

          .summary-card.selected {
            border-color: #3182ce;
          }

          .summary-card.warning .summary-value {
            color: #c05621;
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

          .filter-select {
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 0.875rem;
          }

          .filter-tabs {
            display: flex;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
          }

          .filter-tab {
            padding: 0.5rem 1rem;
            background: white;
            border: none;
            cursor: pointer;
            font-size: 0.875rem;
            border-right: 1px solid #e2e8f0;
          }

          .filter-tab:last-child {
            border-right: none;
          }

          .filter-tab.active {
            background: #3182ce;
            color: white;
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
            margin-bottom: 1rem;
          }

          .form-group label {
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 0.25rem;
            color: #4a5568;
          }

          .form-group input, .form-group select, .form-group textarea {
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            font-size: 0.875rem;
          }

          .form-group textarea {
            resize: vertical;
          }

          .form-actions, .modal-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
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
            z-index: 100;
          }

          .modal {
            background: white;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e2e8f0;
          }

          .modal-header h3 {
            margin: 0;
          }

          .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #a0aec0;
          }

          .modal-body {
            padding: 1.5rem;
          }

          .modal-actions {
            padding: 0 1.5rem 1.5rem;
          }

          .return-details {
            background: #f7fafc;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
          }

          .return-details p {
            margin: 0.25rem 0;
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

          .overdue-row {
            background: #fff5f5;
          }

          .overdue-row:hover {
            background: #fed7d7;
          }

          .id-cell {
            font-weight: 500;
          }

          .set-id {
            font-family: monospace;
          }

          .case-link {
            font-size: 0.75rem;
            color: #3182ce;
            margin-top: 0.25rem;
          }

          .desc-cell {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .date-cell {
            white-space: nowrap;
          }

          .received-by {
            font-size: 0.75rem;
            color: #718096;
          }

          .overdue-badge {
            display: inline-block;
            margin-top: 0.25rem;
            padding: 0.125rem 0.375rem;
            background: #c53030;
            color: white;
            font-size: 0.625rem;
            font-weight: 700;
            border-radius: 4px;
          }

          .muted {
            color: #a0aec0;
          }

          .status-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
          }

          .status-badge.open {
            background: #bee3f8;
            color: #2b6cb0;
          }

          .status-badge.overdue {
            background: #fed7d7;
            color: #c53030;
          }

          .status-badge.returned {
            background: #c6f6d5;
            color: #276749;
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
          :global([data-theme="dark"]) .summary-card.selected {
            border-color: var(--color-blue-500);
          }
          :global([data-theme="dark"]) .summary-card.clickable:hover {
            border-color: var(--border-default);
          }
          :global([data-theme="dark"]) .summary-value {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .summary-label {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .filter-select {
            background: var(--surface-tertiary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .filter-tabs {
            border-color: var(--border-default);
          }
          :global([data-theme="dark"]) .filter-tab {
            background: var(--surface-secondary);
            color: var(--text-primary);
            border-right-color: var(--border-default);
          }
          :global([data-theme="dark"]) .filter-tab.active {
            background: var(--color-blue-500);
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
          :global([data-theme="dark"]) .form-group select,
          :global([data-theme="dark"]) .form-group textarea {
            background: var(--surface-tertiary);
            border-color: var(--border-default);
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .modal {
            background: var(--surface-secondary);
          }
          :global([data-theme="dark"]) .modal-header {
            border-bottom-color: var(--border-default);
          }
          :global([data-theme="dark"]) .modal-header h3 {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .modal-close {
            color: var(--text-muted);
          }
          :global([data-theme="dark"]) .return-details {
            background: var(--surface-tertiary);
          }
          :global([data-theme="dark"]) .return-details p {
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
          :global([data-theme="dark"]) .overdue-row {
            background: rgba(239, 68, 68, 0.15);
          }
          :global([data-theme="dark"]) .overdue-row:hover {
            background: rgba(239, 68, 68, 0.25);
          }
          :global([data-theme="dark"]) .id-cell {
            color: var(--text-primary);
          }
          :global([data-theme="dark"]) .case-link {
            color: var(--color-blue-500);
          }
          :global([data-theme="dark"]) .received-by {
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
