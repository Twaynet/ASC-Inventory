'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getInventoryEvents } from '@/lib/api/platform-facility-view';
import type { InventoryEventListItem } from '@/lib/api/inventory';
import { useFacilityContext } from '../../useFacilityContext';
import { useFacilityName } from '../../useFacilityName';

const FETCH_LIMIT = 200;
const DISPLAY_LIMIT = 50;

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

function Content() {
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { facilityId } = useFacilityContext();
  const facilityName = useFacilityName(facilityId);
  const defaults = defaultDateRange();
  const start = searchParams.get('start') || defaults.start;
  const end = searchParams.get('end') || defaults.end;

  const [events, setEvents] = useState<InventoryEventListItem[]>([]);
  const [overrideCount, setOverrideCount] = useState(0);
  const [gratisCount, setGratisCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token || !facilityId) return;
    try {
      const startISO = `${start}T00:00:00Z`;
      const endISO = `${end}T23:59:59Z`;
      const r = await getInventoryEvents(token, facilityId, {
        financial: true,
        start: startISO,
        end: endISO,
        limit: FETCH_LIMIT,
      });
      const overrides = r.events.filter(e => e.costOverrideCents != null);
      const gratis = r.events.filter(e => e.isGratis);
      setOverrideCount(overrides.length);
      setGratisCount(gratis.length);
      setEvents(r.events.slice(0, DISPLAY_LIMIT));
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoaded(true);
    }
  }, [token, facilityId, start, end]);

  useEffect(() => { load(); }, [load]);

  if (!facilityId) {
    return <div className="p-6 text-text-muted">Select a facility to generate this report.</div>;
  }

  return (
    <PrintLayout
      title="Financial Integrity"
      facilityName={facilityName ?? undefined}
      dateRange={{ start, end }}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!loaded && !error && <p className="text-text-muted">Loading...</p>}
      {loaded && (
        <>
          <PrintSection title="Summary">
            <table className="print-table w-full text-sm border-collapse border border-border max-w-md">
              <tbody>
                <tr><td className="p-2 border border-border">Cost Overrides</td><td className="p-2 border border-border text-right font-semibold">{overrideCount}</td></tr>
                <tr><td className="p-2 border border-border">Gratis Items</td><td className="p-2 border border-border text-right font-semibold">{gratisCount}</td></tr>
              </tbody>
            </table>
          </PrintSection>

          {events.length > 0 && (
            <PrintSection title="Recent Financial Events">
              <p className="text-xs text-text-muted mb-2">Scope: Last {DISPLAY_LIMIT} financial events (last 30 days)</p>
              <table className="print-table w-full text-sm border-collapse border border-border">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="p-2 text-left border border-border">Date</th>
                    <th className="p-2 text-left border border-border">Catalog</th>
                    <th className="p-2 text-left border border-border">Type</th>
                    <th className="p-2 text-right border border-border">Cost</th>
                    <th className="p-2 text-right border border-border">Override</th>
                    <th className="p-2 text-left border border-border">Reason</th>
                    <th className="p-2 text-left border border-border">Gratis</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => (
                    <tr key={evt.id}>
                      <td className="p-2 border border-border text-xs whitespace-nowrap">{new Date(evt.occurredAt).toLocaleDateString()}</td>
                      <td className="p-2 border border-border text-xs">{evt.catalogName}</td>
                      <td className="p-2 border border-border text-xs">{evt.eventType}</td>
                      <td className="p-2 border border-border text-right text-xs">{evt.costSnapshotCents != null ? `$${(evt.costSnapshotCents / 100).toFixed(2)}` : '-'}</td>
                      <td className="p-2 border border-border text-right text-xs">{evt.costOverrideCents != null ? `$${(evt.costOverrideCents / 100).toFixed(2)}` : '-'}</td>
                      <td className="p-2 border border-border text-xs">{evt.costOverrideReason || evt.gratisReason || '-'}</td>
                      <td className="p-2 border border-border text-xs">{evt.isGratis ? 'Yes' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PrintSection>
          )}
        </>
      )}
    </PrintLayout>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}><Content /></Suspense>;
}
