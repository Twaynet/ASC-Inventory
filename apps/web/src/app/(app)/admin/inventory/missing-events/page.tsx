'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getMissingEvents,
  type MissingAnalyticsGroupBy,
  type MissingAnalyticsResolution,
  type MissingEventItem,
  type MissingEventsResponse,
} from '@/lib/api/inventory';

/**
 * Phase 8.1A — Missing Events Drill-Down
 *
 * Shows individual missing/found events for a specific analytics group.
 * Navigated to from the analytics page when clicking a group row.
 */

const PAGE_SIZE = 100;

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function MissingEventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { hasRole } = useAccessControl();

  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';
  const groupBy = (searchParams.get('groupBy') as MissingAnalyticsGroupBy) || 'day';
  const groupKey = searchParams.get('groupKey') || undefined;
  const date = searchParams.get('date') || undefined;
  const resolution = (searchParams.get('resolution') as MissingAnalyticsResolution) || 'BOTH';

  const [offset, setOffset] = useState(parseInt(searchParams.get('offset') || '0', 10));
  const [data, setData] = useState<MissingEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!token || !start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getMissingEvents(token, {
        start,
        end,
        groupBy,
        groupKey,
        date,
        resolution,
        limit: PAGE_SIZE,
        offset,
      });
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [token, start, end, groupBy, groupKey, date, resolution, offset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync offset to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('offset', String(offset));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [offset, router, searchParams]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const pageLabel = groupBy === 'day'
    ? `Events on ${date}`
    : `Events for ${groupBy}: ${groupKey}`;

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Missing Events" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <>
      <Header title="Missing Events — Drill-Down" />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header bar */}
        <div className="bg-surface-primary rounded-lg border border-border p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">{pageLabel}</div>
            <div className="text-xs text-text-muted">
              Resolution: {resolution} &middot; {data ? `${data.total} event${data.total !== 1 ? 's' : ''}` : '...'}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => router.back()}>
              Back
            </button>
            <button className="btn btn-secondary btn-sm" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading && (
          <div className="text-center py-12 text-text-muted">Loading events...</div>
        )}

        {data && !loading && (
          <>
            <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="text-left p-3 font-medium text-text-secondary">Date</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Type</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Catalog</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Lot / Serial</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Location</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Surgeon</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Staff</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-text-muted">
                          No events found.
                        </td>
                      </tr>
                    ) : (
                      data.events.map((e: MissingEventItem) => (
                        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
                          <td className="p-3 text-text-primary whitespace-nowrap text-xs">
                            {formatDateTime(e.occurredAt)}
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${
                              e.type === 'MISSING' ? 'bg-[var(--color-red)]' : 'bg-[var(--color-green)]'
                            }`}>
                              {e.type}
                            </span>
                          </td>
                          <td className="p-3 text-text-primary">{e.catalogName}</td>
                          <td className="p-3 text-text-secondary text-xs">
                            {e.lotNumber && <div>Lot: {e.lotNumber}</div>}
                            {e.serialNumber && <div>SN: {e.serialNumber}</div>}
                            {!e.lotNumber && !e.serialNumber && '—'}
                          </td>
                          <td className="p-3 text-text-secondary">{e.locationName || '—'}</td>
                          <td className="p-3 text-text-secondary">{e.surgeonName || '—'}</td>
                          <td className="p-3 text-text-secondary">{e.staffName || '—'}</td>
                          <td className="p-3 text-text-muted text-xs max-w-[200px] truncate" title={e.notes}>
                            {e.notes}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <div className="text-text-muted">
                  Page {currentPage} of {totalPages} ({data.total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={offset + PAGE_SIZE >= data.total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
