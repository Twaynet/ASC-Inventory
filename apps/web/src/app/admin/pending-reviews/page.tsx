'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getPendingReviews,
  getFlaggedReviews,
  resolveFlaggedReview,
  type PendingReview,
  type FlaggedReview,
} from '@/lib/api';

export default function AdminPendingReviewsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [flaggedReviews, setFlaggedReviews] = useState<FlaggedReview[]>([]);
  const [resolvedReviews, setResolvedReviews] = useState<FlaggedReview[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [pendingResult, flaggedResult] = await Promise.all([
        getPendingReviews(token),
        getFlaggedReviews(token),
      ]);
      setPendingReviews(pendingResult.pendingReviews);
      setFlaggedReviews(flaggedResult.flaggedReviews);
      setResolvedReviews(flaggedResult.resolvedReviews);
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
            <div className="summary-label">Flagged for Review</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{pendingScrubCount}</div>
            <div className="summary-label">Awaiting Scrub</div>
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
                        <span className={`checklist-type-badge ${review.checklistType.toLowerCase()}`}>
                          {review.checklistType}
                        </span>
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

            {/* All Clear Message */}
            {pendingReviews.length === 0 && flaggedReviews.length === 0 && (
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
      `}</style>
    </>
  );
}
