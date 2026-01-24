'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { TimeoutModal, DebriefModal } from '@/components/Checklists';
import {
  getPendingReviews,
  getFlaggedReviews,
  resolveFlaggedReview,
  getSurgeonFlaggedReviews,
  type PendingReview,
  type FlaggedReview,
  type DebriefItemForReview,
  type SurgeonFlaggedReview,
} from '@/lib/api';

export default function AdminPendingReviewsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [flaggedReviews, setFlaggedReviews] = useState<FlaggedReview[]>([]);
  const [resolvedReviews, setResolvedReviews] = useState<FlaggedReview[]>([]);
  const [debriefItemsForReview, setDebriefItemsForReview] = useState<DebriefItemForReview[]>([]);
  const [surgeonFlaggedReviews, setSurgeonFlaggedReviews] = useState<SurgeonFlaggedReview[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState<string | null>(null);

  // Resolved reviews search/filter state
  const [resolvedSearchTerm, setResolvedSearchTerm] = useState('');
  const [resolvedTypeFilter, setResolvedTypeFilter] = useState<'all' | 'TIMEOUT' | 'DEBRIEF'>('all');
  const [showResolvedSection, setShowResolvedSection] = useState(false);

  // Modal state for viewing checklists
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [modalCaseId, setModalCaseId] = useState<string | null>(null);

  const handleViewTimeout = (caseId: string) => {
    setModalCaseId(caseId);
    setShowTimeoutModal(true);
  };

  const handleViewDebrief = (caseId: string) => {
    setModalCaseId(caseId);
    setShowDebriefModal(true);
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [pendingResult, flaggedResult, surgeonFlaggedResult] = await Promise.all([
        getPendingReviews(token),
        getFlaggedReviews(token),
        getSurgeonFlaggedReviews(token),
      ]);
      setPendingReviews(pendingResult.pendingReviews);
      setFlaggedReviews(flaggedResult.flaggedReviews);
      setResolvedReviews(flaggedResult.resolvedReviews);
      setDebriefItemsForReview(flaggedResult.debriefItemsForReview || []);
      setSurgeonFlaggedReviews(surgeonFlaggedResult.surgeonFlaggedReviews);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending reviews');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  const handleResolveFlag = async (signatureId: string) => {
    if (!token) return;
    setIsResolving(signatureId);
    try {
      await resolveFlaggedReview(token, signatureId, resolveNotes[signatureId]);
      await loadData();
      setResolveNotes((prev) => {
        const updated = { ...prev };
        delete updated[signatureId];
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve flag');
    } finally {
      setIsResolving(null);
    }
  };

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      loadData();
    }
  }, [token, user, loadData]);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  // Only ADMIN can view this page
  if (user.role !== 'ADMIN') {
    return (
      <>
        <Header title="Pending Reviews" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  // Calculate summary stats
  const totalPending = pendingReviews.length;
  const pendingScrubCount = pendingReviews.filter(r => r.pendingScrub).length;
  const pendingSurgeonCount = pendingReviews.filter(r => r.pendingSurgeon).length;
  const unresolvedFlagsCount = flaggedReviews.length;

  // Group by how old the review is
  const now = new Date();
  const olderThan24h = pendingReviews.filter(r => {
    const completedAt = new Date(r.completedAt);
    return (now.getTime() - completedAt.getTime()) > 24 * 60 * 60 * 1000;
  });

  return (
    <>
      <Header title="Pending Reviews" />

      <main className="container admin-pending-reviews-page">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className={`summary-card ${totalPending === 0 ? 'green' : 'orange'}`}>
            <div className="summary-value">{totalPending}</div>
            <div className="summary-label">Debrief Pending</div>
          </div>
          <div className={`summary-card ${unresolvedFlagsCount === 0 ? 'green' : 'orange'}`}>
            <div className="summary-value">{unresolvedFlagsCount}</div>
            <div className="summary-label">Staff Flagged</div>
          </div>
          <div className={`summary-card ${surgeonFlaggedReviews.length === 0 ? 'green' : 'purple'}`}>
            <div className="summary-value">{surgeonFlaggedReviews.length}</div>
            <div className="summary-label">Surgeon Flagged</div>
          </div>
          <div className={`summary-card ${olderThan24h.length > 0 ? 'red' : 'green'}`}>
            <div className="summary-value">{olderThan24h.length}</div>
            <div className="summary-label">Over 24h Old</div>
          </div>
        </div>

        {/* Alert for old pending reviews */}
        {olderThan24h.length > 0 && (
          <div className="alert alert-warning">
            <strong>Attention:</strong> {olderThan24h.length} review(s) have been pending for more than 24 hours.
            Follow up with the responsible staff to ensure timely completion.
          </div>
        )}

        {isLoadingData ? (
          <div className="loading">Loading pending reviews...</div>
        ) : (
          <>
            {/* Flagged Reviews Section */}
            {flaggedReviews.length > 0 && (
              <div className="flagged-reviews-section">
                <h2>⚑ Flagged for Review ({flaggedReviews.length})</h2>
                <p className="section-description">
                  These signatures were flagged by staff for admin review. Review and resolve each flag.
                </p>
                <div className="flagged-reviews-list">
                  {flaggedReviews.map((review) => (
                    <div key={review.signatureId} className="flagged-review-card">
                      <div className="flagged-review-header">
                        <button
                          className={`checklist-type-badge clickable ${review.checklistType.toLowerCase()}`}
                          onClick={() => review.checklistType === 'TIMEOUT'
                            ? handleViewTimeout(review.caseId)
                            : handleViewDebrief(review.caseId)
                          }
                          title={`View ${review.checklistType === 'TIMEOUT' ? 'Timeout' : 'Debrief'}`}
                        >
                          {review.checklistType}
                        </button>
                        <span className="flagged-review-procedure">{review.caseName}</span>
                      </div>
                      <div className="flagged-review-details">
                        <div className="detail-row">
                          <span className="detail-label">Surgeon:</span>
                          <span>{review.surgeonName}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Signed by:</span>
                          <span>{review.signedByName} ({review.signatureRole})</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Signed at:</span>
                          <span>{new Date(review.signedAt).toLocaleString()}</span>
                        </div>
                        {review.flagComment && (
                          <div className="flag-comment-box">
                            <span className="detail-label">Staff Comment:</span>
                            <span className="flag-comment-text">{review.flagComment}</span>
                          </div>
                        )}
                        {(review.equipmentNotes || review.improvementNotes) && (
                          <div className="context-notes">
                            {review.equipmentNotes && (
                              <div className="context-note">
                                <span className="context-label">Equipment Issues:</span>
                                <span>{review.equipmentNotes}</span>
                              </div>
                            )}
                            {review.improvementNotes && (
                              <div className="context-note">
                                <span className="context-label">Improvement Opportunity:</span>
                                <span>{review.improvementNotes}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flagged-review-actions">
                        <input
                          type="text"
                          className="resolve-notes-input"
                          placeholder="Resolution notes (optional)"
                          value={resolveNotes[review.signatureId] || ''}
                          onChange={(e) => setResolveNotes((prev) => ({
                            ...prev,
                            [review.signatureId]: e.target.value
                          }))}
                          disabled={isResolving === review.signatureId}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleResolveFlag(review.signatureId)}
                          disabled={isResolving === review.signatureId}
                        >
                          {isResolving === review.signatureId ? 'Resolving...' : 'Mark Resolved'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debrief Items with Equipment/Improvement Notes */}
            {debriefItemsForReview.length > 0 && (
              <div className="debrief-items-section">
                <h2>Equipment & Improvement Notes ({debriefItemsForReview.length})</h2>
                <p className="section-description">
                  Debrief checklists with equipment issues or improvement opportunities logged.
                </p>
                <div className="debrief-items-list">
                  {debriefItemsForReview.map((item) => (
                    <div key={item.instanceId} className="debrief-item-card">
                      <div className="debrief-item-header">
                        <span className="debrief-item-procedure">{item.caseName}</span>
                        <span className="debrief-item-surgeon">{item.surgeonName}</span>
                      </div>
                      {item.completedAt && (
                        <div className="debrief-item-date">
                          Completed: {new Date(item.completedAt).toLocaleString()}
                        </div>
                      )}
                      <div className="debrief-item-notes">
                        {item.equipmentNotes && (
                          <div className="note-item equipment">
                            <span className="note-label">Equipment Issues:</span>
                            <span className="note-text">{item.equipmentNotes}</span>
                          </div>
                        )}
                        {item.improvementNotes && (
                          <div className="note-item improvement">
                            <span className="note-label">Improvement Opportunity:</span>
                            <span className="note-text">{item.improvementNotes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Surgeon Flagged Reviews Section */}
            {surgeonFlaggedReviews.length > 0 && (
              <div className="surgeon-flagged-section">
                <h2>Surgeon Flagged ({surgeonFlaggedReviews.length})</h2>
                <p className="section-description">
                  These checklists were flagged by surgeons for admin review.
                </p>
                <div className="surgeon-flagged-list">
                  {surgeonFlaggedReviews.map((review) => (
                    <div key={review.instanceId} className="surgeon-flagged-card">
                      <div className="surgeon-flagged-header">
                        <button
                          className={`checklist-type-badge clickable ${review.checklistType.toLowerCase()}`}
                          onClick={() => review.checklistType === 'TIMEOUT'
                            ? handleViewTimeout(review.caseId)
                            : handleViewDebrief(review.caseId)
                          }
                          title={`View ${review.checklistType === 'TIMEOUT' ? 'Timeout' : 'Debrief'}`}
                        >
                          {review.checklistType}
                        </button>
                        <span className="surgeon-flagged-procedure">{review.procedureName}</span>
                      </div>
                      <div className="surgeon-flagged-details">
                        <div className="detail-row">
                          <span className="detail-label">Case #:</span>
                          <span>{review.caseNumber}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Surgeon:</span>
                          <span>{review.surgeonName}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Date:</span>
                          <span>{new Date(review.scheduledDate + 'T00:00:00').toLocaleDateString()}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Flagged:</span>
                          <span>{new Date(review.surgeonFlaggedAt).toLocaleString()}</span>
                        </div>
                        {review.surgeonFlaggedComment && (
                          <div className="surgeon-comment-box">
                            <span className="detail-label">Surgeon Comment:</span>
                            <span className="surgeon-comment-text">{review.surgeonFlaggedComment}</span>
                          </div>
                        )}
                        {review.surgeonNotes && (
                          <div className="surgeon-notes-box">
                            <span className="detail-label">Surgeon Notes:</span>
                            <span className="surgeon-notes-text">{review.surgeonNotes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Clear Message */}
            {pendingReviews.length === 0 && flaggedReviews.length === 0 && debriefItemsForReview.length === 0 && surgeonFlaggedReviews.length === 0 && (
              <div className="no-pending-reviews">
                <span className="status-icon">✓</span>
                <h2>All Clear!</h2>
                <p>No pending reviews or flagged items. All debrief reviews have been completed.</p>
              </div>
            )}

            {/* Pending Debrief Reviews Section */}
            {pendingReviews.length > 0 && (
              <div className="pending-reviews-table-container">
                <h2>Pending Debrief Reviews ({pendingReviews.length})</h2>
            <table className="pending-reviews-table">
              <thead>
                <tr>
                  <th>Procedure</th>
                  <th>Surgeon</th>
                  <th>Completed</th>
                  <th>Pending</th>
                  <th>Age</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingReviews.map((review) => {
                  const completedAt = new Date(review.completedAt);
                  const ageMs = now.getTime() - completedAt.getTime();
                  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
                  const isOld = ageHours >= 24;

                  return (
                    <tr key={review.instanceId} className={isOld ? 'old-review' : ''}>
                      <td className="procedure-name">{review.caseName}</td>
                      <td>{review.surgeonName}</td>
                      <td>{completedAt.toLocaleString()}</td>
                      <td>
                        <div className="pending-badges">
                          {review.pendingScrub && (
                            <span className="badge badge-scrub">SCRUB</span>
                          )}
                          {review.pendingSurgeon && (
                            <span className="badge badge-surgeon">SURGEON</span>
                          )}
                        </div>
                      </td>
                      <td className={isOld ? 'age-old' : ''}>
                        {ageHours < 1 ? '< 1h' : `${ageHours}h`}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/or/debrief/${review.caseId}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              </div>
            )}

            {/* Resolved Reviews Section (Collapsible) */}
            {resolvedReviews.length > 0 && (
              <div className="resolved-reviews-section">
                <button
                  className="resolved-toggle"
                  onClick={() => setShowResolvedSection(!showResolvedSection)}
                >
                  {showResolvedSection ? '▼' : '▶'} Resolved Reviews ({resolvedReviews.length})
                </button>

                {showResolvedSection && (
                  <div className="resolved-content">
                    <div className="resolved-filters">
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Search by procedure, surgeon, or staff..."
                        value={resolvedSearchTerm}
                        onChange={(e) => setResolvedSearchTerm(e.target.value)}
                      />
                      <select
                        className="type-filter"
                        value={resolvedTypeFilter}
                        onChange={(e) => setResolvedTypeFilter(e.target.value as 'all' | 'TIMEOUT' | 'DEBRIEF')}
                      >
                        <option value="all">All Types</option>
                        <option value="TIMEOUT">Time Out</option>
                        <option value="DEBRIEF">Debrief</option>
                      </select>
                    </div>

                    <div className="resolved-list">
                      {resolvedReviews
                        .filter((review) => {
                          const searchLower = resolvedSearchTerm.toLowerCase();
                          const matchesSearch =
                            !resolvedSearchTerm ||
                            review.caseName.toLowerCase().includes(searchLower) ||
                            review.surgeonName.toLowerCase().includes(searchLower) ||
                            review.signedByName.toLowerCase().includes(searchLower) ||
                            (review.flagComment?.toLowerCase().includes(searchLower)) ||
                            (review.resolutionNotes?.toLowerCase().includes(searchLower));
                          const matchesType =
                            resolvedTypeFilter === 'all' || review.checklistType === resolvedTypeFilter;
                          return matchesSearch && matchesType;
                        })
                        .map((review) => (
                          <div key={review.signatureId} className="resolved-card">
                            <div className="resolved-header">
                              <button
                                className={`checklist-type-badge clickable ${review.checklistType.toLowerCase()}`}
                                onClick={() => review.checklistType === 'TIMEOUT'
                                  ? handleViewTimeout(review.caseId)
                                  : handleViewDebrief(review.caseId)
                                }
                                title={`View ${review.checklistType === 'TIMEOUT' ? 'Timeout' : 'Debrief'}`}
                              >
                                {review.checklistType}
                              </button>
                              <span className="resolved-procedure">{review.caseName}</span>
                              <span className="resolved-date">
                                Resolved: {review.resolvedAt ? new Date(review.resolvedAt).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            <div className="resolved-details">
                              <div className="resolved-row">
                                <span className="resolved-label">Surgeon:</span>
                                <span>{review.surgeonName}</span>
                              </div>
                              <div className="resolved-row">
                                <span className="resolved-label">Flagged by:</span>
                                <span>{review.signedByName} ({review.signatureRole})</span>
                              </div>
                              <div className="resolved-row">
                                <span className="resolved-label">Flagged at:</span>
                                <span>{new Date(review.signedAt).toLocaleString()}</span>
                              </div>
                              {review.flagComment && (
                                <div className="resolved-row">
                                  <span className="resolved-label">Staff comment:</span>
                                  <span className="resolved-comment">{review.flagComment}</span>
                                </div>
                              )}
                              {review.resolvedByName && (
                                <div className="resolved-row">
                                  <span className="resolved-label">Resolved by:</span>
                                  <span>{review.resolvedByName}</span>
                                </div>
                              )}
                              {review.resolutionNotes && (
                                <div className="resolved-row">
                                  <span className="resolved-label">Resolution:</span>
                                  <span className="resolution-notes">{review.resolutionNotes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      {resolvedReviews.filter((review) => {
                        const searchLower = resolvedSearchTerm.toLowerCase();
                        const matchesSearch =
                          !resolvedSearchTerm ||
                          review.caseName.toLowerCase().includes(searchLower) ||
                          review.surgeonName.toLowerCase().includes(searchLower) ||
                          review.signedByName.toLowerCase().includes(searchLower) ||
                          (review.flagComment?.toLowerCase().includes(searchLower)) ||
                          (review.resolutionNotes?.toLowerCase().includes(searchLower));
                        const matchesType =
                          resolvedTypeFilter === 'all' || review.checklistType === resolvedTypeFilter;
                        return matchesSearch && matchesType;
                      }).length === 0 && (
                        <p className="no-results">No resolved reviews match your search criteria.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Checklist Modals */}
        {modalCaseId && token && user && (
          <>
            <TimeoutModal
              isOpen={showTimeoutModal}
              caseId={modalCaseId}
              token={token}
              user={user}
              onClose={() => {
                setShowTimeoutModal(false);
                setModalCaseId(null);
              }}
              onComplete={() => {
                setShowTimeoutModal(false);
                setModalCaseId(null);
                loadData();
              }}
              zIndex={1100}
            />
            <DebriefModal
              isOpen={showDebriefModal}
              caseId={modalCaseId}
              token={token}
              user={user}
              onClose={() => {
                setShowDebriefModal(false);
                setModalCaseId(null);
              }}
              onComplete={() => {
                setShowDebriefModal(false);
                setModalCaseId(null);
                loadData();
              }}
              zIndex={1100}
            />
          </>
        )}
      </main>

      <style jsx>{`
        .admin-pending-reviews-page {
          padding: 2rem 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border-left: 4px solid #e2e8f0;
        }

        .summary-card.green {
          border-left-color: #38a169;
          background: #f0fff4;
        }

        .summary-card.orange {
          border-left-color: #dd6b20;
          background: #fffaf0;
        }

        .summary-card.red {
          border-left-color: #e53e3e;
          background: #fff5f5;
        }

        .summary-card.purple {
          border-left-color: #805ad5;
          background: #faf5ff;
        }

        .summary-value {
          font-size: 2.5rem;
          font-weight: bold;
          color: #333;
        }

        .summary-label {
          color: #666;
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        .no-pending-reviews {
          text-align: center;
          padding: 3rem;
          background: #f0fff4;
          border-radius: 8px;
          border: 1px solid #9ae6b4;
        }

        .no-pending-reviews .status-icon {
          font-size: 4rem;
          display: block;
          margin-bottom: 1rem;
          color: #38a169;
        }

        .no-pending-reviews h2 {
          margin: 0 0 0.5rem;
          color: #38a169;
        }

        .no-pending-reviews p {
          margin: 0;
          color: #666;
        }

        .pending-reviews-table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .pending-reviews-table-container h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .pending-reviews-table {
          width: 100%;
          border-collapse: collapse;
        }

        .pending-reviews-table th,
        .pending-reviews-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .pending-reviews-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #333;
        }

        .pending-reviews-table tr:hover {
          background: #f8f9fa;
        }

        .pending-reviews-table tr.old-review {
          background: #fff5f5;
        }

        .pending-reviews-table tr.old-review:hover {
          background: #fed7d7;
        }

        .procedure-name {
          font-weight: 500;
        }

        .pending-badges {
          display: flex;
          gap: 0.5rem;
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-scrub {
          background: #e9d8fd;
          color: #6b46c1;
        }

        .badge-surgeon {
          background: #bee3f8;
          color: #2b6cb0;
        }

        .age-old {
          color: #e53e3e;
          font-weight: 600;
        }

        .alert-warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          color: #856404;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .flagged-reviews-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 1.5rem;
          border-left: 4px solid #dd6b20;
        }

        .flagged-reviews-section h2 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          color: #dd6b20;
        }

        .section-description {
          color: #666;
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }

        .flagged-reviews-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .flagged-review-card {
          background: #fffaf0;
          border: 1px solid #fbd38d;
          border-radius: 8px;
          padding: 1rem;
        }

        .flagged-review-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .checklist-type-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .checklist-type-badge.timeout {
          background: #bee3f8;
          color: #2b6cb0;
        }

        .checklist-type-badge.debrief {
          background: #e9d8fd;
          color: #6b46c1;
        }

        .checklist-type-badge.clickable {
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .checklist-type-badge.clickable:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .checklist-type-badge.clickable.timeout:hover {
          background: #90cdf4;
        }

        .checklist-type-badge.clickable.debrief:hover {
          background: #d6bcfa;
        }

        .flagged-review-procedure {
          font-weight: 600;
          font-size: 1rem;
        }

        .flagged-review-details {
          margin-bottom: 0.75rem;
          font-size: 0.9rem;
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

        .flagged-review-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          border-top: 1px solid #fbd38d;
          padding-top: 0.75rem;
          margin-top: 0.5rem;
        }

        .resolve-notes-input {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .resolve-notes-input:disabled {
          background: #f7fafc;
        }

        .flag-comment-box {
          margin-top: 0.5rem;
          padding: 0.75rem;
          background: #fff5f5;
          border-radius: 6px;
          border-left: 3px solid #e53e3e;
        }

        .flag-comment-text {
          display: block;
          margin-top: 0.25rem;
          font-style: italic;
        }

        .context-notes {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .context-note {
          margin-bottom: 0.5rem;
        }

        .context-note:last-child {
          margin-bottom: 0;
        }

        .context-label {
          font-weight: 600;
          color: #4a5568;
          display: block;
          margin-bottom: 0.25rem;
        }

        .debrief-items-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 1.5rem;
          border-left: 4px solid #3182ce;
        }

        .debrief-items-section h2 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          color: #3182ce;
        }

        .debrief-items-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .debrief-item-card {
          background: #ebf8ff;
          border: 1px solid #90cdf4;
          border-radius: 8px;
          padding: 1rem;
        }

        .debrief-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .debrief-item-procedure {
          font-weight: 600;
          font-size: 1rem;
        }

        .debrief-item-surgeon {
          color: #666;
          font-size: 0.9rem;
        }

        .debrief-item-date {
          font-size: 0.8rem;
          color: #666;
          margin-bottom: 0.75rem;
        }

        .debrief-item-notes {
          background: white;
          border-radius: 6px;
          padding: 0.75rem;
        }

        .note-item {
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .note-item:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .note-label {
          font-weight: 600;
          color: #4a5568;
          display: block;
          margin-bottom: 0.25rem;
          font-size: 0.85rem;
        }

        .note-item.equipment .note-label {
          color: #c53030;
        }

        .note-item.improvement .note-label {
          color: #2b6cb0;
        }

        .note-text {
          font-size: 0.9rem;
        }

        .surgeon-flagged-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 1.5rem;
          border-left: 4px solid #805ad5;
        }

        .surgeon-flagged-section h2 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          color: #805ad5;
        }

        .surgeon-flagged-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .surgeon-flagged-card {
          background: #faf5ff;
          border: 1px solid #d6bcfa;
          border-radius: 8px;
          padding: 1rem;
        }

        .surgeon-flagged-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .surgeon-flagged-procedure {
          font-weight: 600;
          font-size: 1rem;
        }

        .surgeon-flagged-details {
          font-size: 0.9rem;
        }

        .surgeon-comment-box {
          margin-top: 0.5rem;
          padding: 0.75rem;
          background: #fff5f5;
          border-radius: 6px;
          border-left: 3px solid #805ad5;
        }

        .surgeon-comment-text {
          display: block;
          margin-top: 0.25rem;
          font-style: italic;
        }

        .surgeon-notes-box {
          margin-top: 0.5rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .surgeon-notes-text {
          display: block;
          margin-top: 0.25rem;
        }

        .resolved-reviews-section {
          margin-top: 2rem;
          background: white;
          border-radius: 8px;
          padding: 1rem 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .resolved-toggle {
          background: none;
          border: none;
          font-size: 1rem;
          font-weight: 600;
          color: #4a5568;
          cursor: pointer;
          padding: 0.5rem 0;
          width: 100%;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .resolved-toggle:hover {
          color: #2d3748;
        }

        .resolved-content {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .resolved-filters {
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
          min-width: 140px;
        }

        .type-filter:focus {
          outline: none;
          border-color: #3182ce;
        }

        .resolved-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 500px;
          overflow-y: auto;
        }

        .resolved-card {
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        }

        .resolved-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .resolved-procedure {
          font-weight: 600;
          flex: 1;
        }

        .resolved-date {
          font-size: 0.8rem;
          color: #718096;
        }

        .resolved-details {
          font-size: 0.9rem;
        }

        .resolved-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
          flex-wrap: wrap;
        }

        .resolved-label {
          color: #718096;
          min-width: 100px;
        }

        .resolved-comment {
          font-style: italic;
          color: #c53030;
        }

        .resolution-notes {
          color: #2b6cb0;
          font-weight: 500;
        }

        .no-results {
          text-align: center;
          color: #718096;
          padding: 2rem;
          margin: 0;
        }

        @media (max-width: 640px) {
          .resolved-filters {
            flex-direction: column;
          }

          .type-filter {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
