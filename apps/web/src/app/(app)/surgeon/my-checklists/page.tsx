'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { TimeoutModal, DebriefModal } from '@/components/Checklists';
import {
  getSurgeonChecklists,
  updateSurgeonFeedback,
  type SurgeonChecklist,
} from '@/lib/api';

export default function SurgeonMyChecklistsPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [checklists, setChecklists] = useState<SurgeonChecklist[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Feedback form state
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackFlagged, setFeedbackFlagged] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter state
  const [filterType, setFilterType] = useState<'all' | 'TIMEOUT' | 'DEBRIEF'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getSurgeonChecklists(token);
      setChecklists(result.checklists);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklists');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && hasRole('SURGEON')) {
      loadData();
    }
  }, [token, hasRole, loadData]);

  const handleViewChecklist = (checklist: SurgeonChecklist) => {
    setSelectedCaseId(checklist.caseId);
    if (checklist.checklistType === 'TIMEOUT') {
      setShowTimeoutModal(true);
    } else {
      setShowDebriefModal(true);
    }
  };

  const handleStartEdit = (checklist: SurgeonChecklist) => {
    setEditingInstanceId(checklist.instanceId);
    setFeedbackNotes(checklist.surgeonNotes || '');
    setFeedbackFlagged(checklist.surgeonFlagged);
    setFeedbackComment(checklist.surgeonFlaggedComment || '');
  };

  const handleCancelEdit = () => {
    setEditingInstanceId(null);
    setFeedbackNotes('');
    setFeedbackFlagged(false);
    setFeedbackComment('');
  };

  const handleSaveFeedback = async () => {
    if (!token || !editingInstanceId) return;

    setIsSaving(true);
    try {
      await updateSurgeonFeedback(token, editingInstanceId, {
        notes: feedbackNotes,
        flagged: feedbackFlagged,
        flaggedComment: feedbackFlagged ? feedbackComment : undefined,
      });
      await loadData();
      handleCancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save feedback');
    } finally {
      setIsSaving(false);
    }
  };

  // Only SURGEON can view this page
  if (!hasRole('SURGEON')) {
    return (
      <>
        <Header title="My Checklists" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to surgeons.
          </div>
        </main>
      </>
    );
  }

  // Filter checklists
  const filteredChecklists = checklists.filter(c => {
    const matchesType = filterType === 'all' || c.checklistType === filterType;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      c.procedureName.toLowerCase().includes(searchLower) ||
      c.caseNumber.toLowerCase().includes(searchLower) ||
      (c.roomName?.toLowerCase().includes(searchLower));
    return matchesType && matchesSearch;
  });

  // Group by date
  const groupedByDate = filteredChecklists.reduce((acc, checklist) => {
    const date = checklist.scheduledDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(checklist);
    return acc;
  }, {} as Record<string, SurgeonChecklist[]>);

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <Header title="My Checklists" />

      <main className="container surgeon-checklists-page">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Filters */}
        <div className="filters-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by procedure, case #, or room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="type-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'TIMEOUT' | 'DEBRIEF')}
          >
            <option value="all">All Types</option>
            <option value="TIMEOUT">Time Out Only</option>
            <option value="DEBRIEF">Debrief Only</option>
          </select>
        </div>

        {/* Summary */}
        <div className="summary-bar">
          <span className="summary-count">{filteredChecklists.length} checklists</span>
          <span className="summary-flagged">
            {checklists.filter(c => c.surgeonFlagged).length} flagged for review
          </span>
        </div>

        {isLoadingData ? (
          <div className="loading">Loading your checklists...</div>
        ) : filteredChecklists.length === 0 ? (
          <div className="empty-state">
            <p>No completed checklists found.</p>
            {searchTerm && <p>Try adjusting your search criteria.</p>}
          </div>
        ) : (
          <div className="checklists-by-date">
            {sortedDates.map(date => (
              <div key={date} className="date-group">
                <h3 className="date-header">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h3>
                <div className="checklist-cards">
                  {groupedByDate[date].map(checklist => (
                    <div
                      key={checklist.instanceId}
                      className={`checklist-card ${checklist.surgeonFlagged ? 'flagged' : ''}`}
                    >
                      <div className="card-header">
                        <button
                          className={`type-badge clickable ${checklist.checklistType.toLowerCase()}`}
                          onClick={() => handleViewChecklist(checklist)}
                          title={`View ${checklist.checklistType}`}
                        >
                          {checklist.checklistType}
                        </button>
                        <span className="procedure-name">{checklist.procedureName}</span>
                        {checklist.surgeonFlagged && (
                          <span className="flagged-badge">Flagged</span>
                        )}
                      </div>

                      <div className="card-details">
                        <div className="detail-row">
                          <span className="detail-label">Case #:</span>
                          <span>{checklist.caseNumber}</span>
                        </div>
                        {checklist.roomName && (
                          <div className="detail-row">
                            <span className="detail-label">Room:</span>
                            <span>{checklist.roomName}</span>
                          </div>
                        )}
                        {checklist.completedAt && (
                          <div className="detail-row">
                            <span className="detail-label">Completed:</span>
                            <span>{new Date(checklist.completedAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Show existing notes if any */}
                      {checklist.surgeonNotes && editingInstanceId !== checklist.instanceId && (
                        <div className="existing-notes">
                          <span className="notes-label">Your Notes:</span>
                          <p className="notes-text">{checklist.surgeonNotes}</p>
                        </div>
                      )}

                      {/* Show flag status and admin resolution */}
                      {checklist.surgeonFlaggedComment && editingInstanceId !== checklist.instanceId && (() => {
                        // Parse the comment to separate original comment from resolution
                        const parts = checklist.surgeonFlaggedComment.split('\n---\n');
                        const originalComment = parts[0] || '';
                        const resolutionNote = parts.length > 1 ? parts[parts.length - 1] : null;
                        const wasResolved = !checklist.surgeonFlagged && resolutionNote;

                        return (
                          <div className={`flag-status-box ${wasResolved ? 'resolved' : 'pending'}`}>
                            {originalComment && (
                              <div className="flag-comment">
                                <span className="flag-label">Your Flag Comment:</span>
                                <p className="flag-text">{originalComment}</p>
                              </div>
                            )}
                            {wasResolved && resolutionNote && (
                              <div className="resolution-info">
                                <span className="resolution-label">✓ Admin Resolution:</span>
                                <p className="resolution-text">{resolutionNote}</p>
                              </div>
                            )}
                            {checklist.surgeonFlagged && (
                              <div className="pending-notice">
                                <span className="pending-text">⏳ Awaiting admin review</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Edit form or button */}
                      {editingInstanceId === checklist.instanceId ? (
                        <div className="feedback-form">
                          <div className="form-group">
                            <label>Notes</label>
                            <textarea
                              className="notes-input"
                              rows={3}
                              value={feedbackNotes}
                              onChange={(e) => setFeedbackNotes(e.target.value)}
                              placeholder="Add your notes about this case..."
                            />
                          </div>

                          <div className="form-group flag-toggle">
                            <label className="toggle-label">
                              <input
                                type="checkbox"
                                checked={feedbackFlagged}
                                onChange={(e) => setFeedbackFlagged(e.target.checked)}
                              />
                              <span className="toggle-text">Flag for Admin Review</span>
                            </label>
                          </div>

                          {feedbackFlagged && (
                            <div className="form-group">
                              <label>Flag Comment</label>
                              <input
                                type="text"
                                className="comment-input"
                                value={feedbackComment}
                                onChange={(e) => setFeedbackComment(e.target.value)}
                                placeholder="Reason for flagging (optional)..."
                              />
                            </div>
                          )}

                          <div className="form-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={handleSaveFeedback}
                              disabled={isSaving}
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="card-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleViewChecklist(checklist)}
                          >
                            View {checklist.checklistType === 'TIMEOUT' ? 'Timeout' : 'Debrief'}
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleStartEdit(checklist)}
                          >
                            {checklist.surgeonNotes || checklist.surgeonFlagged ? 'Edit Notes' : 'Add Notes'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Checklist Modals */}
        {selectedCaseId && token && user && (
          <>
            <TimeoutModal
              isOpen={showTimeoutModal}
              caseId={selectedCaseId}
              token={token}
              user={user}
              onClose={() => {
                setShowTimeoutModal(false);
                setSelectedCaseId(null);
              }}
              onComplete={() => {
                setShowTimeoutModal(false);
                setSelectedCaseId(null);
                loadData();
              }}
              zIndex={1100}
            />
            <DebriefModal
              isOpen={showDebriefModal}
              caseId={selectedCaseId}
              token={token}
              user={user}
              onClose={() => {
                setShowDebriefModal(false);
                setSelectedCaseId(null);
              }}
              onComplete={() => {
                setShowDebriefModal(false);
                setSelectedCaseId(null);
                loadData();
              }}
              zIndex={1100}
            />
          </>
        )}
      </main>

      <style jsx>{`
        .surgeon-checklists-page {
          padding: 2rem 0;
        }

        .filters-bar {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .search-input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .search-input:focus {
          outline: none;
          border-color: #3182ce;
          box-shadow: 0 0 0 2px rgba(49, 130, 206, 0.2);
        }

        .type-filter {
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.9rem;
          background: white;
          min-width: 160px;
        }

        .summary-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border-radius: 6px;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }

        .summary-count {
          font-weight: 600;
          color: #333;
        }

        .summary-flagged {
          color: #dd6b20;
          font-weight: 500;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          background: #f8f9fa;
          border-radius: 8px;
          color: #666;
        }

        .checklists-by-date {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .date-group {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .date-header {
          margin: 0 0 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e2e8f0;
          font-size: 1rem;
          color: #333;
        }

        .checklist-cards {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .checklist-card {
          background: #f8f9fa;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        }

        .checklist-card.flagged {
          border-left: 4px solid #dd6b20;
          background: #fffaf0;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .type-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .type-badge:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .type-badge.timeout {
          background: #bee3f8;
          color: #2b6cb0;
        }

        .type-badge.timeout:hover {
          background: #90cdf4;
        }

        .type-badge.debrief {
          background: #e9d8fd;
          color: #6b46c1;
        }

        .type-badge.debrief:hover {
          background: #d6bcfa;
        }

        .procedure-name {
          font-weight: 600;
          flex: 1;
        }

        .flagged-badge {
          background: #dd6b20;
          color: white;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .card-details {
          font-size: 0.875rem;
          margin-bottom: 0.75rem;
        }

        .detail-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .detail-label {
          color: #666;
          min-width: 80px;
        }

        .existing-notes {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .notes-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #666;
          display: block;
          margin-bottom: 0.25rem;
        }

        .notes-text {
          margin: 0;
          font-size: 0.9rem;
          color: #333;
        }

        .flag-status-box {
          border-radius: 6px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .flag-status-box.pending {
          background: #fef3c7;
          border: 1px solid #f59e0b;
        }

        .flag-status-box.resolved {
          background: #d1fae5;
          border: 1px solid #10b981;
        }

        .flag-comment {
          margin-bottom: 0.5rem;
        }

        .flag-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #92400e;
          display: block;
          margin-bottom: 0.25rem;
        }

        .flag-text {
          margin: 0;
          font-size: 0.9rem;
          color: #78350f;
          font-style: italic;
        }

        .resolution-info {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px dashed #10b981;
        }

        .resolution-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #047857;
          display: block;
          margin-bottom: 0.25rem;
        }

        .resolution-text {
          margin: 0;
          font-size: 0.9rem;
          color: #065f46;
        }

        .pending-notice {
          margin-top: 0.5rem;
        }

        .pending-text {
          font-size: 0.85rem;
          color: #92400e;
          font-weight: 500;
        }

        .feedback-form {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 1rem;
          margin-top: 0.5rem;
        }

        .form-group {
          margin-bottom: 0.75rem;
        }

        .form-group label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 0.25rem;
        }

        .notes-input,
        .comment-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.9rem;
          font-family: inherit;
        }

        .notes-input:focus,
        .comment-input:focus {
          outline: none;
          border-color: #3182ce;
        }

        .flag-toggle {
          padding: 0.5rem 0;
        }

        .toggle-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .toggle-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #dd6b20;
        }

        .toggle-text {
          font-weight: 500;
          color: #dd6b20;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .card-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        @media (max-width: 640px) {
          .filters-bar {
            flex-direction: column;
          }

          .type-filter {
            width: 100%;
          }

          .card-actions {
            flex-direction: column;
          }

          .card-actions .btn {
            width: 100%;
          }
        }

        /* Dark mode overrides */
        :global([data-theme="dark"]) .search-input,
        :global([data-theme="dark"]) .type-filter {
          background: var(--surface-tertiary);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .summary-bar {
          background: var(--surface-tertiary);
        }
        :global([data-theme="dark"]) .summary-count {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .empty-state {
          background: var(--surface-tertiary);
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .date-group {
          background: var(--surface-secondary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        :global([data-theme="dark"]) .date-header {
          border-bottom-color: var(--border-default);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .checklist-card {
          background: var(--surface-tertiary);
          border-color: var(--border-default);
        }
        :global([data-theme="dark"]) .checklist-card.flagged {
          background: #442a10;
          border-left-color: #dd6b20;
        }
        :global([data-theme="dark"]) .procedure-name {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .detail-label {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .existing-notes {
          background: var(--surface-secondary);
          border-color: var(--border-default);
        }
        :global([data-theme="dark"]) .notes-label {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .notes-text {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .flag-status-box.pending {
          background: #442a10;
          border-color: #f59e0b;
        }
        :global([data-theme="dark"]) .flag-status-box.resolved {
          background: #064e3b;
          border-color: #10b981;
        }
        :global([data-theme="dark"]) .flag-label {
          color: #fbbf24;
        }
        :global([data-theme="dark"]) .flag-text {
          color: #fde68a;
        }
        :global([data-theme="dark"]) .resolution-info {
          border-top-color: #10b981;
        }
        :global([data-theme="dark"]) .resolution-label {
          color: #34d399;
        }
        :global([data-theme="dark"]) .resolution-text {
          color: #6ee7b7;
        }
        :global([data-theme="dark"]) .pending-text {
          color: #fbbf24;
        }
        :global([data-theme="dark"]) .feedback-form {
          background: var(--surface-secondary);
          border-color: var(--border-default);
        }
        :global([data-theme="dark"]) .form-group label {
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .notes-input,
        :global([data-theme="dark"]) .comment-input {
          background: var(--surface-tertiary);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .loading {
          color: var(--text-muted);
        }
        :global([data-theme="dark"]) .btn-secondary {
          background: var(--surface-tertiary);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .btn-secondary:hover {
          background: var(--color-gray-400);
        }
        :global([data-theme="dark"]) .type-badge.timeout {
          background: #1e3a5f;
          color: #90cdf4;
        }
        :global([data-theme="dark"]) .type-badge.debrief {
          background: #44337a;
          color: #d6bcfa;
        }
      `}</style>
    </>
  );
}
