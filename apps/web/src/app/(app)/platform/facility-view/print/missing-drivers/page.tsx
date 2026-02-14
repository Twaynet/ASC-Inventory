'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getMissingAnalytics } from '@/lib/api/platform-facility-view';
import type { MissingAnalyticsResponse } from '@/lib/api/inventory';
import { useFacilityContext } from '../../useFacilityContext';
import { useFacilityName } from '../../useFacilityName';

const TOP_DRIVERS = 10;

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

  const [byLocation, setByLocation] = useState<MissingAnalyticsResponse | null>(null);
  const [byCatalog, setByCatalog] = useState<MissingAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !facilityId) return;
    try {
      const startISO = new Date(start + 'T00:00:00Z').toISOString();
      const endISO = new Date(end + 'T23:59:59Z').toISOString();
      const [loc, cat] = await Promise.all([
        getMissingAnalytics(token, facilityId, { start: startISO, end: endISO, groupBy: 'location', resolution: 'BOTH' }),
        getMissingAnalytics(token, facilityId, { start: startISO, end: endISO, groupBy: 'catalog', resolution: 'BOTH' }),
      ]);
      setByLocation(loc);
      setByCatalog(cat);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [token, facilityId, start, end]);

  useEffect(() => { load(); }, [load]);

  if (!facilityId) {
    return <div className="p-6 text-text-muted">Select a facility to generate this report.</div>;
  }

  return (
    <PrintLayout
      title="Missing Drivers"
      facilityName={facilityName ?? undefined}
      dateRange={{ start, end }}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {(!byLocation || !byCatalog) && !error && <p className="text-text-muted">Loading...</p>}

      {byLocation && (
        <PrintSection title="Summary">
          <table className="print-table w-full text-sm border-collapse border border-border mb-4">
            <thead><tr className="bg-surface-secondary">
              <th className="p-2 text-left border border-border">Metric</th>
              <th className="p-2 text-right border border-border">Value</th>
            </tr></thead>
            <tbody>
              <tr><td className="p-2 border border-border">Total Missing Events</td><td className="p-2 border border-border text-right">{byLocation.summary.totalMissing}</td></tr>
              <tr><td className="p-2 border border-border">Total Found Events</td><td className="p-2 border border-border text-right">{byLocation.summary.totalFound}</td></tr>
              <tr><td className="p-2 border border-border">Net Open</td><td className="p-2 border border-border text-right font-semibold">{byLocation.summary.netOpen}</td></tr>
              <tr><td className="p-2 border border-border">Resolution Rate</td><td className="p-2 border border-border text-right">{byLocation.summary.resolutionRate != null ? `${byLocation.summary.resolutionRate}%` : 'N/A'}</td></tr>
            </tbody>
          </table>
        </PrintSection>
      )}

      {byLocation?.topDrivers && (
        <PrintSection title="Top Drivers by Location">
          <p className="text-xs text-text-muted mb-2">Scope: Top {TOP_DRIVERS} locations driving missing events</p>
          <DriverTable drivers={byLocation.topDrivers.slice(0, TOP_DRIVERS)} />
        </PrintSection>
      )}

      {byCatalog?.topDrivers && (
        <PrintSection title="Top Drivers by Catalog" pageBreak>
          <p className="text-xs text-text-muted mb-2">Scope: Top {TOP_DRIVERS} catalog items driving missing events</p>
          <DriverTable drivers={byCatalog.topDrivers.slice(0, TOP_DRIVERS)} />
        </PrintSection>
      )}
    </PrintLayout>
  );
}

function DriverTable({ drivers }: { drivers: { label: string; missingCount: number; foundCount: number }[] }) {
  return (
    <table className="print-table w-full text-sm border-collapse border border-border">
      <thead>
        <tr className="bg-surface-secondary">
          <th className="p-2 text-left border border-border">#</th>
          <th className="p-2 text-left border border-border">Name</th>
          <th className="p-2 text-right border border-border">Missing</th>
          <th className="p-2 text-right border border-border">Found</th>
          <th className="p-2 text-right border border-border">Net</th>
        </tr>
      </thead>
      <tbody>
        {drivers.map((d, i) => (
          <tr key={d.label}>
            <td className="p-2 border border-border">{i + 1}</td>
            <td className="p-2 border border-border">{d.label}</td>
            <td className="p-2 border border-border text-right">{d.missingCount}</td>
            <td className="p-2 border border-border text-right">{d.foundCount}</td>
            <td className="p-2 border border-border text-right font-semibold">{d.missingCount - d.foundCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}><Content /></Suspense>;
}
