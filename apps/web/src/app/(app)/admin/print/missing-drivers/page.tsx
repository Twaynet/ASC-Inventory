'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getMissingAnalytics, type MissingAnalyticsResponse } from '@/lib/api/inventory';

const TOP_DRIVERS = 10;

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function PrintMissingDriversPage() {
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasCapability } = useAccessControl();
  const defaults = defaultDateRange();
  const start = searchParams.get('start') || defaults.start;
  const end = searchParams.get('end') || defaults.end;

  const [byLocation, setByLocation] = useState<MissingAnalyticsResponse | null>(null);
  const [byCatalog, setByCatalog] = useState<MissingAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const startISO = new Date(start + 'T00:00:00Z').toISOString();
      const endISO = new Date(end + 'T23:59:59Z').toISOString();
      const [loc, cat] = await Promise.all([
        getMissingAnalytics(token, { start: startISO, end: endISO, groupBy: 'location', resolution: 'BOTH' }),
        getMissingAnalytics(token, { start: startISO, end: endISO, groupBy: 'catalog', resolution: 'BOTH' }),
      ]);
      setByLocation(loc);
      setByCatalog(cat);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [token, start, end]);

  useEffect(() => { load(); }, [load]);

  if (!hasCapability('INVENTORY_MANAGE')) {
    return <div className="p-6 alert alert-error">Permission denied.</div>;
  }

  return (
    <PrintLayout
      title="Missing Drivers"
      facilityName={user?.facilityName}
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
