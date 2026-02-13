'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCatalogCostEvents,
  getCatalogItem,
  type CatalogCostEvent,
} from '@/lib/api/catalog';

/**
 * Phase 7.5 — Catalog Cost History
 *
 * Timeline of cost changes for a catalog item.
 * Uses GET /api/catalog/:id/cost-events (CATALOG_MANAGE capability).
 */

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CatalogCostHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const catalogId = params.catalogId as string;

  const [events, setEvents] = useState<CatalogCostEvent[]>([]);
  const [catalogName, setCatalogName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const initialOffset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  const [offset, setOffset] = useState(initialOffset);
  const limit = 50;
  const [copied, setCopied] = useState(false);
  const pname = usePathname();
  const mountedRef = useRef(false);

  const loadCatalogName = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getCatalogItem(token, catalogId);
      setCatalogName(result.item.name);
    } catch {
      // Non-critical — the header will just show the ID
    }
  }, [token, catalogId]);

  const loadEvents = useCallback(async (newOffset: number) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getCatalogCostEvents(token, catalogId, {
        limit,
        offset: newOffset,
      });
      setEvents(result.events);
      setTotal(result.total);
      setOffset(newOffset);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost events');
    } finally {
      setIsLoading(false);
    }
  }, [token, catalogId]);

  useEffect(() => {
    if (token && user) {
      loadCatalogName();
      loadEvents(initialOffset);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, loadCatalogName, loadEvents]);

  // Live URL sync — update offset in URL when it changes
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const params = new URLSearchParams();
    if (offset > 0) params.set('offset', String(offset));
    const qs = params.toString();
    const target = `${pname}${qs ? `?${qs}` : ''}`;
    const current = `${pname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    if (target !== current) router.replace(target, { scroll: false });
  }, [offset, pname, router, searchParams]);

  if (!user || !token) {
    return (
      <>
        <Header title="Cost History" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Cost History" />
        <div className="p-6">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </div>
      </>
    );
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <>
      <Header title="Cost History" />
      <div className="p-6 max-w-[1000px] mx-auto">
        <button
          className="btn btn-secondary btn-sm mb-4"
          onClick={() => router.push('/admin/catalog')}
        >
          &larr; Back to Catalog
        </button>

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Cost History{catalogName ? `: ${catalogName}` : ''}
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {total} cost change{total !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const params = new URLSearchParams();
              if (offset > 0) params.set('offset', String(offset));
              const qs = params.toString();
              const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading cost events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No cost changes recorded for this item.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Effective Date</th>
                    <th className="text-right py-3 px-4 font-semibold text-text-secondary">Previous Cost</th>
                    <th className="text-right py-3 px-4 font-semibold text-text-secondary">New Cost</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Change</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Reason</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => {
                    const diff = evt.previousCostCents != null
                      ? evt.newCostCents - evt.previousCostCents
                      : null;
                    return (
                      <tr key={evt.id} className="border-t border-border hover:bg-surface-secondary">
                        <td className="py-3 px-4 text-text-primary whitespace-nowrap">
                          {formatDate(evt.effectiveAt)}
                        </td>
                        <td className="py-3 px-4 text-right text-text-muted font-mono">
                          {formatCents(evt.previousCostCents)}
                        </td>
                        <td className="py-3 px-4 text-right text-text-primary font-mono font-medium">
                          {formatCents(evt.newCostCents)}
                        </td>
                        <td className="py-3 px-4">
                          {diff != null ? (
                            <span className={diff > 0
                              ? 'text-[var(--color-red)] font-medium'
                              : diff < 0
                                ? 'text-[var(--color-green)] font-medium'
                                : 'text-text-muted'
                            }>
                              {diff > 0 ? '+' : ''}{formatCents(diff)}
                            </span>
                          ) : (
                            <span className="text-text-muted text-xs">Initial</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-text-secondary text-xs max-w-[200px] truncate">
                          {evt.reason || '—'}
                        </td>
                        <td className="py-3 px-4 text-text-muted text-xs whitespace-nowrap">
                          {evt.changedByName || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={offset === 0}
                onClick={() => loadEvents(offset - limit)}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={offset + limit >= total}
                onClick={() => loadEvents(offset + limit)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
