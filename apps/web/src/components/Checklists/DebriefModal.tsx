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
      setSuccessMessage('Post-Op Debrief started');
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

  const handleSign = async () => {
    if (!token || !caseId) return;
    setIsSubmitting(true);
    setError('');
    try {
      await signChecklist(token, caseId, 'DEBRIEF', 'LOGIN', flagForReview);
      await loadData();
      setSuccessMessage(flagForReview ? 'Signature added with flag for review' : 'Signature added');
      setFlagForReview(false); // Reset after signing
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
      await completeChecklist(token, caseId, 'DEBRIEF');
      await loadData();
      setSuccessMessage('Post-Op Debrief completed!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete checklist');
    } finally {
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
      setSuccessMessage('Feedback submitted! Thank you for helping improve the case card.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    onComplete();
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
          <h2>Post-Op Debrief</h2>
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
                    <div className="alert alert-warning pending-reviews-alert">
                      <strong>Pending Reviews:</strong>
                      <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
                        {checklist?.pendingScrubReview && (
                          <li>Awaiting SCRUB review/signature</li>
                        )}
                        {checklist?.pendingSurgeonReview && (
                          <li>Awaiting SURGEON review/signature</li>
                        )}
                      </ul>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-gray-600)' }}>
                        The procedure can continue. Pending reviews will be completed asynchronously.
                      </p>
                    </div>
                  )}

                  {!isStarted ? (
                    <div className="checklist-start-section">
                      <p>Start the Post-Op Debrief to document counts, specimens, and any issues before completing the procedure.</p>
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
                      <div className="checklist-section">
                        <h3>Debrief Items</h3>
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

                      <div className="checklist-section">
                        <h3>Signatures</h3>
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
                                    <span className="optional-marker">(optional)</span>
                                  )}
                                </span>
                                {existingSig ? (
                                  <div className="signature-details">
                                    <span className="signature-info">
                                      Signed by {existingSig.signedByName} at{' '}
                                      {new Date(existingSig.signedAt).toLocaleTimeString()}
                                    </span>
                                    {existingSig.flaggedForReview && (
                                      <span className={`flag-badge ${existingSig.resolved ? 'resolved' : 'pending'}`}>
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
                          <div className="sign-section">
                            <label className="flag-toggle">
                              <input
                                type="checkbox"
                                checked={flagForReview}
                                onChange={(e) => setFlagForReview(e.target.checked)}
                                disabled={isSubmitting}
                              />
                              <span>Flag for Admin Review</span>
                            </label>
                            <button
                              className="btn btn-sign-action btn-md sign-btn"
                              onClick={handleSign}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? 'Signing...' : `Sign as ${signatureRole}`}
                            </button>
                          </div>
                        )}
                      </div>

                      {!isCompleted && (
                        <div className="checklist-actions">
                          <button
                            className="btn btn-primary btn-lg"
                            onClick={handleComplete}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? 'Completing...' : 'Complete Debrief'}
                          </button>
                          <p className="checklist-hint">
                            Only CIRCULATOR signature is required to complete. SCRUB/SURGEON can sign after completion if needed.
                          </p>
                        </div>
                      )}

                      {isCompleted && (
                        <div className="checklist-completed-actions">
                          <p className="completion-message">
                            Debrief completed. The procedure may now be marked as complete.
                          </p>

                          {/* Case Card Feedback Section */}
                          {caseDashboard?.caseCard && !feedbackSubmitted && (
                            <div className="feedback-section">
                              {!showFeedbackForm ? (
                                <div className="feedback-prompt">
                                  <p><strong>Case Card Feedback</strong></p>
                                  <p className="feedback-description">
                                    Help improve the case card for &quot;{caseDashboard.caseCard.name}&quot; by providing feedback on what worked and what could be better.
                                  </p>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowFeedbackForm(true)}
                                  >
                                    Provide Feedback
                                  </button>
                                </div>
                              ) : (
                                <div className="feedback-form">
                                  <h4>Case Card Feedback: {caseDashboard.caseCard.name}</h4>
                                  <div className="feedback-fields">
                                    <div className="feedback-field">
                                      <label>Items Not Used (comma-separated)</label>
                                      <input
                                        type="text"
                                        value={feedbackForm.itemsUnused}
                                        onChange={(e) => setFeedbackForm(f => ({ ...f, itemsUnused: e.target.value }))}
                                        placeholder="e.g., Bovie tip, Extra sutures"
                                      />
                                    </div>
                                    <div className="feedback-field">
                                      <label>Items Missing/Needed (comma-separated)</label>
                                      <input
                                        type="text"
                                        value={feedbackForm.itemsMissing}
                                        onChange={(e) => setFeedbackForm(f => ({ ...f, itemsMissing: e.target.value }))}
                                        placeholder="e.g., Larger retractor, Extra sponges"
                                      />
                                    </div>
                                    <div className="feedback-field">
                                      <label>Setup/Positioning Issues</label>
                                      <textarea
                                        value={feedbackForm.setupIssues}
                                        onChange={(e) => setFeedbackForm(f => ({ ...f, setupIssues: e.target.value }))}
                                        placeholder="Any issues with room setup, patient positioning, equipment placement..."
                                        rows={2}
                                      />
                                    </div>
                                    <div className="feedback-field">
                                      <label>Staff Comments</label>
                                      <textarea
                                        value={feedbackForm.staffComments}
                                        onChange={(e) => setFeedbackForm(f => ({ ...f, staffComments: e.target.value }))}
                                        placeholder="General comments from the team..."
                                        rows={2}
                                      />
                                    </div>
                                    <div className="feedback-field">
                                      <label>Suggested Edits to Case Card</label>
                                      <textarea
                                        value={feedbackForm.suggestedEdits}
                                        onChange={(e) => setFeedbackForm(f => ({ ...f, suggestedEdits: e.target.value }))}
                                        placeholder="Specific changes you'd recommend for the case card..."
                                        rows={2}
                                      />
                                    </div>
                                    <div className="feedback-buttons">
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSubmitFeedback}
                                        disabled={isSubmitting}
                                      >
                                        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                      </button>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowFeedbackForm(false)}
                                        disabled={isSubmitting}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {feedbackSubmitted && (
                            <div className="feedback-success">
                              <p>Thank you! Your feedback has been submitted for review.</p>
                            </div>
                          )}

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

        .checklist-hint {
          font-size: 0.875rem;
          color: var(--color-gray-500);
          margin-top: 0.75rem;
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
          margin-top: 0.5rem;
        }

        .sign-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-gray-200);
        }

        .flag-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: var(--color-gray-700);
          font-size: 0.875rem;
        }

        .flag-toggle input {
          width: 1rem;
          height: 1rem;
          accent-color: var(--color-orange);
        }

        .signature-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .flag-badge {
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-weight: 500;
        }

        .flag-badge.pending {
          background: var(--color-orange);
          color: white;
        }

        .flag-badge.resolved {
          background: var(--color-green);
          color: white;
        }

        .optional-marker {
          font-size: 0.75rem;
          color: var(--color-gray-400);
          margin-left: 0.5rem;
        }

        .feedback-section {
          margin: 1.5rem 0;
          text-align: left;
        }

        .feedback-prompt {
          padding: 1rem;
          background: var(--color-gray-50);
          border-radius: 8px;
          border: 1px solid var(--color-gray-200);
        }

        .feedback-prompt p {
          margin: 0 0 0.75rem 0;
        }

        .feedback-description {
          font-size: 0.9rem;
          color: var(--color-gray-600);
        }

        .feedback-form {
          padding: 1rem;
          background: var(--color-gray-50);
          border-radius: 8px;
          border: 1px solid var(--color-gray-200);
        }

        .feedback-form h4 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
        }

        .feedback-fields {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .feedback-field label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .feedback-field input,
        .feedback-field textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--color-gray-300);
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .feedback-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .feedback-success {
          padding: 1rem;
          background: rgba(46, 125, 50, 0.1);
          border-radius: 8px;
          border: 1px solid var(--color-green);
          margin: 1.5rem 0;
        }

        .feedback-success p {
          margin: 0;
          color: var(--color-green);
        }

        .pending-reviews-alert {
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}
