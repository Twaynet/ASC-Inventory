'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  getMyPendingReviews,
  recordAsyncReview,
  type PendingReview,
} from '@/lib/api';

export default function PendingReviewsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Review modal state
  const [reviewingCase, setReviewingCase] = useState<PendingReview | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getMyPendingReviews(token);
      setPendingReviews(result.pendingReviews);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending reviews');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, loadData]);

  const handleStartReview = (review: PendingReview) => {
    setReviewingCase(review);
    setNotes('');
  };

  const handleSubmitReview = async () => {
    if (!token || !reviewingCase) return;
    setIsSubmitting(true);
    setError('');
    try {
      await recordAsyncReview(token, reviewingCase.caseId, notes || null, 'LOGIN');
      setSuccessMessage('Review submitted successfully');
      setReviewingCase(null);
      setNotes('');
      await loadData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReview = () => {
    setReviewingCase(null);
    setNotes('');
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  // Only SCRUB and SURGEON can use this page
  if (user.role !== 'SCRUB' && user.role !== 'SURGEON') {
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
              <h1>Pending Reviews</h1>
            </div>
            <div className="header-user">
              <span>
                {user.name} ({user.role})
              </span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Sign Out
              </button>
            </div>
          </div>
        </header>
        <main className="container">
          <div className="alert alert-info">
            This page is only for SCRUB and SURGEON roles.
          </div>
        </main>
      </>
    );
  }

  const roleLabel = user.role === 'SCRUB' ? 'Scrub Tech' : 'Surgeon';
  const notesLabel = user.role === 'SCRUB' ? 'Scrub Tech Notes/Corrections' : 'Surgeon Notes/Corrections';

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
            <h1>My Pending Reviews</h1>
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

      <main className="container pending-reviews-page">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        <div className="pending-reviews-info">
          <p>
            As a {roleLabel}, you have pending debrief reviews to complete.
            These are procedures where your signature is required due to exceptions or issues documented during the debrief.
          </p>
        </div>

        {isLoadingData ? (
          <div className="loading">Loading pending reviews...</div>
        ) : pendingReviews.length === 0 ? (
          <div className="no-pending-reviews">
            <span className="status-icon">✓</span>
            <p>No pending reviews! You are all caught up.</p>
          </div>
        ) : (
          <div className="pending-reviews-list">
            <h2>Pending Reviews ({pendingReviews.length})</h2>
            {pendingReviews.map((review) => (
              <div key={review.instanceId} className="pending-review-card">
                <div className="review-header">
                  <h3>{review.caseName}</h3>
                  <span className="review-mrn">MRN: {review.patientMrn}</span>
                </div>
                <div className="review-details">
                  <p><strong>Surgeon:</strong> {review.surgeonName}</p>
                  <p><strong>Debrief Completed:</strong> {new Date(review.completedAt).toLocaleString()}</p>
                </div>
                <div className="review-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleStartReview(review)}
                  >
                    Complete Review
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => router.push(`/or/debrief/${review.caseId}`)}
                  >
                    View Debrief
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Review Modal */}
        {reviewingCase && (
          <div className="modal-overlay">
            <div className="modal review-modal">
              <h2>Complete Review</h2>
              <p className="modal-case-info">
                <strong>{reviewingCase.caseName}</strong><br />
                MRN: {reviewingCase.patientMrn}<br />
                Surgeon: {reviewingCase.surgeonName}
              </p>

              <div className="review-form">
                <label className="form-label">
                  {notesLabel}
                  <span className="form-hint">(Optional - add any notes or corrections)</span>
                </label>
                <textarea
                  className="form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={`Enter any ${roleLabel.toLowerCase()} notes or corrections...`}
                />

                <div className="signature-notice">
                  <p>
                    By clicking &quot;Sign and Submit&quot;, you confirm that you have reviewed
                    the debrief documentation for this procedure.
                  </p>
                </div>

                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={handleCancelReview}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmitReview}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : `Sign and Submit as ${roleLabel}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .pending-reviews-page {
          padding: 2rem 0;
        }

        .pending-reviews-info {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem 1.5rem;
          margin-bottom: 2rem;
        }

        .pending-reviews-info p {
          margin: 0;
          color: #666;
        }

        .no-pending-reviews {
          text-align: center;
          padding: 3rem;
          background: #f0fff4;
          border-radius: 8px;
          border: 1px solid #9ae6b4;
        }

        .no-pending-reviews .status-icon {
          font-size: 3rem;
          display: block;
          margin-bottom: 1rem;
          color: #38a169;
        }

        .pending-reviews-list h2 {
          margin-bottom: 1rem;
          color: #333;
        }

        .pending-review-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .review-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .review-header h3 {
          margin: 0;
          font-size: 1.125rem;
          color: #333;
        }

        .review-mrn {
          color: #666;
          font-size: 0.875rem;
        }

        .review-details {
          margin-bottom: 1rem;
          color: #666;
        }

        .review-details p {
          margin: 0.25rem 0;
        }

        .review-actions {
          display: flex;
          gap: 0.75rem;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .modal-case-info {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1.5rem;
        }

        .review-form .form-label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .review-form .form-hint {
          font-weight: normal;
          color: #666;
          font-size: 0.875rem;
          display: block;
        }

        .review-form .form-textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
          resize: vertical;
          margin-bottom: 1rem;
        }

        .signature-notice {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          padding: 0.75rem 1rem;
          margin-bottom: 1.5rem;
        }

        .signature-notice p {
          margin: 0;
          font-size: 0.875rem;
          color: #856404;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
      `}</style>
    </>
  );
}
