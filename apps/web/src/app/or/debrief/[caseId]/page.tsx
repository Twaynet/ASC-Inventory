'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
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

export default function DebriefPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const caseId = params?.caseId as string;

  const [checklistData, setChecklistData] = useState<CaseChecklistsResponse | null>(null);
  const [caseDashboard, setCaseDashboard] = useState<CaseDashboardData | null>(null);
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;
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
      await signChecklist(token, caseId, 'DEBRIEF', 'LOGIN');
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

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

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
    <>
      <header className="header">
        <div className="container header-content">
          <div className="header-left">
            <button
              className="btn btn-secondary btn-sm back-btn"
              onClick={() => router.push('/calendar')}
            >
              &larr; Back
            </button>
            <h1>Post-Op Debrief</h1>
          </div>
          <div className="header-user">
            <span>
              {user.name} ({user.role})
            </span>
            <span>{user.facilityName}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

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
                  <span>Debrief Completed at {checklist?.completedAt ? new Date(checklist.completedAt).toLocaleString() : ''}</span>
                </>
              ) : isStarted ? (
                <>
                  <span className="status-icon">⏳</span>
                  <span>Debrief In Progress</span>
                </>
              ) : (
                <>
                  <span className="status-icon">○</span>
                  <span>Debrief Not Started</span>
                </>
              )}
            </div>

            {/* Pending Reviews Alert */}
            {isCompleted && hasPendingReviews && (
              <div className="alert alert-warning pending-reviews-alert">
                <strong>Pending Reviews:</strong>
                <ul>
                  {checklist?.pendingScrubReview && (
                    <li>Awaiting SCRUB review/signature</li>
                  )}
                  {checklist?.pendingSurgeonReview && (
                    <li>Awaiting SURGEON review/signature</li>
                  )}
                </ul>
                <p className="pending-note">
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
                  <h2>Debrief Items</h2>
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
                  <h2>Signatures</h2>
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
                            <span className="signature-info">
                              Signed by {existingSig.signedByName} at{' '}
                              {new Date(existingSig.signedAt).toLocaleTimeString()}
                            </span>
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
                      <div className="feedback-section" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                        {!showFeedbackForm ? (
                          <div style={{
                            padding: '1rem',
                            background: 'var(--surface)',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                          }}>
                            <p style={{ margin: '0 0 0.75rem 0' }}>
                              <strong>Case Card Feedback</strong>
                            </p>
                            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
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
                          <div style={{
                            padding: '1rem',
                            background: 'var(--surface)',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                          }}>
                            <h3 style={{ margin: '0 0 1rem 0' }}>
                              Case Card Feedback: {caseDashboard.caseCard.name}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                                  Items Not Used (comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={feedbackForm.itemsUnused}
                                  onChange={(e) => setFeedbackForm(f => ({ ...f, itemsUnused: e.target.value }))}
                                  placeholder="e.g., Bovie tip, Extra sutures"
                                  style={{ width: '100%', padding: '0.5rem' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                                  Items Missing/Needed (comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={feedbackForm.itemsMissing}
                                  onChange={(e) => setFeedbackForm(f => ({ ...f, itemsMissing: e.target.value }))}
                                  placeholder="e.g., Larger retractor, Extra sponges"
                                  style={{ width: '100%', padding: '0.5rem' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                                  Setup/Positioning Issues
                                </label>
                                <textarea
                                  value={feedbackForm.setupIssues}
                                  onChange={(e) => setFeedbackForm(f => ({ ...f, setupIssues: e.target.value }))}
                                  placeholder="Any issues with room setup, patient positioning, equipment placement..."
                                  rows={2}
                                  style={{ width: '100%', padding: '0.5rem' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                                  Staff Comments
                                </label>
                                <textarea
                                  value={feedbackForm.staffComments}
                                  onChange={(e) => setFeedbackForm(f => ({ ...f, staffComments: e.target.value }))}
                                  placeholder="General comments from the team..."
                                  rows={2}
                                  style={{ width: '100%', padding: '0.5rem' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                                  Suggested Edits to Case Card
                                </label>
                                <textarea
                                  value={feedbackForm.suggestedEdits}
                                  onChange={(e) => setFeedbackForm(f => ({ ...f, suggestedEdits: e.target.value }))}
                                  placeholder="Specific changes you'd recommend for the case card..."
                                  rows={2}
                                  style={{ width: '100%', padding: '0.5rem' }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                      <div style={{
                        padding: '1rem',
                        background: 'rgba(46, 125, 50, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid var(--green)',
                        marginTop: '1.5rem',
                        marginBottom: '1.5rem'
                      }}>
                        <p style={{ margin: 0, color: 'var(--green)' }}>
                          Thank you! Your feedback has been submitted for review.
                        </p>
                      </div>
                    )}

                    <button
                      className="btn btn-secondary btn-md"
                      onClick={() => router.push('/calendar')}
                    >
                      Return to Dashboard
                    </button>
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
