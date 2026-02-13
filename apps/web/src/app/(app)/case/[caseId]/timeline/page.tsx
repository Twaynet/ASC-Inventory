'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getCaseStatusEvents, type CaseStatusEvent } from '@/lib/api/cases';

/**
 * Phase 7.1 — Case Status Timeline
 *
 * Chronological event list showing status transitions with
 * from → to status, actor, timestamp, and reason/context.
 * Read-only view.
 */

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:         { bg: 'bg-surface-tertiary',                      text: 'text-text-muted' },
  REQUESTED:     { bg: 'bg-[var(--color-blue-bg)]',                text: 'text-[var(--color-blue-700)]' },
  APPROVED:      { bg: 'bg-[var(--color-green-bg)]',               text: 'text-[var(--color-green-700)]' },
  ACTIVE:        { bg: 'bg-[var(--color-green-bg)]',               text: 'text-[var(--color-green-700)]' },
  PREOP:         { bg: 'bg-[var(--color-blue-bg)]',                text: 'text-[var(--color-blue-700)]' },
  IN_PROGRESS:   { bg: 'bg-[var(--color-orange-bg)]',              text: 'text-[var(--color-orange-700)]' },
  COMPLETED:     { bg: 'bg-[var(--color-green-bg)]',               text: 'text-[var(--color-green-700)]' },
  CANCELLED:     { bg: 'bg-[var(--color-red-bg)]',                 text: 'text-[var(--color-red-700)]' },
  REJECTED:      { bg: 'bg-[var(--color-red-bg)]',                 text: 'text-[var(--color-red-700)]' },
  VOID:          { bg: 'bg-[var(--color-red-bg)]',                 text: 'text-[var(--color-red-700)]' },
};

function statusBadge(status: string | null) {
  if (!status) return null;
  const c = STATUS_COLORS[status] || { bg: 'bg-surface-tertiary', text: 'text-text-secondary' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}

function isAbnormal(from: string | null, to: string): boolean {
  if (from === 'COMPLETED' && to === 'VOID') return true;
  if (from === 'ACTIVE' && to === 'VOID') return true;
  if (from === 'APPROVED' && to === 'CANCELLED') return false; // normal
  return false;
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function CaseTimelinePage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const caseId = params.caseId as string;

  const [events, setEvents] = useState<CaseStatusEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getCaseStatusEvents(token, caseId);
      setEvents(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status events');
    } finally {
      setIsLoading(false);
    }
  }, [token, caseId]);

  useEffect(() => {
    if (token && user) loadEvents();
  }, [token, user, loadEvents]);

  if (!user || !token) {
    return (
      <>
        <Header title="Case Timeline" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  return (
    <>
      <Header title="Case Timeline" />
      <div className="p-6 max-w-[1000px] mx-auto">
        <button
          className="btn btn-secondary btn-sm mb-4"
          onClick={() => router.push(`/case/${caseId}`)}
        >
          &larr; Back to Case Dashboard
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <div className="bg-surface-primary rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Status Timeline
          </h2>

          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No status events recorded for this case.
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((event, idx) => {
                const abnormal = isAbnormal(event.fromStatus, event.toStatus);
                return (
                  <div
                    key={event.id}
                    className={`flex items-start gap-4 py-3 ${
                      idx < events.length - 1 ? 'border-b border-border' : ''
                    } ${abnormal ? 'bg-[var(--color-red-bg)] -mx-3 px-3 rounded' : ''}`}
                  >
                    {/* Timestamp */}
                    <div className="min-w-[150px] text-xs text-text-muted whitespace-nowrap pt-0.5">
                      {formatDateTime(event.createdAt)}
                    </div>

                    {/* Transition */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {event.fromStatus ? (
                          <>
                            {statusBadge(event.fromStatus)}
                            <span className="text-text-muted text-xs">&rarr;</span>
                          </>
                        ) : null}
                        {statusBadge(event.toStatus)}
                        {abnormal && (
                          <span className="text-xs font-medium text-[var(--color-red-700)]">
                            ABNORMAL
                          </span>
                        )}
                      </div>

                      {/* Actor */}
                      <div className="text-xs text-text-muted mt-1">
                        by {event.actorName}
                      </div>

                      {/* Reason */}
                      {event.reason && (
                        <div className="text-xs text-text-secondary mt-1">
                          Reason: {event.reason}
                        </div>
                      )}

                      {/* Context (JSON) */}
                      {event.context != null && (
                        <div className="text-xs text-text-muted mt-1 font-mono bg-surface-secondary rounded px-2 py-1">
                          {typeof event.context === 'string'
                            ? event.context
                            : JSON.stringify(event.context, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
