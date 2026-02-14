'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Alert } from '@/app/components/Alert';
import {
  getOpenMissingAgingTrend,
  getMissingItemTimeline,
  resolveMissingItem,
  type OpenMissingAgingTrendResponse,
  type MissingItemTimelineResponse,
  type CurrentlyOpenItem,
  type ResolutionType,
} from '@/lib/api/admin-onboarding';

// ─── Resolution type options ──────────────────────────────────

const RESOLUTION_TYPES: { value: ResolutionType; label: string }[] = [
  { value: 'LOCATED', label: 'Located' },
  { value: 'VENDOR_REPLACEMENT', label: 'Vendor Replacement' },
  { value: 'CASE_RESCHEDULED', label: 'Case Rescheduled' },
  { value: 'INVENTORY_ERROR_CORRECTED', label: 'Inventory Error Corrected' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Page ─────────────────────────────────────────────────────

export default function OpenMissingAgingPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<OpenMissingAgingTrendResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Timeline drawer state
  const [selectedItem, setSelectedItem] = useState<CurrentlyOpenItem | null>(null);
  const [timeline, setTimeline] = useState<MissingItemTimelineResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Resolve modal state
  const [resolveTarget, setResolveTarget] = useState<CurrentlyOpenItem | null>(null);
  const [resolutionType, setResolutionType] = useState<ResolutionType>('LOCATED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveSuccess, setResolveSuccess] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  const loadTrend = useCallback(async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      const result = await getOpenMissingAgingTrend(token);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trend data');
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  useEffect(() => { loadTrend(); }, [loadTrend]);

  // Open timeline drawer
  const openTimeline = async (item: CurrentlyOpenItem) => {
    if (!token) return;
    setSelectedItem(item);
    setTimeline(null);
    setLoadingTimeline(true);
    try {
      const result = await getMissingItemTimeline(token, item.inventoryItemId);
      setTimeline(result);
    } catch {
      // Show inline error in drawer
      setTimeline(null);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const closeTimeline = () => {
    setSelectedItem(null);
    setTimeline(null);
  };

  // Resolve
  const openResolveModal = (item: CurrentlyOpenItem) => {
    setResolveTarget(item);
    setResolutionType('LOCATED');
    setResolutionNotes('');
  };

  const closeResolveModal = () => {
    setResolveTarget(null);
  };

  const handleResolve = async () => {
    if (!token || !resolveTarget) return;
    setResolving(true);
    try {
      await resolveMissingItem(token, resolveTarget.inventoryItemId, {
        resolutionType,
        resolutionNotes: resolutionNotes.trim() || undefined,
      });
      setResolveSuccess('Resolved');
      closeResolveModal();
      closeTimeline();
      // Refresh data silently
      await loadTrend();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve item');
    } finally {
      setResolving(false);
    }
  };

  if (isLoading || !user) {
    return <div className="loading"><p>Loading...</p></div>;
  }

  // Check admin access
  const userRoles = user.roles || [user.role];
  if (!userRoles.includes('ADMIN')) {
    return (
      <>
        <Header title="Open Missing Aging" />
        <main className="container-full" style={{ padding: '1.5rem' }}>
          <div className="alert alert-error">Access denied. Admin role required.</div>
        </main>
      </>
    );
  }

  const maxOpenCount = data?.trend.length
    ? Math.max(...data.trend.map(d => d.openCount), 1)
    : 1;

  return (
    <>
      <Header title="Open Missing Aging" />

      <main className="container-full" style={{ padding: '1.5rem' }}>
        {error && <Alert message={error} variant="error" onDismiss={() => setError('')} />}
        {resolveSuccess && (
          <Alert message={resolveSuccess} variant="success" onDismiss={() => setResolveSuccess('')} autoDismiss={3000} />
        )}

        {loadingData ? (
          <div className="text-text-muted text-sm">Loading trend data...</div>
        ) : data ? (
          <>
            {/* ── 30-Day Trend ── */}
            <section className="bg-surface-primary border border-border rounded-lg p-5 mb-6">
              <h2 className="text-lg font-semibold text-text-primary mt-0 mb-4">
                Open Missing Items — 30-Day Trend
              </h2>

              {/* CSS Bar Chart */}
              <div className="flex items-end gap-px" style={{ height: 160 }}>
                {data.trend.map((d) => {
                  const heightPct = maxOpenCount > 0 ? (d.openCount / maxOpenCount) * 100 : 0;
                  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center justify-end"
                      style={{ height: '100%' }}
                      title={`${dateLabel}: ${d.openCount} open`}
                    >
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max(heightPct, 2)}%`,
                          minHeight: d.openCount > 0 ? 4 : 1,
                          backgroundColor: d.openCount > 0 ? 'var(--color-orange)' : 'var(--border-default)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X-axis labels (every ~7 days) */}
              <div className="flex justify-between mt-1">
                {data.trend
                  .filter((_, i) => i % 7 === 0 || i === data.trend.length - 1)
                  .map((d) => (
                    <span key={d.date} className="text-[10px] text-text-muted">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  ))}
              </div>

              {/* Annotations */}
              {data.annotations.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Annotations
                  </h3>
                  <ul className="list-none m-0 p-0 space-y-1">
                    {data.annotations.map((a, i) => (
                      <li key={i} className="text-xs text-text-secondary">
                        <span className="text-text-muted">
                          {new Date(a.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        {' — '}
                        {a.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* ── Currently Open List ── */}
            <section className="bg-surface-primary border border-border rounded-lg p-5">
              <h2 className="text-lg font-semibold text-text-primary mt-0 mb-4">
                Currently Open ({data.currentlyOpen.length})
              </h2>

              {data.currentlyOpen.length === 0 ? (
                <p className="text-sm text-text-muted">No open missing items.</p>
              ) : (
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Location</th>
                      <th>Days Open</th>
                      <th>Last Touched By</th>
                      <th>Last Touched</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.currentlyOpen.map((item) => (
                      <tr key={item.inventoryItemId}>
                        <td>
                          <button
                            className="text-[var(--color-accent)] underline bg-transparent border-none cursor-pointer p-0 text-sm text-left"
                            onClick={() => openTimeline(item)}
                          >
                            {item.catalogName}
                          </button>
                        </td>
                        <td className="text-text-secondary text-sm">{item.locationName || '—'}</td>
                        <td>
                          <span className={`font-semibold text-sm ${item.daysOpen >= 7 ? 'text-[var(--color-red)]' : 'text-text-primary'}`}>
                            {item.daysOpen}d
                          </span>
                        </td>
                        <td className="text-text-secondary text-sm">{item.lastTouchedBy || '—'}</td>
                        <td className="text-text-muted text-xs">
                          {new Date(item.lastTouchedAt).toLocaleDateString()}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openResolveModal(item)}
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : null}
      </main>

      {/* ── Timeline Drawer ── */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[900]"
          onClick={closeTimeline}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-surface-primary border-l border-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary m-0">
                  {selectedItem.catalogName}
                </h2>
                <button
                  className="bg-transparent border-none cursor-pointer text-text-muted text-lg p-1"
                  onClick={closeTimeline}
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>

              {timeline?.item && (
                <div className="text-sm text-text-secondary mb-4 space-y-1">
                  {timeline.item.locationName && <div>Location: {timeline.item.locationName}</div>}
                  {timeline.item.lotNumber && <div>Lot: {timeline.item.lotNumber}</div>}
                  {timeline.item.serialNumber && <div>Serial: {timeline.item.serialNumber}</div>}
                  <div>
                    Status: {timeline.isOpen ? (
                      <span className="text-[var(--color-orange)] font-semibold">
                        Missing ({timeline.daysOpen}d)
                      </span>
                    ) : (
                      <span className="text-[var(--color-green)] font-semibold">Resolved</span>
                    )}
                  </div>
                </div>
              )}

              {/* Resolve button in drawer */}
              {timeline?.isOpen && (
                <button
                  className="btn btn-primary btn-sm mb-4"
                  onClick={() => openResolveModal(selectedItem)}
                >
                  Mark as Resolved
                </button>
              )}

              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Timeline
              </h3>

              {loadingTimeline ? (
                <div className="text-text-muted text-sm">Loading timeline...</div>
              ) : timeline ? (
                <div className="space-y-3">
                  {timeline.timeline.map((evt) => (
                    <div
                      key={evt.eventId}
                      className="border-l-2 border-border pl-3 py-1"
                    >
                      <div className="text-xs text-text-muted">
                        {new Date(evt.occurredAt).toLocaleString()}
                      </div>
                      <div className="text-sm text-text-primary font-medium">
                        {evt.eventType}
                      </div>
                      {evt.notes && (
                        <div className="text-xs text-text-secondary mt-0.5">{evt.notes}</div>
                      )}
                      {evt.performedByName && (
                        <div className="text-xs text-text-muted mt-0.5">
                          by {evt.performedByName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-text-muted">Failed to load timeline.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Modal ── */}
      {resolveTarget && (
        <div className="modal-overlay" onClick={closeResolveModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2 className="text-lg font-semibold text-text-primary mt-0 mb-1">
              Resolve Missing Item
            </h2>
            <p className="text-sm text-text-secondary mt-0 mb-4">
              {resolveTarget.catalogName}
            </p>

            <div className="form-group">
              <label htmlFor="resolutionType">Resolution Type</label>
              <select
                id="resolutionType"
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value as ResolutionType)}
              >
                {RESOLUTION_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>{rt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="resolutionNotes">Notes (optional)</label>
              <textarea
                id="resolutionNotes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="Brief context..."
              />
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button
                className="btn btn-secondary btn-sm"
                onClick={closeResolveModal}
                disabled={resolving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleResolve}
                disabled={resolving}
              >
                {resolving ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
