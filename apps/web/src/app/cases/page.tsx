'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCases,
  createCase,
  approveCase,
  rejectCase,
  getSurgeons,
  type Case,
  type User,
} from '@/lib/api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
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

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'REQUESTED':
      return 'status-badge requested';
    case 'SCHEDULED':
      return 'status-badge scheduled';
    case 'READY':
      return 'status-badge ready';
    case 'IN_PROGRESS':
      return 'status-badge in-progress';
    case 'COMPLETED':
      return 'status-badge completed';
    case 'REJECTED':
      return 'status-badge rejected';
    case 'CANCELLED':
      return 'status-badge cancelled';
    default:
      return 'status-badge';
  }
}

export default function CasesPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [cases, setCases] = useState<Case[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    surgeonId: '',
    procedureName: '',
    requestedDate: '',
    requestedTime: '',
    notes: '',
  });

  // Approval form state (ADMIN/SCHEDULER only)
  const [approvingCase, setApprovingCase] = useState<Case | null>(null);
  const [approvalDate, setApprovalDate] = useState('');
  const [approvalTime, setApprovalTime] = useState('');

  // Rejection form state (ADMIN/SCHEDULER only)
  const [rejectingCase, setRejectingCase] = useState<Case | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Check if user can approve/reject
  const canManageCases = user?.role === 'ADMIN' || user?.role === 'SCHEDULER';

  // Search and sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'surgeon' | 'procedure'>('date-desc');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [casesResult, surgeonsResult] = await Promise.all([
        getCases(token),
        getSurgeons(token),
      ]);
      setCases(casesResult.cases);
      setSurgeons(surgeonsResult.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, loadData]);

  // Filter and sort cases
  const filterAndSortCases = (casesToFilter: Case[]) => {
    let filtered = casesToFilter;

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.caseNumber?.toLowerCase().includes(term) ||
        c.surgeonName?.toLowerCase().includes(term) ||
        c.procedureName.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc': {
          const dateA = a.scheduledDate || a.requestedDate || '';
          const dateB = b.scheduledDate || b.requestedDate || '';
          return dateA.localeCompare(dateB);
        }
        case 'date-desc': {
          const dateA = a.scheduledDate || a.requestedDate || '';
          const dateB = b.scheduledDate || b.requestedDate || '';
          return dateB.localeCompare(dateA);
        }
        case 'surgeon':
          return (a.surgeonName || '').localeCompare(b.surgeonName || '');
        case 'procedure':
          return a.procedureName.localeCompare(b.procedureName);
        default:
          return 0;
      }
    });
  };

  const filteredCases = filterAndSortCases(cases);
  const pendingCases = filteredCases.filter(c => c.status === 'REQUESTED');
  const otherCases = filteredCases.filter(c => c.status !== 'REQUESTED');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      // Only include fields that have values - don't send null/empty
      const caseData: Record<string, string> = {
        surgeonId: createFormData.surgeonId,
        procedureName: createFormData.procedureName,
      };
      if (createFormData.requestedDate) {
        caseData.requestedDate = createFormData.requestedDate;
      }
      if (createFormData.requestedTime) {
        caseData.requestedTime = createFormData.requestedTime;
      }
      if (createFormData.notes) {
        caseData.notes = createFormData.notes;
      }

      await createCase(token, caseData);
      setSuccessMessage('Case request submitted successfully. An admin or scheduler will review your request.');
      setShowCreateForm(false);
      setCreateFormData({
        surgeonId: '',
        procedureName: '',
        requestedDate: '',
        requestedTime: '',
        notes: '',
      });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case request');
    }
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !approvingCase) return;

    try {
      await approveCase(token, approvingCase.id, {
        scheduledDate: approvalDate,
        scheduledTime: approvalTime || undefined,
      });
      setSuccessMessage('Case approved and scheduled successfully');
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
    setApprovalDate(c.requestedDate || '');
    setApprovalTime(c.requestedTime || '');
  };

  const startRejection = (c: Case) => {
    setRejectingCase(c);
    setRejectionReason('');
  };

  if (isLoading || !user) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Header title="My Case Requests" />

      <main className="main-content">
        <div className="content-wrapper">
          <div className="page-header">
            <h1>My Case Requests</h1>
            <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
              + New Case Request
            </button>
          </div>

          {error && (
            <div className="alert alert-error">
              <strong>Error:</strong> {error}
              <button className="alert-close" onClick={() => setError('')}>×</button>
            </div>
          )}

          {successMessage && (
            <div className="alert alert-success">
              {successMessage}
              <button className="alert-close" onClick={() => setSuccessMessage('')}>×</button>
            </div>
          )}

          {/* Search and Sort Controls */}
          <div className="search-sort-controls">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by case #, surgeon, or procedure..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button className="search-clear" onClick={() => setSearchTerm('')}>×</button>
              )}
            </div>
            <div className="sort-box">
              <label htmlFor="sortBy">Sort by:</label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="sort-select"
              >
                <option value="date-desc">Date (Newest First)</option>
                <option value="date-asc">Date (Oldest First)</option>
                <option value="surgeon">Surgeon Name</option>
                <option value="procedure">Procedure Name</option>
              </select>
            </div>
          </div>

          {/* Create Form Modal */}
          {showCreateForm && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h2>New Case Request</h2>
                  <button className="modal-close" onClick={() => setShowCreateForm(false)}>×</button>
                </div>

                <form onSubmit={handleCreate} className="form">
                  <div className="form-group">
                    <label htmlFor="surgeonId">Surgeon*</label>
                    <select
                      id="surgeonId"
                      value={createFormData.surgeonId}
                      onChange={(e) => setCreateFormData({ ...createFormData, surgeonId: e.target.value })}
                      required
                    >
                      <option value="">Select surgeon</option>
                      {surgeons.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="procedureName">Procedure Name*</label>
                    <input
                      id="procedureName"
                      type="text"
                      value={createFormData.procedureName}
                      onChange={(e) => setCreateFormData({ ...createFormData, procedureName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="requestedDate">Requested Date (Optional)</label>
                      <input
                        id="requestedDate"
                        type="date"
                        value={createFormData.requestedDate}
                        onChange={(e) => setCreateFormData({ ...createFormData, requestedDate: e.target.value })}
                      />
                      <small className="help-text">Your preferred date - admin will review</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="requestedTime">Requested Time (Optional)</label>
                      <input
                        id="requestedTime"
                        type="time"
                        value={createFormData.requestedTime}
                        onChange={(e) => setCreateFormData({ ...createFormData, requestedTime: e.target.value })}
                      />
                      <small className="help-text">Your preferred time - admin will review</small>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="notes">Notes</label>
                    <textarea
                      id="notes"
                      value={createFormData.notes}
                      onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Submit Request
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Approval Modal */}
          {approvingCase && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h2>Approve & Schedule Case</h2>
                  <button className="modal-close" onClick={() => setApprovingCase(null)}>×</button>
                </div>

                <form onSubmit={handleApprove} className="form">
                  <div className="approval-case-info">
                    <div><strong>Procedure:</strong> {approvingCase.procedureName}</div>
                    <div><strong>Surgeon:</strong> Dr. {approvingCase.surgeonName}</div>
                    {(approvingCase.requestedDate || approvingCase.requestedTime) && (
                      <div className="requested-reference">
                        <strong>Requested:</strong> {approvingCase.requestedDate ? formatDate(approvingCase.requestedDate) : ''} {approvingCase.requestedTime ? formatTime(approvingCase.requestedTime) : ''}
                        <small> (for reference)</small>
                      </div>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="approvalDate">Scheduled Date*</label>
                      <input
                        id="approvalDate"
                        type="date"
                        value={approvalDate}
                        onChange={(e) => setApprovalDate(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="approvalTime">Scheduled Time</label>
                      <input
                        id="approvalTime"
                        type="time"
                        value={approvalTime}
                        onChange={(e) => setApprovalTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setApprovingCase(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Approve & Schedule
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Rejection Modal */}
          {rejectingCase && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h2>Reject Case Request</h2>
                  <button className="modal-close" onClick={() => setRejectingCase(null)}>×</button>
                </div>

                <form onSubmit={handleReject} className="form">
                  <div className="approval-case-info">
                    <div><strong>Procedure:</strong> {rejectingCase.procedureName}</div>
                    <div><strong>Surgeon:</strong> Dr. {rejectingCase.surgeonName}</div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="rejectionReason">Rejection Reason*</label>
                    <textarea
                      id="rejectionReason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      required
                      rows={4}
                      placeholder="Provide a reason for rejecting this case request..."
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setRejectingCase(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-danger">
                      Reject Request
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Cases Display */}
          {isLoadingData ? (
            <div className="loading-container">
              <div className="spinner"></div>
            </div>
          ) : (
            <>
              {/* Pending Requests Section - Highlighted at Top */}
              {pendingCases.length > 0 && (
                <section className="pending-section">
                  <h2 className="section-title">
                    Pending Approval ({pendingCases.length})
                  </h2>
                  <div className="pending-grid">
                    {pendingCases.map((c) => (
                      <div key={c.id} className="pending-card">
                        <div className="pending-card-header">
                          <span className="case-number">{c.caseNumber}</span>
                          <span className={getStatusBadgeClass(c.status)}>REQUESTED</span>
                        </div>
                        <div className="pending-card-body">
                          <div className="pending-procedure">{c.procedureName}</div>
                          <div className="pending-surgeon">Dr. {c.surgeonName}</div>
                          {(c.requestedDate || c.requestedTime) && (
                            <div className="pending-datetime">
                              Requested: {c.requestedDate ? formatDate(c.requestedDate) : ''} {c.requestedTime ? formatTime(c.requestedTime) : ''}
                            </div>
                          )}
                          {c.notes && <div className="pending-notes">{c.notes}</div>}
                        </div>
                        {canManageCases ? (
                          <div className="pending-card-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => startApproval(c)}
                            >
                              Approve & Schedule
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => startRejection(c)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="pending-card-footer">
                            Awaiting admin/scheduler review
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Other Cases Table */}
              {otherCases.length > 0 && (
                <section className="other-cases-section">
                  <h2 className="section-title">Case History</h2>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Case #</th>
                          <th>Status</th>
                          <th>Surgeon</th>
                          <th>Procedure</th>
                          <th>Scheduled Date/Time</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherCases.map((c) => (
                          <tr key={c.id}>
                            <td className="case-number-cell">{c.caseNumber}</td>
                            <td>
                              <span className={getStatusBadgeClass(c.status)}>
                                {c.status}
                              </span>
                            </td>
                            <td>Dr. {c.surgeonName}</td>
                            <td>{c.procedureName}</td>
                            <td>
                              {c.status === 'REJECTED' ? (
                                <span className="text-muted">Rejected</span>
                              ) : c.scheduledDate ? (
                                <div>
                                  {formatDate(c.scheduledDate)} {formatTime(c.scheduledTime)}
                                </div>
                              ) : (
                                <span className="text-muted">Not scheduled</span>
                              )}
                            </td>
                            <td>
                              {c.status === 'REJECTED' && c.rejectionReason ? (
                                <div className="rejection-reason">
                                  <strong>Reason:</strong> {c.rejectionReason}
                                </div>
                              ) : (
                                c.notes || '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Empty State */}
              {cases.length === 0 && (
                <div className="empty-state">
                  <p>No case requests yet. Click &ldquo;New Case Request&rdquo; to get started.</p>
                </div>
              )}

              {/* No Search Results */}
              {cases.length > 0 && filteredCases.length === 0 && (
                <div className="empty-state">
                  <p>No cases match your search &ldquo;{searchTerm}&rdquo;</p>
                  <button className="btn btn-secondary" onClick={() => setSearchTerm('')}>
                    Clear Search
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <style jsx>{`
        /* Search and Sort Controls */
        .search-sort-controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .search-box {
          flex: 1;
          min-width: 200px;
          max-width: 400px;
          position: relative;
        }

        .search-input {
          width: 100%;
          padding: 0.625rem 2rem 0.625rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
          background: white;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .search-clear {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 1.25rem;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
        }

        .search-clear:hover {
          color: #374151;
        }

        .sort-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sort-box label {
          font-weight: 500;
          color: #374151;
          font-size: 0.875rem;
          white-space: nowrap;
        }

        .sort-select {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
          background: white;
          cursor: pointer;
        }

        .sort-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        /* Pending Section Styles */
        .pending-section {
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 2px solid #3b82f6;
          border-radius: 12px;
        }

        .section-title {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #1e40af;
        }

        .pending-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .pending-card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }

        .pending-card-header {
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .case-number {
          font-family: monospace;
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
        }

        .case-number-cell {
          font-family: monospace;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
        }

        .pending-card-body {
          padding: 1rem;
        }

        .pending-procedure {
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .pending-surgeon {
          color: #4b5563;
          margin-bottom: 0.5rem;
        }

        .pending-datetime {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .pending-notes {
          font-size: 0.875rem;
          color: #6b7280;
          font-style: italic;
          padding-top: 0.5rem;
          border-top: 1px dashed #e5e7eb;
        }

        .pending-card-footer {
          padding: 0.75rem 1rem;
          background: #fef3c7;
          color: #92400e;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: center;
        }

        .pending-card-actions {
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
        }

        .btn-danger {
          background: #dc2626;
          color: white;
        }

        .btn-danger:hover {
          background: #b91c1c;
        }

        .approval-case-info {
          background: #f9fafb;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          border: 1px solid #e5e7eb;
        }

        .approval-case-info div {
          margin-bottom: 0.25rem;
        }

        .approval-case-info div:last-child {
          margin-bottom: 0;
        }

        .requested-reference {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px dashed #d1d5db;
          color: #6b7280;
        }

        .requested-reference small {
          color: #9ca3af;
        }

        .other-cases-section {
          margin-top: 1.5rem;
        }

        .other-cases-section .section-title {
          color: #374151;
          font-size: 1.1rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }

        .data-table th {
          background: #f9fafb;
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
        }

        .data-table tr:hover {
          background: #f9fafb;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          background: #f9fafb;
          border-radius: 8px;
          color: #6b7280;
        }

        /* Modal Styles */
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
          z-index: 1000;
        }

        .modal {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          line-height: 1;
        }

        .modal-close:hover {
          color: #111827;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
          margin-top: 1rem;
        }

        /* Form Styles */
        .form {
          padding: 1.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #374151;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 1rem;
          background: white;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .help-text {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.75rem;
          color: #6b7280;
        }

        /* Button Styles */
        .btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          font-size: 0.875rem;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }

        /* Alert Styles */
        .alert {
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .alert-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .alert-success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .alert-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          color: inherit;
          opacity: 0.7;
        }

        .alert-close:hover {
          opacity: 1;
        }

        /* Status Badge Styles */
        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .status-badge.requested {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge.scheduled {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.ready {
          background: #fef3c7;
          color: #92400e;
        }

        .status-badge.in-progress {
          background: #e0e7ff;
          color: #3730a3;
        }

        .status-badge.completed {
          background: #d1d5db;
          color: #1f2937;
        }

        .status-badge.rejected {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-badge.cancelled {
          background: #f3f4f6;
          color: #6b7280;
        }

        .requested-info {
          color: #6b7280;
          font-size: 0.875rem;
          font-style: italic;
        }

        .rejection-reason {
          color: #dc2626;
          font-size: 0.875rem;
        }

        .text-muted {
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
}
