'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getMyPendingReviews,
  recordAsyncReview,
  type PendingReview,
} from '@/lib/api';

export default function PendingReviewsPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Review modal state
  const [reviewingCase, setReviewingCase] = useState<PendingReview | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Only SCRUB and SURGEON can use this page
  if (user!.role !== 'SCRUB' && user!.role !== 'SURGEON') {
    return (
      <>
        <Header title="Pending Reviews" />
        <main className="container">
          <div className="alert alert-info">
            This page is only for SCRUB and SURGEON roles.
          </div>
        </main>
      </>
    );
  }

  const roleLabel = user!.role === 'SCRUB' ? 'Scrub Tech' : 'Surgeon';
  const notesLabel = user!.role === 'SCRUB' ? 'Scrub Tech Notes/Corrections' : 'Surgeon Notes/Corrections';

  return (
    <>
      <Header title="My Pending Reviews" />

      <main className="container py-8">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        <div className="bg-surface-secondary rounded-lg py-4 px-6 mb-8">
          <p className="m-0 text-text-muted">
            As a {roleLabel}, you have pending debrief reviews to complete.
            These are procedures where your signature is required due to exceptions or issues documented during the debrief.
          </p>
        </div>

        {isLoadingData ? (
          <div className="loading">Loading pending reviews...</div>
        ) : pendingReviews.length === 0 ? (
          <div className="text-center p-12 bg-[var(--color-green-bg)] rounded-lg border border-[var(--color-green)]">
            <span className="text-[3rem] block mb-4 text-[var(--color-green)]">✓</span>
            <p className="m-0 text-text-primary">No pending reviews! You are all caught up.</p>
          </div>
        ) : (
          <div>
            <h2 className="mb-4 text-text-primary">Pending Reviews ({pendingReviews.length})</h2>
            {pendingReviews.map((review) => (
              <div key={review.instanceId} className="bg-surface-primary border border-border rounded-lg p-6 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="m-0 text-lg text-text-primary">{review.caseName}</h3>
                </div>
                <div className="mb-4 text-text-muted [&_p]:my-1">
                  <p><strong>Surgeon:</strong> {review.surgeonName}</p>
                  <p><strong>Debrief Completed:</strong> {new Date(review.completedAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
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
            <div className="bg-surface-primary rounded-lg p-8 max-w-[500px] w-[90%] max-h-[90vh] overflow-y-auto">
              <h2 className="mt-0 mb-4 text-text-primary">Complete Review</h2>
              <p className="bg-surface-secondary p-4 rounded mb-6 text-text-primary">
                <strong>{reviewingCase.caseName}</strong><br />
                Surgeon: {reviewingCase.surgeonName}
              </p>

              <div>
                <label className="block font-semibold mb-2 text-text-primary">
                  {notesLabel}
                  <span className="font-normal text-text-muted text-sm block">(Optional - add any notes or corrections)</span>
                </label>
                <textarea
                  className="w-full p-3 border border-border rounded text-base resize-y mb-4 bg-surface-primary text-text-primary"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={`Enter any ${roleLabel.toLowerCase()} notes or corrections...`}
                />

                <div className="alert alert-warning mb-6">
                  <p className="m-0 text-sm">
                    By clicking &quot;Sign and Submit&quot;, you confirm that you have reviewed
                    the debrief documentation for this procedure.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
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
    </>
  );
}
