'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { TimeSelect } from '@/components/TimeSelect';
import { getCases, createCase, approveCase, rejectCase, type Case } from '@/lib/api/cases';
import { getSurgeons, type User } from '@/lib/api/users';
import { getRooms, type Room } from '@/lib/api/settings';
import { ReadinessBadge } from '@/components/ReadinessBadge';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  // Handle both ISO timestamps and date-only strings
  const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return 'Not set';
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

function formatDateTime(isoStr: string | null): string {
  if (!isoStr) return 'Unknown';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const statusBadgeBase = 'py-1 px-3 rounded-full text-sm font-medium inline-block';

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'REQUESTED':
      return `${statusBadgeBase} bg-[var(--color-blue-100)] text-[var(--color-blue-600)]`;
    case 'SCHEDULED':
      return `${statusBadgeBase} bg-[var(--color-green-bg)] text-[var(--color-green-700)]`;
    case 'READY':
      return `${statusBadgeBase} bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]`;
    case 'IN_PROGRESS':
      return `${statusBadgeBase} bg-[var(--color-blue-50)] text-[var(--color-blue-600)]`;
    case 'COMPLETED':
      return `${statusBadgeBase} bg-[var(--color-gray-200)] text-[var(--color-gray-700)]`;
    case 'REJECTED':
      return `${statusBadgeBase} bg-[var(--color-red-bg)] text-[var(--color-red)]`;
    case 'CANCELLED':
      return `${statusBadgeBase} bg-[var(--color-gray-100)] text-text-muted`;
    default:
      return statusBadgeBase;
  }
}

export default function CasesPage() {
  const { user, token } = useAuth();

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
  const [approvalRoomId, setApprovalRoomId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);

  // Rejection form state (ADMIN/SCHEDULER only)
  const [rejectingCase, setRejectingCase] = useState<Case | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Check if user can approve/reject
  const { hasRole } = useAccessControl();
  const canManageCases = hasRole('ADMIN') || hasRole('SCHEDULER');

  // Search and sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'surgeon' | 'procedure'>('date-desc');

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
        roomId: approvalRoomId || undefined,
      });
      setSuccessMessage('Case approved and scheduled successfully');
      setApprovingCase(null);
      setApprovalDate('');
      setApprovalTime('');
      setApprovalRoomId('');
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

  const startApproval = async (c: Case) => {
    setApprovingCase(c);
    setApprovalDate(c.requestedDate || '');
    setApprovalTime(c.requestedTime || '');
    setApprovalRoomId('');

    // Fetch rooms for the dropdown
    if (token) {
      try {
        const result = await getRooms(token);
        setRooms(result.rooms);
      } catch (err) {
        console.error('Failed to load rooms:', err);
      }
    }
  };

  const startRejection = (c: Case) => {
    setRejectingCase(c);
    setRejectionReason('');
  };

  return (
    <div>
      <Header title="My Case Requests" />

      <main className="container-full py-8 px-6">
        <div>
          <div className="page-header">
            <h1>My Case Requests</h1>
            <button className="btn btn-create" onClick={() => setShowCreateForm(true)}>
              + New Case Request
            </button>
          </div>

          {error && (
            <div className="alert alert-error">
              <strong>Error:</strong> {error}
              <button className="bg-transparent border-none text-xl cursor-pointer text-inherit opacity-70 hover:opacity-100" onClick={() => setError('')}>&times;</button>
            </div>
          )}

          {successMessage && (
            <div className="alert alert-success">
              {successMessage}
              <button className="bg-transparent border-none text-xl cursor-pointer text-inherit opacity-70 hover:opacity-100" onClick={() => setSuccessMessage('')}>&times;</button>
            </div>
          )}

          {/* Search and Sort Controls */}
          <div className="flex gap-4 mb-6 flex-wrap items-center">
            <div className="flex-1 min-w-[200px] max-w-[400px] relative">
              <input
                type="text"
                placeholder="Search by case #, surgeon, or procedure..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full py-[0.625rem] pr-8 pl-3 border border-border rounded-md text-[0.9375rem] bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
              />
              {searchTerm && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-xl text-text-muted cursor-pointer p-1 leading-none hover:text-text-primary" onClick={() => setSearchTerm('')}>&times;</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="sortBy" className="font-medium text-text-secondary text-sm whitespace-nowrap">Sort by:</label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="py-2 px-3 border border-border rounded-md text-sm bg-surface-primary text-text-primary cursor-pointer focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
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
              <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center py-4 px-6 border-b border-border">
                  <h2 className="m-0 text-xl font-semibold text-text-primary">New Case Request</h2>
                  <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={() => setShowCreateForm(false)}>&times;</button>
                </div>

                <form onSubmit={handleCreate} className="p-6">
                  <div className="form-group">
                    <label htmlFor="surgeonId" className="block mb-2 font-medium text-text-secondary">Surgeon*</label>
                    <select
                      id="surgeonId"
                      value={createFormData.surgeonId}
                      onChange={(e) => setCreateFormData({ ...createFormData, surgeonId: e.target.value })}
                      required
                      className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                    >
                      <option value="">Select surgeon</option>
                      {surgeons.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="procedureName" className="block mb-2 font-medium text-text-secondary">Procedure Name*</label>
                    <input
                      id="procedureName"
                      type="text"
                      value={createFormData.procedureName}
                      onChange={(e) => setCreateFormData({ ...createFormData, procedureName: e.target.value })}
                      required
                      className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label htmlFor="requestedDate" className="block mb-2 font-medium text-text-secondary">Requested Date (Optional)</label>
                      <input
                        id="requestedDate"
                        type="date"
                        value={createFormData.requestedDate}
                        onChange={(e) => setCreateFormData({ ...createFormData, requestedDate: e.target.value })}
                        className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                      />
                      <small className="block mt-1 text-xs text-text-muted">Your preferred date - admin will review</small>
                    </div>

                    <div className="form-group">
                      <label htmlFor="requestedTime" className="block mb-2 font-medium text-text-secondary">Requested Time (Optional)</label>
                      <input
                        id="requestedTime"
                        type="time"
                        value={createFormData.requestedTime}
                        onChange={(e) => setCreateFormData({ ...createFormData, requestedTime: e.target.value })}
                        className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                      />
                      <small className="block mt-1 text-xs text-text-muted">Your preferred time - admin will review</small>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="notes" className="block mb-2 font-medium text-text-secondary">Notes</label>
                    <textarea
                      id="notes"
                      value={createFormData.notes}
                      onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                      rows={3}
                      className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
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
              <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center py-4 px-6 border-b border-border">
                  <h2 className="m-0 text-xl font-semibold text-text-primary">Approve & Schedule Case</h2>
                  <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={() => setApprovingCase(null)}>&times;</button>
                </div>

                <form onSubmit={handleApprove} className="p-6">
                  <div className="bg-surface-tertiary p-4 rounded-md mb-4 border border-border text-text-primary [&>div]:mb-1 [&>div:last-child]:mb-0">
                    <div><strong>Procedure:</strong> {approvingCase.procedureName}</div>
                    <div><strong>Surgeon:</strong> Dr. {approvingCase.surgeonName}</div>
                    {(approvingCase.requestedDate || approvingCase.requestedTime) && (
                      <div className="mt-2 pt-2 border-t border-dashed border-border text-text-muted">
                        <strong>Requested:</strong> {approvingCase.requestedDate ? formatDate(approvingCase.requestedDate) : ''} {approvingCase.requestedTime ? formatTime(approvingCase.requestedTime) : ''}
                        <small className="text-text-muted"> (for reference)</small>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label htmlFor="approvalDate" className="block mb-2 font-medium text-text-secondary">Scheduled Date*</label>
                      <input
                        id="approvalDate"
                        type="date"
                        value={approvalDate}
                        onChange={(e) => setApprovalDate(e.target.value)}
                        required
                        className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="approvalTime" className="block mb-2 font-medium text-text-secondary">Scheduled Time (24h)</label>
                      <TimeSelect
                        id="approvalTime"
                        value={approvalTime}
                        onChange={setApprovalTime}
                        startHour={6}
                        endHour={18}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="approvalRoom" className="block mb-2 font-medium text-text-secondary">Operating Room</label>
                    <select
                      id="approvalRoom"
                      value={approvalRoomId}
                      onChange={(e) => setApprovalRoomId(e.target.value)}
                      className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                    >
                      <option value="">Select room (optional)</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
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
              <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center py-4 px-6 border-b border-border">
                  <h2 className="m-0 text-xl font-semibold text-text-primary">Reject Case Request</h2>
                  <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={() => setRejectingCase(null)}>&times;</button>
                </div>

                <form onSubmit={handleReject} className="p-6">
                  <div className="bg-surface-tertiary p-4 rounded-md mb-4 border border-border text-text-primary [&>div]:mb-1 [&>div:last-child]:mb-0">
                    <div><strong>Procedure:</strong> {rejectingCase.procedureName}</div>
                    <div><strong>Surgeon:</strong> Dr. {rejectingCase.surgeonName}</div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="rejectionReason" className="block mb-2 font-medium text-text-secondary">Rejection Reason*</label>
                    <textarea
                      id="rejectionReason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      required
                      rows={4}
                      placeholder="Provide a reason for rejecting this case request..."
                      className="w-full py-2 px-3 border border-border rounded-md text-base bg-surface-primary text-text-primary focus:outline-none focus:border-[var(--color-blue-500)] focus:ring-[3px] focus:ring-blue-500/10"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
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
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : (
            <>
              {/* Pending Requests Section - Highlighted at Top */}
              {pendingCases.length > 0 && (
                <section className="mb-8 p-6 bg-gradient-to-br from-[var(--color-blue-50)] to-[var(--color-blue-100)] border-2 border-[var(--color-blue-500)] rounded-xl">
                  <h2 className="m-0 mb-4 text-xl font-semibold text-[var(--color-blue-500)]">
                    Pending Approval ({pendingCases.length})
                  </h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {pendingCases.map((c) => (
                      <div key={c.id} className="bg-surface-primary rounded-lg shadow-[0_2px_8px_var(--shadow-sm)] overflow-hidden border border-border">
                        <div className="py-3 px-4 bg-surface-secondary border-b border-border flex justify-between items-center">
                          <span className="font-mono font-semibold text-text-primary text-sm">{c.caseNumber}</span>
                          <span className={getStatusBadgeClass(c.status)}>REQUESTED</span>
                        </div>
                        <div className="p-4">
                          <div className="text-[1.1rem] font-semibold text-text-primary mb-1">{c.procedureName}</div>
                          <div className="text-text-secondary mb-2">Dr. {c.surgeonName}</div>
                          <div className="text-[0.8125rem] text-text-muted mb-1">
                            Submitted: {formatDateTime(c.createdAt)}
                          </div>
                          {(c.requestedDate || c.requestedTime) && (
                            <div className="text-sm text-text-muted mb-2">
                              Preferred: {c.requestedDate ? formatDate(c.requestedDate) : ''} {c.requestedTime ? formatTime(c.requestedTime) : ''}
                            </div>
                          )}
                          {c.notes && <div className="text-sm text-text-muted italic pt-2 border-t border-dashed border-border">{c.notes}</div>}
                        </div>
                        {canManageCases ? (
                          <div className="py-3 px-4 bg-surface-secondary border-t border-border flex gap-2 justify-end">
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
                          <div className="py-3 px-4 bg-[var(--color-orange-bg)] text-[var(--color-orange-700)] text-sm font-medium text-center">
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
                <section className="mt-6">
                  <h2 className="m-0 mb-4 text-[1.1rem] font-semibold text-text-primary pb-2 border-b-2 border-border">Case History</h2>
                  <div className="bg-surface-primary rounded-lg overflow-hidden shadow-[0_1px_3px_var(--shadow-sm)]">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Case #</th>
                          <th>Status</th>
                          <th>Readiness</th>
                          <th>Surgeon</th>
                          <th>Procedure</th>
                          <th>Scheduled Date/Time</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherCases.map((c) => (
                          <tr key={c.id}>
                            <td className="font-mono font-semibold text-text-primary whitespace-nowrap">{c.caseNumber}</td>
                            <td>
                              <span className={getStatusBadgeClass(c.status)}>
                                {c.status}
                              </span>
                            </td>
                            <td><ReadinessBadge overall="UNKNOWN" /></td>
                            <td>Dr. {c.surgeonName}</td>
                            <td>{c.procedureName}</td>
                            <td>
                              {c.status === 'REJECTED' ? (
                                <span className="text-text-muted">Rejected</span>
                              ) : c.scheduledDate ? (
                                <div>
                                  {formatDate(c.scheduledDate)} {formatTime(c.scheduledTime)}
                                </div>
                              ) : (
                                <span className="text-text-muted">Not scheduled</span>
                              )}
                            </td>
                            <td>
                              {c.status === 'REJECTED' && c.rejectionReason ? (
                                <div className="text-[var(--color-red)] text-sm">
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
                <div className="text-center p-12 bg-surface-secondary rounded-lg text-text-muted">
                  <p>No case requests yet. Click &ldquo;New Case Request&rdquo; to get started.</p>
                </div>
              )}

              {/* No Search Results */}
              {cases.length > 0 && filteredCases.length === 0 && (
                <div className="text-center p-12 bg-surface-secondary rounded-lg text-text-muted">
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
    </div>
  );
}
