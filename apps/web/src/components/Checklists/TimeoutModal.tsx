'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCaseChecklists,
  startChecklist,
  respondToChecklist,
  signChecklist,
  completeChecklist,
  type CaseChecklistsResponse,
  type ChecklistItem,
} from '@/lib/api';

interface TimeoutModalProps {
  isOpen: boolean;
  caseId: string | null;
  token: string;
  user: {
    id: string;
    name: string;
    role: string;
    roles?: string[];
  };
  onClose: () => void;
  onComplete: () => void;
  zIndex?: number;
}

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

export function TimeoutModal({
  isOpen,
  caseId,
  token,
  user,
  onClose,
  onComplete,
  zIndex = 1000,
}: TimeoutModalProps) {
  const [checklistData, setChecklistData] = useState<CaseChecklistsResponse | null>(null);
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  }, [token, caseId]);

  useEffect(() => {
    if (isOpen && token && caseId) {
      loadData();
    }
  }, [isOpen, token, caseId, loadData]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setChecklistData(null);
      setLocalResponses({});
      setError('');
      setSuccessMessage('');
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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

  const handleDone = () => {
    onComplete();
  };

  if (!isOpen || !caseId) return null;

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
    <div
      className="checklist-modal-overlay"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="checklist-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="checklist-modal-header">
          <h2>OR Time Out</h2>
          <button
            className="checklist-modal-close"
            onClick={onClose}
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        <div className="checklist-modal-body">
          {isLoading ? (
            <div className="checklist-loading">Loading checklist...</div>
          ) : (
            <>
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
                        <span className="status-icon">&#8987;</span>
                        <span>Time Out In Progress</span>
                      </>
                    ) : (
                      <>
                        <span className="status-icon">&#9675;</span>
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
                        <h3>Checklist Items</h3>
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
                        <h3>Signatures</h3>
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
                            {isSubmitting ? 'Signing...' : `Sign as ${signatureRole}`}
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
                          <button
                            className="btn btn-primary btn-md"
                            onClick={handleDone}
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .checklist-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .checklist-modal-content {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 700px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }

        .checklist-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--color-gray-200);
        }

        .checklist-modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .checklist-modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--color-gray-500);
          padding: 0.25rem;
          line-height: 1;
        }

        .checklist-modal-close:hover {
          color: var(--color-gray-700);
        }

        .checklist-modal-close:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .checklist-modal-body {
          padding: 1.5rem;
          overflow-y: auto;
          flex: 1;
        }

        .checklist-loading {
          text-align: center;
          padding: 2rem;
          color: var(--color-gray-500);
        }

        .checklist-start-section {
          text-align: center;
          padding: 2rem;
        }

        .checklist-start-section p {
          margin-bottom: 1.5rem;
          color: var(--color-gray-600);
        }

        .checklist-section {
          margin-bottom: 1.5rem;
        }

        .checklist-section h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--color-gray-700);
        }

        .checklist-items {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .checklist-actions {
          margin-top: 1.5rem;
          text-align: center;
        }

        .checklist-completed-actions {
          margin-top: 1.5rem;
          text-align: center;
        }

        .completion-message {
          color: var(--color-green);
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .sign-btn {
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
