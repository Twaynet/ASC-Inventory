'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getFinancialReadinessDetail,
  recordClinicDeclaration,
  recordAscVerification,
  recordFinancialOverride,
  type FinancialReadinessDetail,
  type FinancialRiskState,
} from '@/lib/api/financial-readiness';

const RISK_BADGE: Record<FinancialRiskState, { bg: string; text: string; label: string }> = {
  HIGH: { bg: 'bg-[var(--color-red-bg)]', text: 'text-[var(--color-red-700)]', label: 'High Risk' },
  MEDIUM: { bg: 'bg-[var(--color-orange-bg)]', text: 'text-[var(--color-orange-700)]', label: 'Medium Risk' },
  LOW: { bg: 'bg-[var(--color-green-bg)]', text: 'text-[var(--color-green-700)]', label: 'Low Risk' },
  UNKNOWN: { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: 'Unknown' },
};

const CLINIC_REASON_CODES = [
  { value: 'MISSING_AUTH', label: 'Missing Authorization' },
  { value: 'HIGH_DEDUCTIBLE', label: 'High Deductible' },
  { value: 'COVERAGE_UNCERTAIN', label: 'Coverage Uncertain' },
  { value: 'SELF_PAY_UNCONFIRMED', label: 'Self-Pay Unconfirmed' },
  { value: 'OTHER', label: 'Other' },
];

const ASC_REASON_CODES = [
  { value: 'BENEFIT_UNCONFIRMED', label: 'Benefit Unconfirmed' },
  { value: 'AUTH_PENDING', label: 'Authorization Pending' },
  { value: 'PATIENT_BALANCE_UNRESOLVED', label: 'Patient Balance Unresolved' },
  { value: 'COVERAGE_DENIED', label: 'Coverage Denied' },
  { value: 'OTHER', label: 'Other' },
];

const OVERRIDE_REASON_CODES = [
  { value: 'ADMIN_JUDGMENT', label: 'Admin Judgment' },
  { value: 'URGENT_CASE', label: 'Urgent Case' },
  { value: 'CLINIC_CONFIRMED', label: 'Clinic Confirmed' },
  { value: 'PATIENT_PAID', label: 'Patient Paid' },
  { value: 'OTHER', label: 'Other' },
];

export default function FinancialReadinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const requestId = params.requestId as string;

  const [detail, setDetail] = useState<FinancialReadinessDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal state
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  // Form state
  const [declareState, setDeclareState] = useState('DECLARED_CLEARED');
  const [declareReasons, setDeclareReasons] = useState<string[]>([]);
  const [verifyState, setVerifyState] = useState('VERIFIED_CLEARED');
  const [verifyReasons, setVerifyReasons] = useState<string[]>([]);
  const [overrideState, setOverrideState] = useState('OVERRIDE_CLEARED');
  const [overrideReason, setOverrideReason] = useState('ADMIN_JUDGMENT');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getFinancialReadinessDetail(token, requestId);
      setDetail(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial readiness data');
    } finally {
      setIsLoading(false);
    }
  }, [token, requestId]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  const handleDeclare = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await recordClinicDeclaration(token, requestId, {
        state: declareState,
        reasonCodes: declareReasons,
        note: note || undefined,
      });
      setShowDeclareModal(false);
      setNote('');
      setDeclareReasons([]);
      setSuccessMessage('Clinic declaration recorded.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record declaration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await recordAscVerification(token, requestId, {
        state: verifyState,
        reasonCodes: verifyReasons,
        note: note || undefined,
      });
      setShowVerifyModal(false);
      setNote('');
      setVerifyReasons([]);
      setSuccessMessage('ASC verification recorded.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverride = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await recordFinancialOverride(token, requestId, {
        state: overrideState,
        reasonCode: overrideState === 'NONE' ? null : overrideReason,
        note: note || undefined,
      });
      setShowOverrideModal(false);
      setNote('');
      setSuccessMessage(overrideState === 'NONE' ? 'Override cleared.' : 'Override recorded.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record override');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleReason = (list: string[], setList: (v: string[]) => void, code: string) => {
    setList(list.includes(code) ? list.filter(c => c !== code) : [...list, code]);
  };

  if (!user) return null;
  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Financial Readiness Detail" />
        <div className="p-6"><div className="alert alert-error">Access denied.</div></div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Header title="Financial Readiness Detail" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Header title="Financial Readiness Detail" />
        <div className="p-6"><div className="alert alert-error">{error || 'Request not found.'}</div></div>
      </>
    );
  }

  const req = detail.request;
  const cache = detail.cache;
  const riskBadge = RISK_BADGE[cache.riskState] || RISK_BADGE.UNKNOWN;

  // Build interleaved timeline
  const timeline = buildTimeline(detail);

  return (
    <>
      <Header title="Financial Readiness Detail" />
      <div className="p-6 max-w-[1000px] mx-auto">
        <button className="btn btn-secondary btn-sm mb-4" onClick={() => router.push('/admin/financial-readiness')}>
          &larr; Back to Dashboard
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}
        {successMessage && <div className="alert alert-success mb-4">{successMessage}</div>}

        <div className="alert alert-info mb-4">
          Observational tracking only — does not block scheduling or case creation.
        </div>

        {/* Request Summary */}
        <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Request Summary</h2>
            <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${riskBadge.bg} ${riskBadge.text}`}>
              {riskBadge.label}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Procedure" value={req.procedureName} />
            <Field label="Surgeon" value={req.surgeonName || '—'} />
            <Field label="Patient" value={req.patientDisplayName || '—'} />
            <Field label="Clinic" value={req.clinicName || '—'} />
            <Field label="Scheduled Date" value={req.scheduledDate || 'Not specified'} />
            <Field label="Request Status" value={req.status} />
          </div>
        </div>

        {/* Current Financial State */}
        <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Current Financial State</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-text-muted mb-1">Clinic Declaration</div>
              <div className="text-sm font-medium text-text-primary">{formatState(cache.clinicState)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">ASC Verification</div>
              <div className="text-sm font-medium text-text-primary">{formatState(cache.ascState)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Override</div>
              <div className="text-sm font-medium text-text-primary">{formatState(cache.overrideState)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Computed Risk</div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${riskBadge.bg} ${riskBadge.text}`}>
                {riskBadge.label}
              </span>
            </div>
          </div>
          {cache.recomputedAt && (
            <div className="mt-3 text-xs text-text-muted">
              Last recomputed: {formatDateTime(cache.recomputedAt)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-surface-primary rounded-lg border border-border p-4 mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => { setNote(''); setDeclareReasons([]); setShowDeclareModal(true); }}>
              Record Declaration
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setNote(''); setVerifyReasons([]); setShowVerifyModal(true); }}>
              Record Verification
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setNote(''); setOverrideState('OVERRIDE_CLEARED'); setOverrideReason('ADMIN_JUDGMENT'); setShowOverrideModal(true); }}>
              Override
            </button>
          </div>
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="bg-surface-primary rounded-lg border border-border p-6 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Financial Event Timeline</h3>
            <div className="space-y-3">
              {timeline.map((event) => (
                <div key={event.id} className="flex items-start gap-3 py-2 border-b border-border last:border-b-0">
                  <div className="min-w-[140px] text-xs text-text-muted whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-2 ${event.typeBg} ${event.typeText}`}>
                        {event.typeLabel}
                      </span>
                      {event.stateLabel}
                    </div>
                    {event.actorName && (
                      <div className="text-xs text-text-muted">by {event.actorName}</div>
                    )}
                    {event.reasonCodes && event.reasonCodes.length > 0 && (
                      <div className="text-xs text-text-secondary mt-1">
                        Reasons: {event.reasonCodes.map(r => r.replace(/_/g, ' ')).join(', ')}
                      </div>
                    )}
                    {event.reasonCode && (
                      <div className="text-xs text-text-secondary mt-1">
                        Reason: {event.reasonCode.replace(/_/g, ' ')}
                      </div>
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
      </div>

      {/* Declare Modal */}
      {showDeclareModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Record Clinic Declaration</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowDeclareModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label>State</label>
                <select value={declareState} onChange={(e) => setDeclareState(e.target.value)}>
                  <option value="DECLARED_CLEARED">Cleared</option>
                  <option value="DECLARED_AT_RISK">At Risk</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-2">Reason Codes (optional)</div>
                <div className="space-y-1">
                  {CLINIC_REASON_CODES.map((rc) => (
                    <label key={rc.value} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={declareReasons.includes(rc.value)}
                        onChange={() => toggleReason(declareReasons, setDeclareReasons, rc.value)}
                      />
                      {rc.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowDeclareModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleDeclare} disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : 'Record Declaration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Record ASC Verification</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowVerifyModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label>State</label>
                <select value={verifyState} onChange={(e) => setVerifyState(e.target.value)}>
                  <option value="VERIFIED_CLEARED">Cleared</option>
                  <option value="VERIFIED_AT_RISK">At Risk</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-2">Reason Codes (optional)</div>
                <div className="space-y-1">
                  {ASC_REASON_CODES.map((rc) => (
                    <label key={rc.value} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifyReasons.includes(rc.value)}
                        onChange={() => toggleReason(verifyReasons, setVerifyReasons, rc.value)}
                      />
                      {rc.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleVerify} disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : 'Record Verification'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Record Override</h2>
              <button className="text-text-muted hover:text-text-primary text-xl" onClick={() => setShowOverrideModal(false)}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label>Override State</label>
                <select value={overrideState} onChange={(e) => setOverrideState(e.target.value)}>
                  <option value="OVERRIDE_CLEARED">Override — Cleared</option>
                  <option value="OVERRIDE_AT_RISK">Override — At Risk</option>
                  <option value="NONE">Clear Override</option>
                </select>
              </div>
              {overrideState !== 'NONE' && (
                <div className="form-group">
                  <label>Reason</label>
                  <select value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}>
                    {OVERRIDE_REASON_CODES.map((rc) => (
                      <option key={rc.value} value={rc.value}>{rc.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowOverrideModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleOverride} disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : overrideState === 'NONE' ? 'Clear Override' : 'Record Override'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-sm text-text-primary">{value}</div>
    </div>
  );
}

function formatState(state: string): string {
  return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

interface TimelineEvent {
  id: string;
  createdAt: string;
  typeLabel: string;
  typeBg: string;
  typeText: string;
  stateLabel: string;
  actorName: string | null;
  reasonCodes?: string[];
  reasonCode?: string | null;
  note: string | null;
}

function buildTimeline(detail: FinancialReadinessDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const d of detail.declarations) {
    events.push({
      id: d.id,
      createdAt: d.createdAt,
      typeLabel: 'CLINIC',
      typeBg: 'bg-[var(--color-blue-bg)]',
      typeText: 'text-[var(--color-blue-700)]',
      stateLabel: formatState(d.state),
      actorName: d.recordedByName,
      reasonCodes: d.reasonCodes,
      note: d.note,
    });
  }

  for (const v of detail.verifications) {
    events.push({
      id: v.id,
      createdAt: v.createdAt,
      typeLabel: 'ASC',
      typeBg: 'bg-[var(--color-green-bg)]',
      typeText: 'text-[var(--color-green-700)]',
      stateLabel: formatState(v.state),
      actorName: v.verifiedByName,
      reasonCodes: v.reasonCodes,
      note: v.note,
    });
  }

  for (const o of detail.overrides) {
    events.push({
      id: o.id,
      createdAt: o.createdAt,
      typeLabel: 'OVERRIDE',
      typeBg: 'bg-[var(--color-purple-bg)]',
      typeText: 'text-[var(--color-purple-700)]',
      stateLabel: formatState(o.state),
      actorName: o.overriddenByName,
      reasonCode: o.reasonCode,
      note: o.note,
    });
  }

  // Sort chronologically
  events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return events;
}
