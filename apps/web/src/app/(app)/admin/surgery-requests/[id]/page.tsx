'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { ApiError } from '@/lib/api/client';
import {
  getSurgeryRequest,
  returnSurgeryRequest,
  acceptSurgeryRequest,
  rejectSurgeryRequest,
  convertSurgeryRequest,
  completeSurgeryRequestChecklist,
  type SurgeryRequestDetail,
  type SurgeryRequestStatus,
} from '@/lib/api/surgery-requests';

const REASON_CODES = [
  { value: 'MISSING_INFO', label: 'Missing Information' },
  { value: 'INVALID_SURGEON', label: 'Invalid Surgeon' },
  { value: 'PROCEDURE_UNCLEAR', label: 'Procedure Unclear' },
  { value: 'DUPLICATE', label: 'Duplicate Request' },
  { value: 'WRONG_FACILITY', label: 'Wrong Facility' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_BADGE: Record<SurgeryRequestStatus, { bg: string; text: string; label: string }> = {
  SUBMITTED: { bg: 'bg-[var(--color-blue-bg)]', text: 'text-[var(--color-blue-700)]', label: 'Submitted' },
  RETURNED_TO_CLINIC: { bg: 'bg-[var(--color-orange-bg)]', text: 'text-[var(--color-orange-700)]', label: 'Returned to Clinic' },
  ACCEPTED: { bg: 'bg-[var(--color-green-bg)]', text: 'text-[var(--color-green-700)]', label: 'Accepted' },
  REJECTED: { bg: 'bg-[var(--color-red-bg)]', text: 'text-[var(--color-red-700)]', label: 'Rejected' },
  WITHDRAWN: { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: 'Withdrawn' },
  CONVERTED: { bg: 'bg-[var(--color-purple-bg)]', text: 'text-[var(--color-purple-700)]', label: 'Converted' },
};

const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted by clinic',
  RESUBMITTED: 'Resubmitted by clinic',
  RETURNED: 'Returned to clinic',
  ACCEPTED: 'Accepted by ASC',
  REJECTED: 'Rejected by ASC',
  WITHDRAWN: 'Withdrawn by clinic',
  CONVERTED: 'Converted to surgical case',
};

type TabId = 'overview' | 'timeline' | 'checklist' | 'financial';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'financial', label: 'Financial' },
];

const TERMINAL_STATES: SurgeryRequestStatus[] = ['REJECTED', 'WITHDRAWN', 'CONVERTED'];

export default function SurgeryRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const requestId = params.id as string;

  const initialTab = (searchParams.get('tab') as TabId) || 'overview';
  const [detail, setDetail] = useState<SurgeryRequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [isCompletingChecklist, setIsCompletingChecklist] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [reasonCode, setReasonCode] = useState('MISSING_INFO');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getSurgeryRequest(token, requestId);
      setDetail(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surgery request');
    } finally {
      setIsLoading(false);
    }
  }, [token, requestId]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  const handleReturn = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await returnSurgeryRequest(token, requestId, { reasonCode, note: note || undefined });
      setShowReturnModal(false);
      setNote('');
      setSuccessMessage('Request returned to clinic.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await acceptSurgeryRequest(token, requestId, { note: note || undefined });
      setShowAcceptModal(false);
      setNote('');
      setSuccessMessage('Request accepted.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await rejectSurgeryRequest(token, requestId, { reasonCode, note: note || undefined });
      setShowRejectModal(false);
      setNote('');
      setSuccessMessage('Request rejected.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const p = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') p.delete('tab'); else p.set('tab', tab);
    const qs = p.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const handleCompleteChecklist = async (instanceId: string) => {
    if (!token) return;
    setIsCompletingChecklist(true);
    try {
      await completeSurgeryRequestChecklist(token, requestId, instanceId);
      setShowCompleteConfirm(false);
      setSuccessMessage('Checklist marked as complete.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete checklist');
    } finally {
      setIsCompletingChecklist(false);
    }
  };

  const handleConvert = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const result = await convertSurgeryRequest(token, requestId);
      setShowConvertConfirm(false);
      setSuccessMessage(`Converted to surgical case (ID: ${result.surgicalCaseId}).`);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SURGEON_NOT_MAPPED') {
        setError('Surgeon not mapped. Return to clinic with INVALID_SURGEON or map surgeon before converting.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to convert request');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;
  if (!hasRole('ADMIN') && !hasRole('SCHEDULER')) {
    return (
      <>
        <Header title="Surgery Request Detail" />
        <div className="p-6"><div className="alert alert-error">Access denied.</div></div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Header title="Surgery Request Detail" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Header title="Surgery Request Detail" />
        <div className="p-6"><div className="alert alert-error">{error || 'Request not found.'}</div></div>
      </>
    );
  }

  const req = detail.request;
  const status = req.status;
  const badge = STATUS_BADGE[status] || { bg: '', text: '', label: status };

  return (
    <>
      <Header title="Surgery Request Detail" />
      <div className="p-6 max-w-[1000px] mx-auto">
        <button className="btn btn-secondary btn-sm mb-4" onClick={() => router.push('/admin/surgery-requests')}>
          &larr; Back to List
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}
        {successMessage && <div className="alert alert-success mb-4">{successMessage}</div>}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-border pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ──── OVERVIEW TAB ──── */}
        {activeTab === 'overview' && (
          <>
        {/* Read-only banner */}
        <div className="alert alert-info mb-4">
          Clinic-submitted fields are read-only. To request corrections, return the request to the clinic.
        </div>

        {/* Request Summary */}
        <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Request Summary</h2>
            <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Procedure" value={req.procedureName} />
            <Field label="Surgeon" value={req.surgeonName || '—'} />
            <Field label="Patient" value={req.patientDisplayName || req.patientClinicKey || '—'} />
            <Field label="Patient Birth Year" value={req.patientBirthYear?.toString() || '—'} />
            <Field label="Clinic" value={req.clinicName || '—'} />
            <Field label="Source Request ID" value={req.sourceRequestId} />
            <Field label="Scheduled Intent" value={
              req.scheduledDate
                ? `${req.scheduledDate}${req.scheduledTime ? ` at ${req.scheduledTime}` : ''}`
                : 'Not specified'
            } />
            <Field label="Last Submitted" value={formatDateTime(req.lastSubmittedAt)} />
          </div>

          {/* Conversion info */}
          {detail.conversion && (
            <div className="mt-4 p-3 bg-[var(--color-purple-bg)] rounded">
              <span className="text-sm font-medium text-[var(--color-purple-700)]">
                Converted to Case ID: {detail.conversion.surgicalCaseId}
              </span>
              <span className="text-sm text-text-muted ml-2">
                on {formatDateTime(detail.conversion.convertedAt)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        {(status === 'SUBMITTED' || status === 'ACCEPTED') && (
          <div className="bg-surface-primary rounded-lg border border-border p-4 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {status === 'SUBMITTED' && (
                <>
                  <button className="btn btn-success btn-sm" onClick={() => { setNote(''); setShowAcceptModal(true); }}>Accept</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setReasonCode('MISSING_INFO'); setNote(''); setShowReturnModal(true); }}>Return to Clinic</button>
                  <button className="btn btn-danger btn-sm" onClick={() => { setReasonCode('DUPLICATE'); setNote(''); setShowRejectModal(true); }}>Reject</button>
                </>
              )}
              {status === 'ACCEPTED' && hasRole('ADMIN') && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowConvertConfirm(true)}>Convert to Case</button>
              )}
            </div>
          </div>
        )}

        {/* Checklist Responses */}
        {detail.checklistResponses.length > 0 && (
          <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Checklist Responses (Latest Submission)</h3>
            <div className="space-y-2">
              {detail.checklistResponses.map((resp) => (
                <div key={resp.id} className="flex items-start gap-3 py-2 border-b border-border last:border-b-0">
                  <span className="text-sm font-medium text-text-primary min-w-[150px]">{resp.itemKey}</span>
                  <span className="text-sm text-text-secondary">{formatResponseValue(resp.response)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submission History */}
        {detail.submissions.length > 0 && (
          <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Submission History</h3>
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Submitted At</th>
                  <th className="text-left">Received At</th>
                </tr>
              </thead>
              <tbody>
                {detail.submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td>{sub.submissionSeq}</td>
                    <td>{formatDateTime(sub.submittedAt)}</td>
                    <td>{formatDateTime(sub.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit Timeline */}
        {detail.auditEvents.length > 0 && (
          <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Audit Timeline</h3>
            <div className="space-y-3">
              {detail.auditEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 py-2 border-b border-border last:border-b-0">
                  <div className="min-w-[140px] text-xs text-text-muted whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {EVENT_LABELS[event.eventType] || event.eventType}
                    </div>
                    {event.actorName && (
                      <div className="text-xs text-text-muted">by {event.actorName}</div>
                    )}
                    {event.actorType === 'CLINIC' && !event.actorName && (
                      <div className="text-xs text-text-muted">by clinic</div>
                    )}
                    {event.reasonCode && (
                      <div className="text-xs text-text-secondary mt-1">Reason: {event.reasonCode.replace(/_/g, ' ')}</div>
                    )}
                    {event.note && (
                      <div className="text-xs text-text-secondary mt-1">Note: {event.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}

        {/* ──── TIMELINE TAB (Phase 7.2) ──── */}
        {activeTab === 'timeline' && (
          <div className="bg-surface-primary rounded-lg border border-border p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Request Timeline</h3>
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-[var(--color-blue-bg)] text-[var(--color-blue-700)]">
                Phase 7 — Not yet implemented
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Full chronological timeline of surgery request events including status changes,
              actor type (CLINIC / ASC), conversion events, and timestamps.
            </p>
            <div className="bg-surface-secondary rounded p-4 text-sm text-text-muted space-y-2">
              <p><strong>Planned data sources:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li><code>getSurgeryRequest(token, requestId)</code> — detail.auditEvents</li>
                <li><code>detail.submissions</code> — submission history</li>
                <li><code>detail.conversion</code> — conversion event</li>
              </ul>
              <p className="mt-3"><strong>Planned UI:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Unified chronological timeline merging audit events + submissions</li>
                <li>Visual actor type badges (CLINIC vs ASC)</li>
                <li>Status transition arrows with reason codes</li>
                <li>Conversion highlight with linked case ID</li>
              </ul>
            </div>
          </div>
        )}

        {/* ──── CHECKLIST TAB ──── */}
        {activeTab === 'checklist' && (
          <div className="bg-surface-primary rounded-lg border border-border p-6">
            {detail.checklistInstances.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold text-text-primary mb-4">Checklist</h3>
                <div className="text-center py-8 text-text-muted">
                  No checklist was submitted with this request.
                </div>
              </>
            ) : (
              <>
                {detail.checklistInstances.map((inst) => {
                  const isComplete = inst.status === 'COMPLETE';
                  const isTerminal = TERMINAL_STATES.includes(status);
                  // Show responses that belong to this instance
                  const responses = detail.checklistResponses.filter(
                    r => r.instanceId === inst.id
                  );

                  return (
                    <div key={inst.id} className="mb-6 last:mb-0">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-text-primary">
                            {inst.templateName || 'Checklist'}
                            {inst.templateVersion != null && (
                              <span className="text-sm text-text-muted ml-2">v{inst.templateVersion}</span>
                            )}
                          </h3>
                          <p className="text-xs text-text-muted mt-1">
                            Submitted: {formatDateTime(inst.createdAt)}
                          </p>
                        </div>
                        <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                          isComplete
                            ? 'bg-[var(--color-green-bg)] text-[var(--color-green-700)]'
                            : 'bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]'
                        }`}>
                          {inst.status}
                        </span>
                      </div>

                      {/* Checklist responses */}
                      {responses.length > 0 ? (
                        <div className="space-y-2 mb-4">
                          {responses.map((resp) => (
                            <div
                              key={resp.id}
                              className="flex items-start gap-3 py-2 px-3 rounded bg-surface-secondary"
                            >
                              <span className="text-sm font-medium text-text-primary min-w-[180px]">
                                {resp.itemKey.replace(/_/g, ' ')}
                              </span>
                              <span className="text-sm text-text-secondary">
                                {formatResponseValue(resp.response)}
                              </span>
                              <span className="text-xs text-text-muted ml-auto whitespace-nowrap">
                                {resp.actorType === 'CLINIC' ? 'Clinic' : 'ASC'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-text-muted mb-4">
                          No responses recorded for this checklist.
                        </div>
                      )}

                      {/* Complete button */}
                      {!isComplete && !isTerminal && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => setShowCompleteConfirm(true)}
                        >
                          Complete Checklist
                        </button>
                      )}
                      {isComplete && (
                        <div className="text-xs text-text-muted">
                          Completed {inst.updatedAt ? formatDateTime(inst.updatedAt) : ''}
                        </div>
                      )}
                      {isTerminal && !isComplete && (
                        <div className="text-xs text-text-muted">
                          Request is in terminal state ({status}). Checklist cannot be completed.
                        </div>
                      )}

                      {/* Complete Confirm Modal */}
                      {showCompleteConfirm && (
                        <div className="modal-overlay">
                          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[400px]">
                            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
                              <h2 className="text-lg font-semibold text-text-primary">Complete Checklist</h2>
                              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowCompleteConfirm(false)}>&times;</button>
                            </div>
                            <div className="p-6 space-y-4">
                              <p className="text-sm text-text-secondary">
                                Mark this checklist as complete? This action cannot be undone.
                              </p>
                              <div className="flex gap-3 justify-end">
                                <button className="btn btn-secondary" onClick={() => setShowCompleteConfirm(false)}>Cancel</button>
                                <button
                                  className="btn btn-success"
                                  onClick={() => handleCompleteChecklist(inst.id)}
                                  disabled={isCompletingChecklist}
                                >
                                  {isCompletingChecklist ? 'Completing...' : 'Confirm Complete'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ──── FINANCIAL TAB (Phase 7.2) ──── */}
        {activeTab === 'financial' && (
          <div className="bg-surface-primary rounded-lg border border-border p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Financial Details</h3>
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-[var(--color-blue-bg)] text-[var(--color-blue-700)]">
                Phase 7 — Not yet implemented
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Financial attribution and readiness information linked to this surgery request.
            </p>
            <div className="bg-surface-secondary rounded p-4 text-sm text-text-muted space-y-2">
              <p><strong>Planned data sources:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li><code>getFinancialReadinessDetail(token, requestId)</code> — if linked</li>
                <li>Financial readiness declarations, verifications, overrides</li>
              </ul>
              <p className="mt-3"><strong>Planned UI:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Financial readiness state summary</li>
                <li>Link to full financial readiness detail page</li>
                <li>Insurance/authorization status indicators</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Return Modal */}
      {showReturnModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Return to Clinic</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowReturnModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label>Reason</label>
                <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  {REASON_CODES.map((rc) => (
                    <option key={rc.value} value={rc.value}>{rc.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleReturn} disabled={isSubmitting}>
                  {isSubmitting ? 'Returning...' : 'Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accept Modal */}
      {showAcceptModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Accept Request</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowAcceptModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-text-secondary">Accept this surgery request? It can then be converted to a surgical case.</p>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowAcceptModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={handleAccept} disabled={isSubmitting}>
                  {isSubmitting ? 'Accepting...' : 'Accept'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Reject Request</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowRejectModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label>Reason</label>
                <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  {REASON_CODES.map((rc) => (
                    <option key={rc.value} value={rc.value}>{rc.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleReject} disabled={isSubmitting}>
                  {isSubmitting ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert Confirmation */}
      {showConvertConfirm && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[400px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Convert to Case</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowConvertConfirm(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-text-secondary">
                This will create a new surgical case from this request. The request will become read-only after conversion.
              </p>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowConvertConfirm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleConvert} disabled={isSubmitting}>
                  {isSubmitting ? 'Converting...' : 'Convert'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-sm text-text-primary">{value}</div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatResponseValue(response: unknown): string {
  if (response === null || response === undefined) return '—';
  if (typeof response === 'boolean') return response ? 'Yes' : 'No';
  if (typeof response === 'string') return response;
  if (typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if ('value' in obj) return String(obj.value);
    return JSON.stringify(response);
  }
  return String(response);
}
