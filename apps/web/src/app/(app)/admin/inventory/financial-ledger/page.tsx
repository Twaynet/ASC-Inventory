'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryEvents,
  type InventoryEventListItem,
} from '@/lib/api/inventory';

/**
 * Phase 7.4 — Inventory Financial Ledger
 *
 * Read-only paginated ledger of financial inventory events.
 * Uses GET /api/inventory/events?financial=true (INVENTORY_MANAGE capability).
 */

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

function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultEnd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryFinancialLedgerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const mountedRef = useRef(false);

  const [events, setEvents] = useState<InventoryEventListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [copied, setCopied] = useState(false);

  // Filters — restore from URL params if present
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('eventType') || '');
  const [gratisFilter, setGratisFilter] = useState(searchParams.get('gratis') || '');
  const [startDate, setStartDate] = useState(searchParams.get('start') || defaultStart);
  const [endDate, setEndDate] = useState(searchParams.get('end') || defaultEnd);

  const loadEvents = useCallback(async (newOffset: number) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getInventoryEvents(token, {
        financial: true,
        eventType: eventTypeFilter || undefined,
        gratis: gratisFilter === 'yes' ? true : gratisFilter === 'no' ? false : undefined,
        start: startDate ? `${startDate}T00:00:00Z` : undefined,
        end: endDate ? `${endDate}T23:59:59Z` : undefined,
        limit,
        offset: newOffset,
      });
      setEvents(result.events);
      setTotal(result.total);
      setOffset(newOffset);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial events');
    } finally {
      setIsLoading(false);
    }
  }, [token, eventTypeFilter, gratisFilter, startDate, endDate]);

  useEffect(() => {
    if (token && user) loadEvents(0);
  }, [token, user, loadEvents]);

  // Live URL sync — debounced
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (eventTypeFilter) params.set('eventType', eventTypeFilter);
      if (gratisFilter) params.set('gratis', gratisFilter);
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      const qs = params.toString();
      const target = `${pathname}${qs ? `?${qs}` : ''}`;
      const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      if (target !== current) router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [eventTypeFilter, gratisFilter, startDate, endDate, pathname, router, searchParams]);

  if (!user || !token) {
    return (
      <>
        <Header title="Financial Ledger" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Financial Ledger" />
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

  // Compute summary from loaded page
  const totalCostCents = events.reduce((sum, e) => sum + (e.costOverrideCents ?? e.costSnapshotCents ?? 0), 0);
  const gratisCount = events.filter(e => e.isGratis).length;

  return (
    <>
      <Header title="Financial Ledger" />
      <div className="p-6 max-w-[1400px] mx-auto">
        <button
          className="btn btn-secondary btn-sm mb-4"
          onClick={() => router.push('/admin/inventory')}
        >
          &larr; Back to Inventory
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface-primary rounded-lg border border-border p-4">
            <div className="text-xs text-text-muted">Total Events</div>
            <div className="text-xl font-bold text-text-primary mt-1">{total}</div>
          </div>
          <div className="bg-surface-primary rounded-lg border border-border p-4">
            <div className="text-xs text-text-muted">Page Cost Total</div>
            <div className="text-xl font-bold text-text-primary mt-1">{formatCents(totalCostCents)}</div>
          </div>
          <div className="bg-surface-primary rounded-lg border border-border p-4">
            <div className="text-xs text-text-muted">Gratis (this page)</div>
            <div className="text-xl font-bold text-text-primary mt-1">{gratisCount}</div>
          </div>
          <div className="bg-surface-primary rounded-lg border border-border p-4">
            <div className="text-xs text-text-muted">Showing</div>
            <div className="text-xl font-bold text-text-primary mt-1">{events.length} of {total}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Event Type</label>
            <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="CONSUMED">Consumed</option>
              <option value="IMPLANTED">Implanted</option>
              <option value="WASTED">Wasted</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>Gratis</label>
            <select value={gratisFilter} onChange={(e) => setGratisFilter(e.target.value)}>
              <option value="">All</option>
              <option value="yes">Gratis Only</option>
              <option value="no">Non-Gratis Only</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const params = new URLSearchParams();
              if (eventTypeFilter) params.set('eventType', eventTypeFilter);
              if (gratisFilter) params.set('gratis', gratisFilter);
              if (startDate) params.set('start', startDate);
              if (endDate) params.set('end', endDate);
              const qs = params.toString();
              const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied!' : 'Copy Filters as Link'}
          </button>
        </div>

        {/* Events table */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading financial events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No financial events match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Item</th>
                    <th className="text-right py-3 px-4 font-semibold text-text-secondary">Cost</th>
                    <th className="text-right py-3 px-4 font-semibold text-text-secondary">Override</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Vendor</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-secondary">Gratis</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">By</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => (
                    <tr key={evt.id} className="border-t border-border hover:bg-surface-secondary">
                      <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                        {formatDateTime(evt.occurredAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded bg-surface-tertiary text-xs">
                          {evt.eventType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-primary text-xs font-medium max-w-[200px] truncate">
                        {evt.catalogName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-text-secondary">
                        {formatCents(evt.costSnapshotCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {evt.costOverrideCents != null ? (
                          <span className="text-[var(--color-orange-700)] font-medium"
                            title={evt.costOverrideReason || undefined}
                          >
                            {formatCents(evt.costOverrideCents)}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-secondary max-w-[150px] truncate">
                        {evt.vendorName || '—'}
                        {evt.repName && (
                          <span className="text-text-muted"> ({evt.repName})</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {evt.isGratis ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-green-bg)] text-[var(--color-green-700)]"
                            title={evt.gratisReason || undefined}
                          >
                            Yes
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                        {evt.performedByName || '—'}
                      </td>
                    </tr>
                  ))}
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
