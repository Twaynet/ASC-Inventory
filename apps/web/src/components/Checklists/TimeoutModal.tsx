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
  const [flagForReview, setFlagForReview] = useState(false);
  const [flagComment, setFlagComment] = useState('');

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
      setFlagForReview(false);
      setFlagComment('');
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

  const handleSignAndComplete = async () => {
    if (!token || !caseId) return;
    setIsSubmitting(true);
    setError('');
    try {
      // Sign the checklist
      await signChecklist(token, caseId, 'TIMEOUT', 'LOGIN', flagForReview, flagForReview ? flagComment : undefined);

      // Attempt to complete - this will succeed if all required signatures are present
      try {
        await completeChecklist(token, caseId, 'TIMEOUT');
      } catch {
        // If completion fails (missing signatures), that's okay - just reload
        await loadData();
        setFlagForReview(false);
        setFlagComment('');
        return;
      }

      // Successfully signed and completed - close the modal
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign checklist');
      setIsSubmitting(false);
    }
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
      className="fixed inset-0 bg-[var(--shadow-overlay)] flex items-center justify-center p-4"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-surface-primary rounded-xl w-full max-w-[700px] max-h-[90vh] flex flex-col shadow-[0_20px_40px_var(--shadow-md)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h2 className="m-0 text-xl font-semibold">OR Time Out</h2>
          <button
            className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-1 leading-none hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="text-center p-8 text-text-muted">Loading checklist...</div>
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
                    <div className="text-center p-8">
                      <p className="mb-6 text-text-secondary">Start the Time Out checklist to verify patient safety before the procedure begins.</p>
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
                      <div className="mb-6">
                        <h3 className="text-base font-semibold mb-4 text-text-secondary">Checklist Items</h3>
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

                      <div className="mb-6">
                        <h3 className="text-base font-semibold mb-4 text-text-secondary">Signatures</h3>
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
                                  <div className="flex flex-col gap-1">
                                    <span className="signature-info">
                                      Signed by {existingSig.signedByName} at{' '}
                                      {new Date(existingSig.signedAt).toLocaleTimeString()}
                                    </span>
                                    {existingSig.flaggedForReview && (
                                      <span className={`inline-block text-xs py-0.5 px-2 rounded font-medium ${existingSig.resolved ? 'bg-[var(--color-green)] text-white' : 'bg-[var(--color-orange)] text-white'}`}>
                                        {existingSig.resolved ? '✓ Reviewed' : '⚑ Flagged for Review'}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="signature-pending">Awaiting signature</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {canSign && (
                          <div className="flex flex-col items-center gap-3 mt-4 pt-4 border-t border-border">
                            <label className="flex flex-col items-center gap-2 cursor-pointer">
                              <span className="font-bold text-[0.9rem] text-text-primary">Flag for Admin Review</span>
                              <div className="relative w-[50px] h-[26px]">
                                <input
                                  type="checkbox"
                                  className="opacity-0 w-0 h-0"
                                  checked={flagForReview}
                                  onChange={(e) => setFlagForReview(e.target.checked)}
                                  disabled={isSubmitting}
                                />
                                <span className={`absolute cursor-pointer inset-0 ${flagForReview ? 'bg-[var(--color-orange)]' : 'bg-[var(--color-gray-300)]'} transition-all duration-300 rounded-[26px] before:absolute before:content-[''] before:h-5 before:w-5 before:left-[3px] before:bottom-[3px] before:bg-surface-primary before:transition-all before:duration-300 before:rounded-full before:shadow-[0_1px_3px_var(--shadow-md)] ${flagForReview ? 'before:translate-x-6' : ''}`}></span>
                              </div>
                            </label>
                            {flagForReview && (
                              <div className="w-full max-w-[400px]">
                                <textarea
                                  className="w-full p-3 border border-border rounded-md text-[0.9rem] resize-y font-[inherit] focus:outline-none focus:border-[var(--color-orange)] focus:shadow-[0_0_0_2px_rgba(237,137,54,0.2)] disabled:bg-surface-tertiary"
                                  placeholder="Any further comments for admin review..."
                                  value={flagComment}
                                  onChange={(e) => setFlagComment(e.target.value)}
                                  disabled={isSubmitting}
                                  rows={2}
                                />
                              </div>
                            )}
                            <button
                              className="btn btn-primary btn-lg mt-2"
                              onClick={handleSignAndComplete}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? 'Completing...' : `Sign & Complete Time Out`}
                            </button>
                          </div>
                        )}

                        {isCompleted && (
                          <p className="text-[var(--color-green)] font-medium mb-4">
                            Time Out completed. The procedure may now be started.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
