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

  const canSign =
    signatureRole &&
    checklist?.requiredSignatures.some((s) => s.role === signatureRole) &&
    !hasUserSigned &&
    !isCompleted;

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
