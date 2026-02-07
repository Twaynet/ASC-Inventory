'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCaseChecklists,
  startChecklist,
  respondToChecklist,
  signChecklist,
  completeChecklist,
  getCaseDashboard,
  submitCaseCardFeedback,
  type CaseChecklistsResponse,
  type ChecklistItem,
  type CaseDashboardData,
} from '@/lib/api';

interface DebriefModalProps {
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

/**
 * Check if a field should be visible based on showIf condition
 */
function shouldShowField(
  item: ChecklistItem,
  responses: Record<string, string>
): boolean {
  if (!item.showIf) return true;
  const { key, value } = item.showIf;
  return responses[key] === value;
}

/**
 * Check if user can see/edit a role-restricted field
 */
function canAccessRoleRestrictedField(
  item: ChecklistItem,
  userRole: string
): boolean {
  if (!item.roleRestricted) return true;
  // ADMIN can see all fields
  if (userRole === 'ADMIN') return true;
  return item.roleRestricted === userRole;
}

function ChecklistItemInput({
  item,
  value,
  onChange,
  disabled,
  userRole,
}: {
  item: ChecklistItem;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  userRole: string;
}) {
  // Check if this is a role-restricted field
  const isRoleRestricted = item.roleRestricted && item.roleRestricted !== userRole && userRole !== 'ADMIN';

  // For role-restricted fields, show read-only view for other roles
  if (isRoleRestricted && value) {
    return (
      <div className="checklist-readonly role-restricted">
        <span className="checklist-label">{item.label}</span>
        <span className="checklist-readonly-value">
          <em>(Entered by {item.roleRestricted})</em>
        </span>
      </div>
    );
  }

  // Hide role-restricted fields if not the right role and no value
  if (isRoleRestricted) {
    return null;
  }

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
            {item.roleRestricted && (
              <span className="role-badge">{item.roleRestricted} Only</span>
            )}
          </label>
          <textarea
            className="checklist-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder={item.roleRestricted ? `Only ${item.roleRestricted} can edit this field` : ''}
          />
        </div>
      );

    case 'readonly':
      return (
        <div className="checklist-readonly">
          <span className="checklist-label">{item.label}</span>
          <span className="checklist-readonly-value">{value || 'N/A'}</span>
        </div>
      );

    default:
      return null;
  }
}

export function DebriefModal({
  isOpen,
  caseId,
  token,
  user,
  onClose,
  onComplete,
  zIndex = 1000,
}: DebriefModalProps) {
  const [checklistData, setChecklistData] = useState<CaseChecklistsResponse | null>(null);
  const [caseDashboard, setCaseDashboard] = useState<CaseDashboardData | null>(null);
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [flagForReview, setFlagForReview] = useState(false);
  const [flagComment, setFlagComment] = useState('');

  // Feedback form state
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    itemsUnused: '',
    itemsMissing: '',
    setupIssues: '',
    staffComments: '',
    suggestedEdits: '',
  });

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;
    setIsLoading(true);
    try {
      const [checklistResult, dashboardResult] = await Promise.all([
        getCaseChecklists(token, caseId),
        getCaseDashboard(token, caseId).catch(() => null),
      ]);
      setChecklistData(checklistResult);
      if (dashboardResult) {
        setCaseDashboard(dashboardResult.dashboard);
      }
      setError('');

      if (checklistResult.debrief) {
        const existing: Record<string, string> = {};
        for (const resp of checklistResult.debrief.responses) {
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
      setCaseDashboard(null);
      setLocalResponses({});
      setError('');
      setSuccessMessage('');
      setFlagForReview(false);
      setFlagComment('');
      setShowFeedbackForm(false);
      setFeedbackSubmitted(false);
      setFeedbackForm({
        itemsUnused: '',
        itemsMissing: '',
        setupIssues: '',
        staffComments: '',
        suggestedEdits: '',
      });
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
      await startChecklist(token, caseId, 'DEBRIEF');
      await loadData();
      setSuccessMessage('Debrief started');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checklist');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResponseChange = async (itemKey: string, value: string) => {
    if (!token || !caseId || !checklistData?.debrief) return;

    setLocalResponses((prev) => ({ ...prev, [itemKey]: value }));

    try {
      await respondToChecklist(token, caseId, 'DEBRIEF', itemKey, value);
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
      await signChecklist(token, caseId, 'DEBRIEF', 'LOGIN', flagForReview, flagForReview ? flagComment : undefined);

      // Attempt to complete - this will succeed if all required signatures are present
      try {
        await completeChecklist(token, caseId, 'DEBRIEF');
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

  const handleSubmitFeedback = async () => {
    if (!token || !caseId || !caseDashboard?.caseCard) return;
    setIsSubmitting(true);
    setError('');
    try {
      // Parse comma-separated items into arrays
      const itemsUnused = feedbackForm.itemsUnused
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      const itemsMissing = feedbackForm.itemsMissing
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await submitCaseCardFeedback(token, caseDashboard.caseCard.id, {
        surgicalCaseId: caseId,
        itemsUnused: itemsUnused.length > 0 ? itemsUnused : undefined,
        itemsMissing: itemsMissing.length > 0 ? itemsMissing : undefined,
        setupIssues: feedbackForm.setupIssues || undefined,
        staffComments: feedbackForm.staffComments || undefined,
        suggestedEdits: feedbackForm.suggestedEdits || undefined,
      });
      setFeedbackSubmitted(true);
      setShowFeedbackForm(false);
      setSuccessMessage('Feedback submitted! Thank you for helping improve the preference card.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !caseId) return null;

  const checklist = checklistData?.debrief;
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

  // For signing before completion
  const canSign =
    signatureRole &&
    checklist?.requiredSignatures.some((s) => s.role === signatureRole) &&
    !hasUserSigned &&
    !isCompleted;

  // Check for pending reviews
  const hasPendingReviews = checklist?.pendingScrubReview || checklist?.pendingSurgeonReview;

  // Determine which signatures are actually required based on conditions
  const getEffectiveSignatureRequirement = (sig: { role: string; required: boolean; conditional?: boolean; conditions?: string[] }) => {
    if (!sig.conditional || !sig.conditions) {
      return sig.required;
    }
    // Check if any condition is met (OR logic)
    for (const condition of sig.conditions) {
      if (condition.includes('!=empty')) {
        const key = condition.replace('!=empty', '');
        const value = localResponses[key];
        if (value && value.trim() !== '') return true;
      } else if (condition.includes('=')) {
        const [key, expectedValue] = condition.split('=');
        if (localResponses[key] === expectedValue) return true;
      }
    }
    return false;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-surface-primary rounded-xl w-full max-w-[700px] max-h-[90vh] flex flex-col shadow-[0_20px_40px_rgba(0,0,0,0.2)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h2 className="m-0 text-xl font-semibold">Debrief</h2>
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
                        <span>Debrief Completed at {checklist?.completedAt ? new Date(checklist.completedAt).toLocaleString() : ''}</span>
                      </>
                    ) : isStarted ? (
                      <>
                        <span className="status-icon">&#8987;</span>
                        <span>Debrief In Progress</span>
                      </>
                    ) : (
                      <>
                        <span className="status-icon">&#9675;</span>
                        <span>Debrief Not Started</span>
                      </>
                    )}
                  </div>

                  {/* Pending Reviews Alert */}
                  {isCompleted && hasPendingReviews && (
                    <div className="alert alert-warning mb-4">
                      <strong>Pending Reviews:</strong>
                      <ul className="mt-2 ml-6 p-0">
                        {checklist?.pendingScrubReview && (
                          <li>Awaiting SCRUB review/signature</li>
                        )}
                        {checklist?.pendingSurgeonReview && (
                          <li>Awaiting SURGEON review/signature</li>
                        )}
                      </ul>
                      <p className="mt-2 text-sm text-text-muted">
                        The procedure can continue. Pending reviews will be completed asynchronously.
                      </p>
                    </div>
                  )}

                  {!isStarted ? (
                    <div className="text-center p-8">
                      <p className="mb-6 text-text-secondary">Start the Debrief to document counts, specimens, and any issues before completing the procedure.</p>
                      <button
                        className="btn btn-primary btn-lg"
                        onClick={handleStart}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Starting...' : 'Start Debrief'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6">
                        <h3 className="text-base font-semibold mb-4 text-text-secondary">Debrief Items</h3>
                        <div className="checklist-items">
                          {checklist?.items.map((item) => {
                            // Check visibility conditions
                            if (!shouldShowField(item, localResponses)) {
                              return null;
                            }
                            // Check role restrictions
                            if (!canAccessRoleRestrictedField(item, userRole)) {
                              return null;
                            }
                            return (
                              <div key={item.key} className="checklist-item">
                                <ChecklistItemInput
                                  item={item}
                                  value={localResponses[item.key] || ''}
                                  onChange={(value) => handleResponseChange(item.key, value)}
                                  disabled={isCompleted}
                                  userRole={userRole}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mb-6">
                        <h3 className="text-base font-semibold mb-4 text-text-secondary">Signatures</h3>
                        <div className="signatures-list">
                          {checklist?.requiredSignatures.map((sig) => {
                            const existingSig = checklist.signatures.find((s) => s.role === sig.role);
                            const isRequired = getEffectiveSignatureRequirement(sig);
                            const isConditional = sig.conditional;

                            // Show conditional signatures only if they're required
                            if (isConditional && !isRequired && !existingSig) {
                              return null;
                            }

                            return (
                              <div
                                key={sig.role}
                                className={`signature-row ${existingSig ? 'signed' : 'pending'} ${isConditional ? 'conditional' : ''}`}
                              >
                                <span className="signature-role">
                                  {sig.role}
                                  {isRequired && <span className="required-marker">*</span>}
                                  {isConditional && !isRequired && (
                                    <span className="text-xs text-text-muted ml-2">(optional)</span>
                                  )}
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
                                  <span className="signature-pending">
                                    {isConditional ? 'Can sign after completion' : 'Awaiting signature'}
                                  </span>
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
                                <span className={`absolute cursor-pointer inset-0 ${flagForReview ? 'bg-[var(--color-orange)]' : 'bg-[var(--color-gray-300)]'} transition-all duration-300 rounded-[26px] before:absolute before:content-[''] before:h-5 before:w-5 before:left-[3px] before:bottom-[3px] before:bg-surface-primary before:transition-all before:duration-300 before:rounded-full before:shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${flagForReview ? 'before:translate-x-6' : ''}`}></span>
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
                              {isSubmitting ? 'Completing...' : `Sign & Complete Debrief`}
                            </button>
                          </div>
                        )}

                        {isCompleted && (
                          <p className="text-[var(--color-green)] font-medium mb-4">
                            Debrief completed. The procedure may now be marked as complete.
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
