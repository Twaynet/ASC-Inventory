'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCaseChecklists,
  startChecklist,
  respondToChecklist,
  signChecklist,
  completeChecklist,
  type CaseChecklistsResponse,
  type ChecklistItem,
} from '@/lib/api';

function ReadinessBanner({ readinessState }: { readinessState?: string }) {
  if (!readinessState) return null;

  const banners: Record<string, { className: string; message: string }> = {
    GREEN: { className: 'readiness-banner green', message: 'Inventory Ready' },
    ORANGE: { className: 'readiness-banner orange', message: 'Proceeding with Acknowledged Gaps' },
    RED: { className: 'readiness-banner red', message: 'Inventory Incomplete - Requires Acknowledgment' },
  };

  const banner = banners[readinessState] || banners.RED;

  return (
    <div className={banner.className}>
      <span className="readiness-banner-icon">
        {readinessState === 'GREEN' ? '✓' : readinessState === 'ORANGE' ? '!' : '✗'}
      </span>
      <span>{banner.message}</span>
    </div>
  );
}

function ChecklistItemInput({
  item,
  value,
  onChange,
  disabled,
}: {
  item: ChecklistItem;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  switch (item.type) {
    case 'checkbox':
      return (
        <label className="checklist-checkbox">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            disabled={disabled}
          />
          <span className="checklist-checkbox-label">{item.label}</span>
          {item.required && <span className="required-marker">*</span>}
        </label>
      );

    case 'select':
      return (
        <div className="checklist-select-group">
          <label className="checklist-label">
            {item.label}
            {item.required && <span className="required-marker">*</span>}
          </label>
          <select
            className="checklist-select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">-- Select --</option>
            {item.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      );

    case 'text':
      return (
        <div className="checklist-text-group">
          <label className="checklist-label">
            {item.label}
            {item.required && <span className="required-marker">*</span>}
          </label>
          <textarea
            className="checklist-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={2}
          />
        </div>
      );

    case 'readonly':
      return (
        <div className="checklist-readonly">
          <span className="checklist-label">{item.label}</span>
          <span className="checklist-readonly-value">{value || 'See readiness banner above'}</span>
        </div>
      );

    default:
      return null;
  }
}

export default function TimeoutPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useParams();
  const caseId = params?.caseId as string;

  const [checklistData, setChecklistData] = useState<CaseChecklistsResponse | null>(null);
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;
    try {
      const result = await getCaseChecklists(token, caseId);
      setChecklistData(result);
      setError('');

      if (result.timeout) {
        const existing: Record<string, string> = {};
        for (const resp of result.timeout.responses) {
          existing[resp.itemKey] = resp.value;
        }
        setLocalResponses(existing);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    }
  }, [token, caseId]);

  useEffect(() => {
    if (token && caseId) {
      loadData();
    }
  }, [token, caseId, loadData]);

  const handleStart = async () => {
    if (!token || !caseId) return;
    setIsSubmitting(true);
    setError('');
    try {
      await startChecklist(token, caseId, 'TIMEOUT');
      await loadData();
      setSuccessMessage('Time Out checklist started');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checklist');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResponseChange = async (itemKey: string, value: string) => {
    if (!token || !caseId || !checklistData?.timeout) return;

    setLocalResponses((prev) => ({ ...prev, [itemKey]: value }));

    try {
      await respondToChecklist(token, caseId, 'TIMEOUT', itemKey, value);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save response');
    }
  };

  const handleSign = async () => {
    if (!token || !caseId) return;
    setIsSubmitting(true);
    setError('');
    try {
      await signChecklist(token, caseId, 'TIMEOUT', 'LOGIN');
      await loadData();
      setSuccessMessage('Signature added');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add signature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!token || !caseId) return;
    setIsSubmitting(true);
    setError('');
    try {
      await completeChecklist(token, caseId, 'TIMEOUT');
      await loadData();
      setSuccessMessage('Time Out checklist completed!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete checklist');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  const checklist = checklistData?.timeout;
  const isCompleted = checklist?.status === 'COMPLETED';
  const isStarted = checklist && checklist.status !== 'NOT_STARTED';

  const userRole = user.role;
  const roleMapping: Record<string, string> = {
    CIRCULATOR: 'CIRCULATOR',
    SURGEON: 'SURGEON',
    SCRUB: 'SCRUB',
    ADMIN: 'CIRCULATOR',
    ANESTHESIA: 'ANESTHESIA',
  };
  const signatureRole = roleMapping[userRole];
  const hasUserSigned = checklist?.signatures.some((s) => s.role === signatureRole);

  const canSign =
    signatureRole &&
    checklist?.requiredSignatures.some((s) => s.role === signatureRole) &&
    !hasUserSigned &&
    !isCompleted;

  return (
    <>
      <Header title="OR Time Out" />

      <main className="container checklist-page">
        {!checklistData?.featureEnabled && (
          <div className="alert alert-info">
            Time Out/Debrief feature is not enabled for this facility.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {checklistData?.featureEnabled && (
          <>
            <div className={`checklist-status-banner ${isCompleted ? 'completed' : isStarted ? 'in-progress' : 'not-started'}`}>
              {isCompleted ? (
                <>
                  <span className="status-icon">✓</span>
                  <span>Time Out Completed at {checklist?.completedAt ? new Date(checklist.completedAt).toLocaleString() : ''}</span>
                </>
              ) : isStarted ? (
                <>
                  <span className="status-icon">⏳</span>
                  <span>Time Out In Progress</span>
                </>
              ) : (
                <>
                  <span className="status-icon">○</span>
                  <span>Time Out Not Started</span>
                </>
              )}
            </div>

            <ReadinessBanner readinessState={localResponses['inventory_readiness'] || 'GREEN'} />

            {!isStarted ? (
              <div className="checklist-start-section">
                <p>Start the Time Out checklist to verify patient safety before the procedure begins.</p>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleStart}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Starting...' : 'Start Time Out'}
                </button>
              </div>
            ) : (
              <>
                <div className="checklist-section">
                  <h2>Checklist Items</h2>
                  <div className="checklist-items">
                    {checklist?.items.map((item) => (
                      <div key={item.key} className="checklist-item">
                        <ChecklistItemInput
                          item={item}
                          value={localResponses[item.key] || ''}
                          onChange={(value) => handleResponseChange(item.key, value)}
                          disabled={isCompleted}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="checklist-section">
                  <h2>Signatures</h2>
                  <div className="signatures-list">
                    {checklist?.requiredSignatures.map((sig) => {
                      const existingSig = checklist.signatures.find((s) => s.role === sig.role);
                      return (
                        <div
                          key={sig.role}
                          className={`signature-row ${existingSig ? 'signed' : 'pending'}`}
                        >
                          <span className="signature-role">
                            {sig.role}
                            {sig.required && <span className="required-marker">*</span>}
                          </span>
                          {existingSig ? (
                            <span className="signature-info">
                              Signed by {existingSig.signedByName} at{' '}
                              {new Date(existingSig.signedAt).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="signature-pending">Awaiting signature</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {canSign && (
                    <button
                      className="btn btn-sign-action btn-md sign-btn"
                      onClick={handleSign}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Signing...' : `✍️ Sign as ${signatureRole}`}
                    </button>
                  )}
                </div>

                {!isCompleted && (
                  <div className="checklist-actions">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleComplete}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Completing...' : 'Complete Time Out'}
                    </button>
                  </div>
                )}

                {isCompleted && (
                  <div className="checklist-completed-actions">
                    <p className="completion-message">
                      Time Out completed. The procedure may now be started.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-primary btn-md"
                        onClick={() => router.push(`/case/${caseId}`)}
                      >
                        Return to Case
                      </button>
                      <button
                        className="btn btn-secondary btn-md"
                        onClick={() => router.push(`/calendar?openCase=${caseId}`)}
                      >
                        Back to Calendar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
