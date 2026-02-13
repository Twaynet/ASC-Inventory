'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getOperationsHealthSummary, type OperationsHealthSummary } from '@/lib/api/operations';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function PrintOperationsHealthPage() {
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasCapability } = useAccessControl();
  const defaults = defaultDateRange();
  const start = searchParams.get('start') || defaults.start;
  const end = searchParams.get('end') || defaults.end;
  const [data, setData] = useState<OperationsHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await getOperationsHealthSummary(token, {
        start: new Date(start + 'T00:00:00Z').toISOString(),
        end: new Date(end + 'T23:59:59Z').toISOString(),
      });
      setData(r);
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
      title="Operations Health Summary"
      facilityName={user?.facilityName}
      dateRange={{ start, end }}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="text-text-muted">Loading...</p>}
      {data && (
        <>
          <PrintSection title="Missing Health">
            <table className="print-table w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-surface-secondary">
                <th className="p-2 text-left border border-border">Metric</th>
                <th className="p-2 text-right border border-border">Value</th>
              </tr></thead>
              <tbody>
                <Row label="Open Missing" value={data.missing.openCount} />
                <Row label="Missing > 7 Days" value={data.missing.over7Days} warn={data.missing.over7Days > 0} />
                <Row label="Missing > 30 Days" value={data.missing.over30Days} alert={data.missing.over30Days > 0} />
                <Row label="Resolution Rate (30d)" value={`${data.missing.resolutionRate30d}%`} warn={data.missing.resolutionRate30d < 70} />
              </tbody>
            </table>
          </PrintSection>

          <PrintSection title="Financial Integrity">
            <table className="print-table w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-surface-secondary">
                <th className="p-2 text-left border border-border">Metric</th>
                <th className="p-2 text-right border border-border">Value</th>
              </tr></thead>
              <tbody>
                <Row label="Cost Overrides (30d)" value={data.financial.overrideCount30d} />
                <Row label="Gratis Items (30d)" value={data.financial.gratisCount30d} />
              </tbody>
            </table>
          </PrintSection>

          <PrintSection title="Device Stability">
            <table className="print-table w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-surface-secondary">
                <th className="p-2 text-left border border-border">Metric</th>
                <th className="p-2 text-right border border-border">Value</th>
              </tr></thead>
              <tbody>
                <Row label="Total Events (7d)" value={data.devices.totalEvents7d} />
                <Row label="Error Events (7d)" value={data.devices.errorEvents7d} warn={data.devices.errorEvents7d > 0} />
                <Row label="Error Rate" value={`${data.devices.errorRate7d}%`} warn={data.devices.errorRate7d > 5} />
              </tbody>
            </table>
          </PrintSection>

          <PrintSection title="Case Throughput">
            <table className="print-table w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-surface-secondary">
                <th className="p-2 text-left border border-border">Metric</th>
                <th className="p-2 text-right border border-border">Value</th>
              </tr></thead>
              <tbody>
                <Row label="Completed (30d)" value={data.cases.completed30d} />
                <Row label="Canceled (30d)" value={data.cases.canceled30d} />
              </tbody>
            </table>
          </PrintSection>

          <PrintSection title="Metric Definitions">
            <ul className="text-xs text-text-muted space-y-1 list-disc pl-4">
              <li><strong>Open Missing</strong> &mdash; items currently marked MISSING</li>
              <li><strong>&gt; 7 / &gt; 30 Days</strong> &mdash; open missing items aged beyond threshold (based on most recent [MISSING] event)</li>
              <li><strong>Resolution Rate</strong> &mdash; found events / missing events in range</li>
              <li><strong>Overrides</strong> &mdash; events with cost override applied</li>
              <li><strong>Gratis</strong> &mdash; events marked as vendor-provided at no cost</li>
              <li><strong>Error Rate</strong> &mdash; device events with processing errors / total device events (7d)</li>
            </ul>
          </PrintSection>
        </>
      )}
    </PrintLayout>
  );
}

function Row({ label, value, warn, alert }: { label: string; value: number | string; warn?: boolean; alert?: boolean }) {
  const cls = alert ? 'text-[var(--color-red)] font-semibold' : warn ? 'text-[var(--color-orange)] font-semibold' : '';
  return (
    <tr>
      <td className="p-2 border border-border">{label}</td>
      <td className={`p-2 border border-border text-right ${cls}`}>{value}</td>
    </tr>
  );
}
