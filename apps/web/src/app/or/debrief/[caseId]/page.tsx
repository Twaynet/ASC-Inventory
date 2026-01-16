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
  type CaseChecklistsResponse,
  type ChecklistItem,
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
  const [localResponses, setLocalResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;
    try {
      const result = await getCaseChecklists(token, caseId);
      setChecklistData(result);
      setError('');

      if (result.debrief) {
        const existing: Record<string, string> = {};
        for (const resp of result.debrief.responses) {
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
              onClick={() => router.push('/day-before')}
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
                      className="btn btn-secondary btn-md sign-btn"
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
                    <button
                      className="btn btn-secondary btn-md"
                      onClick={() => router.push('/day-before')}
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
