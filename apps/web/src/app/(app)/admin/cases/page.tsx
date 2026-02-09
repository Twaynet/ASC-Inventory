'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCases,
  createCase,
  activateCase,
  approveCase,
  rejectCase,
  deactivateCase,
  cancelCase,
  type Case,
  type ActivateCaseRequest,
} from '@/lib/api/cases';
import { getSurgeons, type User } from '@/lib/api/users';
import { getCaseCards, type CaseCardSummary } from '@/lib/api/case-cards';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD';
  // Return 24-hour format as-is (HH:MM)
  return timeStr;
}

export default function AdminCasesPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [cases, setCases] = useState<Case[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [caseCards, setCaseCards] = useState<CaseCardSummary[]>([]);
  const [filter, setFilter] = useState<'all' | 'inactive' | 'active' | 'cancelled'>('inactive');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  // preferenceCardVersionId removed: legacy FK to preference_card_versions table.
  // Case cards are linked via the case dashboard (linkCaseCard) after creation.
  const [createFormData, setCreateFormData] = useState({
    surgeonId: '',
    procedureName: '',
    notes: '',
  });

  // Activation form state
  const [activatingCase, setActivatingCase] = useState<Case | null>(null);
  const [activationDate, setActivationDate] = useState('');
  const [activationTime, setActivationTime] = useState('');

  // Approval form state
  const [approvingCase, setApprovingCase] = useState<Case | null>(null);
  const [approvalDate, setApprovalDate] = useState('');
  const [approvalTime, setApprovalTime] = useState('');

  // Rejection form state
  const [rejectingCase, setRejectingCase] = useState<Case | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [casesResult, surgeonsResult, cardsResult] = await Promise.all([
        getCases(token),
        getSurgeons(token),
        getCaseCards(token, { status: 'ACTIVE' }),
      ]);
      setCases(casesResult.cases);
      setSurgeons(surgeonsResult.users);
      setCaseCards(cardsResult.cards);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && (hasRole('ADMIN') || hasRole('SCHEDULER'))) {
      loadData();
    }
  }, [token, hasRole, loadData]);

  const filteredCases = cases.filter((c) => {
    switch (filter) {
      case 'inactive':
        return !c.isActive && !c.isCancelled;
      case 'active':
        return c.isActive && !c.isCancelled;
      case 'cancelled':
        return c.isCancelled;
      default:
        return true;
    }
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const caseData: Partial<Case> = {
        surgeonId: createFormData.surgeonId,
        procedureName: createFormData.procedureName,
        notes: createFormData.notes || null,
      };
      await createCase(token, caseData);
      setSuccessMessage('Case created successfully. It will remain inactive until approved and scheduled.');
      setShowCreateForm(false);
      setCreateFormData({
        surgeonId: '',
        procedureName: '',
        notes: '',
      });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activatingCase) return;

    try {
      const data: ActivateCaseRequest = {
        scheduledDate: activationDate,
        scheduledTime: activationTime || undefined,
      };
      await activateCase(token, activatingCase.id, data);
      setSuccessMessage('Case activated successfully');
      setActivatingCase(null);
      setActivationDate('');
      setActivationTime('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate case');
    }
  };

  const handleDeactivate = async (caseId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this case? It will return to pending approval status.')) return;

    try {
      await deactivateCase(token, caseId);
      setSuccessMessage('Case deactivated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate case');
    }
  };

  const handleCancel = async (caseId: string) => {
    if (!token) return;
    const reason = prompt('Enter cancellation reason (optional):');
    if (reason === null) return; // User clicked cancel

    try {
      await cancelCase(token, caseId, reason || undefined);
      setSuccessMessage('Case cancelled successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel case');
    }
  };

  const startActivation = (c: Case) => {
    setActivatingCase(c);
    // Pre-fill with existing date if available
    setActivationDate(c.scheduledDate || '');
    setActivationTime(c.scheduledTime || '');
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !approvingCase) return;

    try {
      await approveCase(token, approvingCase.id, {
        scheduledDate: approvalDate,
        scheduledTime: approvalTime || undefined,
      });
      setSuccessMessage('Case request approved successfully');
      setApprovingCase(null);
      setApprovalDate('');
      setApprovalTime('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve case');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !rejectingCase || !rejectionReason.trim()) return;

    try {
      await rejectCase(token, rejectingCase.id, rejectionReason);
      setSuccessMessage('Case request rejected');
      setRejectingCase(null);
      setRejectionReason('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject case');
    }
  };

  const startApproval = (c: Case) => {
    setApprovingCase(c);
    // Pre-fill with requested date/time if available
    setApprovalDate(c.requestedDate || '');
    setApprovalTime(c.requestedTime || '');
  };

  const startRejection = (c: Case) => {
    setRejectingCase(c);
    setRejectionReason('');
  };

  if (!hasRole('ADMIN') && !hasRole('SCHEDULER')) {
    return (
      <>
        <Header title="Cases" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators and schedulers.
          </div>
        </main>
      </>
    );
  }

  // Calculate summary counts
  const inactiveCount = cases.filter(c => !c.isActive && !c.isCancelled).length;
  const activeCount = cases.filter(c => c.isActive && !c.isCancelled).length;
  const cancelledCount = cases.filter(c => c.isCancelled).length;

  return (
    <>
      <Header title="Cases" />

      <main className="container-full admin-cases-page px-6">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="actions-bar">
          <button
            className="btn btn-create btn-sm"
            onClick={() => {
              setShowCreateForm(true);
              setActivatingCase(null);
            }}
          >
            + Create Case
          </button>
        </div>

        {/* Create Case Form */}
        {showCreateForm && (
          <div className="form-card">
            <h2>Create New Case</h2>
            <p className="form-note">
              New cases start as inactive and must be approved and scheduled before appearing in readiness.
            </p>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Surgeon *</label>
                  <select
                    value={createFormData.surgeonId}
                    onChange={(e) => {
                      setCreateFormData({ ...createFormData, surgeonId: e.target.value });
                    }}
                    required
                  >
                    <option value="">Select surgeon...</option>
                    {surgeons.map(s => (
                      <option key={s.id} value={s.id}>Dr. {s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Procedure Name *</label>
                  <input
                    type="text"
                    value={createFormData.procedureName}
                    onChange={(e) => setCreateFormData({ ...createFormData, procedureName: e.target.value })}
                    required
                    placeholder="e.g., Total Hip Replacement"
                  />
                </div>
              </div>
              {createFormData.surgeonId && caseCards.some(c => c.surgeonId === createFormData.surgeonId) && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Available Preference Cards</label>
                    <ul className="card-ref-list">
                      {caseCards
                        .filter(c => c.surgeonId === createFormData.surgeonId)
                        .map(c => (
                          <li key={c.id}>
                            {c.procedureName} (v{c.version})
                          </li>
                        ))}
                    </ul>
                    <small className="form-hint">Link a preference card via the Case Dashboard after creation</small>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label>Notes</label>
                <input
                  type="text"
                  value={createFormData.notes}
                  onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Create Case
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateFormData({
                      surgeonId: '',
                      procedureName: '',
                      notes: '',
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-cards">
          <div
            className={`summary-card ${filter === 'inactive' ? 'selected' : ''} ${inactiveCount > 0 ? 'orange' : 'green'}`}
            onClick={() => setFilter('inactive')}
          >
            <div className="summary-value">{inactiveCount}</div>
            <div className="summary-label">Pending Approval</div>
          </div>
          <div
            className={`summary-card ${filter === 'active' ? 'selected' : ''} green`}
            onClick={() => setFilter('active')}
          >
            <div className="summary-value">{activeCount}</div>
            <div className="summary-label">Active</div>
          </div>
          <div
            className={`summary-card ${filter === 'cancelled' ? 'selected' : ''} red`}
            onClick={() => setFilter('cancelled')}
          >
            <div className="summary-value">{cancelledCount}</div>
            <div className="summary-label">Cancelled</div>
          </div>
          <div
            className={`summary-card ${filter === 'all' ? 'selected' : ''}`}
            onClick={() => setFilter('all')}
          >
            <div className="summary-value">{cases.length}</div>
            <div className="summary-label">Total</div>
          </div>
        </div>

        {/* Activation Form */}
        {activatingCase && (
          <div className="form-card">
            <h2>Activate Case: {activatingCase.procedureName}</h2>
            <p className="form-subtitle">
              Surgeon: Dr. {activatingCase.surgeonName}
            </p>
            <form onSubmit={handleActivate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Scheduled Date *</label>
                  <input
                    type="date"
                    value={activationDate}
                    onChange={(e) => setActivationDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Scheduled Time</label>
                  <input
                    type="time"
                    value={activationTime}
                    onChange={(e) => setActivationTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Activate Case
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setActivatingCase(null);
                    setActivationDate('');
                    setActivationTime('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Approval Form */}
        {approvingCase && (
          <div className="form-card">
            <h2>Approve Case Request: {approvingCase.procedureName}</h2>
            <p className="form-subtitle">
              Surgeon: Dr. {approvingCase.surgeonName}
            </p>
            {approvingCase.requestedDate && (
              <p className="requested-info">
                Requested Date/Time: {formatDate(approvingCase.requestedDate)} {approvingCase.requestedTime ? `at ${formatTime(approvingCase.requestedTime)}` : ''}
                <br />
                <small>(Shown for reference - you can schedule for a different date/time)</small>
              </p>
            )}
            <form onSubmit={handleApprove}>
              <div className="form-row">
                <div className="form-group">
                  <label>Scheduled Date *</label>
                  <input
                    type="date"
                    value={approvalDate}
                    onChange={(e) => setApprovalDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Scheduled Time</label>
                  <input
                    type="time"
                    value={approvalTime}
                    onChange={(e) => setApprovalTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Approve & Schedule
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setApprovingCase(null);
                    setApprovalDate('');
                    setApprovalTime('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rejection Form */}
        {rejectingCase && (
          <div className="form-card">
            <h2>Reject Case Request: {rejectingCase.procedureName}</h2>
            <p className="form-subtitle">
              Surgeon: Dr. {rejectingCase.surgeonName}
            </p>
            <form onSubmit={handleReject}>
              <div className="form-group">
                <label>Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                  rows={4}
                  placeholder="Provide a reason for rejecting this case request..."
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-danger">
                  Reject Request
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectingCase(null);
                    setRejectionReason('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Cases Table */}
        {isLoadingData ? (
          <div className="loading">Loading cases...</div>
        ) : filteredCases.length === 0 ? (
          <div className="no-cases">
            <p>No cases match the selected filter.</p>
          </div>
        ) : (
          <div className="cases-table-container">
            <table className="cases-table">
              <thead>
                <tr>
                  <th>Procedure</th>
                  <th>Surgeon</th>
                  <th>Date/Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr key={c.id} className={c.isCancelled ? 'cancelled-row' : c.status === 'REJECTED' ? 'rejected-row' : !c.isActive ? 'inactive-row' : ''}>
                    <td className="procedure-name">{c.procedureName}</td>
                    <td>Dr. {c.surgeonName}</td>
                    <td>
                      {c.status === 'REQUESTED' ? (
                        <div>
                          {c.requestedDate || c.requestedTime ? (
                            <>
                              <div className="requested-info">
                                Requested: {c.requestedDate ? formatDate(c.requestedDate) : 'No date'}
                                {c.requestedTime && ` at ${formatTime(c.requestedTime)}`}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted">No preference specified</span>
                          )}
                        </div>
                      ) : c.scheduledDate ? (
                        <>
                          {formatDate(c.scheduledDate)}
                          {c.scheduledTime && ` at ${formatTime(c.scheduledTime)}`}
                        </>
                      ) : (
                        <span className="text-muted">Not scheduled</span>
                      )}
                    </td>
                    <td>
                      {c.status === 'REQUESTED' ? (
                        <span className="status-badge requested">Requested</span>
                      ) : c.status === 'REJECTED' ? (
                        <span className="status-badge rejected">Rejected</span>
                      ) : c.isCancelled ? (
                        <span className="status-badge cancelled">Cancelled</span>
                      ) : c.isActive ? (
                        <span className="status-badge active">Active</span>
                      ) : (
                        <span className="status-badge pending">Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                      {c.status === 'REQUESTED' && !c.isCancelled ? (
                        <>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => startApproval(c)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger btn-xs"
                            onClick={() => startRejection(c)}
                          >
                            Reject
                          </button>
                        </>
                      ) : !c.isActive && !c.isCancelled && c.status !== 'REJECTED' ? (
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => startActivation(c)}
                        >
                          Activate
                        </button>
                      ) : null}
                      {c.isActive && !c.isCancelled && c.status !== 'IN_PROGRESS' && c.status !== 'COMPLETED' && (
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleDeactivate(c.id)}
                        >
                          Deactivate
                        </button>
                      )}
                      {!c.isCancelled && c.status !== 'REJECTED' && (
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => handleCancel(c.id)}
                        >
                          Cancel
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <style jsx>{`
        .admin-cases-page {
          padding: 2rem 0;
        }

        .actions-bar {
          margin-bottom: 1.5rem;
        }

        .form-note {
          color: #718096;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .form-hint {
          display: block;
          color: #718096;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group select:disabled {
          background: #f7fafc;
          color: #a0aec0;
        }

        .card-ref-list {
          margin: 0;
          padding-left: 1.25rem;
          font-size: 0.875rem;
          color: #4a5568;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .summary-card.selected {
          border-color: #3b82f6;
        }

        .summary-card.green {
          border-left: 4px solid #38a169;
        }

        .summary-card.orange {
          border-left: 4px solid #dd6b20;
        }

        .summary-card.red {
          border-left: 4px solid #e53e3e;
        }

        .summary-value {
          font-size: 2.5rem;
          font-weight: bold;
          color: #333;
        }

        .summary-label {
          color: #666;
          font-size: 0.875rem;
          margin-top: 0.25rem;
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
          margin-bottom: 0.5rem;
        }

        .form-subtitle {
          color: #666;
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
          margin-top: 1rem;
        }

        .cases-table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow-x: auto;
        }

        .cases-table {
          width: 100%;
          border-collapse: collapse;
        }

        .cases-table th,
        .cases-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .cases-table th {
          background: #f8f9fa;
          font-weight: 600;
        }

        .cases-table tr:hover {
          background: #f8f9fa;
        }

        .cases-table tr.inactive-row {
          background: #f3f4f6;
        }

        .cases-table tr.cancelled-row {
          opacity: 0.6;
          background: #fee2e2;
        }

        .procedure-name {
          font-weight: 500;
        }

        .text-muted {
          color: #9ca3af;
          font-style: italic;
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

        .status-badge.pending {
          background: #feebc8;
          color: #c05621;
        }

        .status-badge.cancelled {
          background: #fed7d7;
          color: #c53030;
        }

        .status-badge.requested {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge.rejected {
          background: #fee2e2;
          color: #991b1b;
        }

        .requested-info {
          color: #6b7280;
          font-size: 0.875rem;
          font-style: italic;
        }

        .rejected-row {
          opacity: 0.7;
          background: #fef2f2;
        }


        .no-cases {
          text-align: center;
          padding: 3rem;
          background: #f3f4f6;
          border-radius: 8px;
          color: #666;
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

        :global([data-theme="dark"]) .summary-card,
        :global([data-theme="dark"]) .form-card,
        :global([data-theme="dark"]) .cases-table-container {
          background: var(--surface-secondary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        :global([data-theme="dark"]) .summary-value {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .summary-label,
        :global([data-theme="dark"]) .form-subtitle,
        :global([data-theme="dark"]) .form-note,
        :global([data-theme="dark"]) .form-hint,
        :global([data-theme="dark"]) .text-muted,
        :global([data-theme="dark"]) .requested-info {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .card-ref-list {
          color: var(--text-secondary);
        }
        :global([data-theme="dark"]) .form-group input,
        :global([data-theme="dark"]) .form-group select {
          background: var(--surface-tertiary);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .form-group select:disabled {
          background: var(--surface-tertiary);
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .cases-table th,
        :global([data-theme="dark"]) .cases-table td {
          border-bottom-color: var(--border-default);
        }
        :global([data-theme="dark"]) .cases-table th {
          background: var(--surface-tertiary);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .cases-table tr:hover {
          background: var(--surface-tertiary);
        }
        :global([data-theme="dark"]) .cases-table tr.inactive-row {
          background: var(--surface-tertiary);
        }
        :global([data-theme="dark"]) .cases-table tr.cancelled-row {
          background: #742a2a;
        }
        :global([data-theme="dark"]) .status-badge.active { background: #22543d; color: #c6f6d5; }
        :global([data-theme="dark"]) .status-badge.pending { background: #744210; color: #feebc8; }
        :global([data-theme="dark"]) .status-badge.cancelled { background: #742a2a; color: #fed7d7; }
        :global([data-theme="dark"]) .status-badge.requested { background: #1e3a5f; color: #dbeafe; }
        :global([data-theme="dark"]) .status-badge.rejected { background: #742a2a; color: #fee2e2; }
        :global([data-theme="dark"]) .rejected-row { background: #442a2a; }
        :global([data-theme="dark"]) .no-cases {
          background: var(--surface-tertiary);
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .alert-success {
          background: #22543d;
          border-color: #276749;
          color: #c6f6d5;
        }
      `}</style>
    </>
  );
}
