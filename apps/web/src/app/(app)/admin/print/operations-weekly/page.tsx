'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getOperationsHealthSummary, type OperationsHealthSummary } from '@/lib/api/operations';
import {
  getOpenMissingAging,
  getMissingAnalytics,
  getDeviceEvents,
  getInventoryEvents,
  type OpenMissingAgingItem,
  type MissingAnalyticsResponse,
  type DeviceEventListItem,
  type InventoryEventListItem,
} from '@/lib/api/inventory';

const AGING_LIMIT = 25;
const TOP_DRIVERS = 10;
const DEVICE_ERROR_LIMIT = 20;
const FINANCIAL_FETCH_LIMIT = 200;
const FINANCIAL_DISPLAY_LIMIT = 10;

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

function last7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function PrintOperationsWeeklyPage() {
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasCapability } = useAccessControl();
  const defaults = defaultDateRange();
  const start = searchParams.get('start') || defaults.start;
  const end = searchParams.get('end') || defaults.end;

  const [health, setHealth] = useState<OperationsHealthSummary | null>(null);
  const [agingItems, setAgingItems] = useState<OpenMissingAgingItem[]>([]);
  const [byLocation, setByLocation] = useState<MissingAnalyticsResponse | null>(null);
  const [byCatalog, setByCatalog] = useState<MissingAnalyticsResponse | null>(null);
  const [deviceErrors, setDeviceErrors] = useState<DeviceEventListItem[]>([]);
  const [financialEvents, setFinancialEvents] = useState<InventoryEventListItem[]>([]);
  const [finOverrides, setFinOverrides] = useState(0);
  const [finGratis, setFinGratis] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const startISO = new Date(start + 'T00:00:00Z').toISOString();
      const endISO = new Date(end + 'T23:59:59Z').toISOString();
      const dev7 = last7DaysRange();
      const dev7Start = new Date(dev7.start + 'T00:00:00Z').toISOString();
      const dev7End = new Date(dev7.end + 'T23:59:59Z').toISOString();

      const [healthR, agingR, locR, catR, devR, finR] = await Promise.all([
        getOperationsHealthSummary(token, { start: startISO, end: endISO }),
        getOpenMissingAging(token),
        getMissingAnalytics(token, { start: startISO, end: endISO, groupBy: 'location', resolution: 'BOTH' }),
        getMissingAnalytics(token, { start: startISO, end: endISO, groupBy: 'catalog', resolution: 'BOTH' }),
        getDeviceEvents(token, { start: dev7Start, end: dev7End, hasError: true, limit: DEVICE_ERROR_LIMIT }),
        getInventoryEvents(token, { financial: true, start: `${start}T00:00:00Z`, end: `${end}T23:59:59Z`, limit: FINANCIAL_FETCH_LIMIT }),
      ]);

      setHealth(healthR);
      setAgingItems([...agingR.items].sort((a, b) => b.daysMissing - a.daysMissing).slice(0, AGING_LIMIT));
      setByLocation(locR);
      setByCatalog(catR);
      setDeviceErrors(devR.events);
      setFinOverrides(finR.events.filter(e => e.costOverrideCents != null).length);
      setFinGratis(finR.events.filter(e => e.isGratis).length);
      setFinancialEvents(finR.events.slice(0, FINANCIAL_DISPLAY_LIMIT));
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoaded(true);
    }
  }, [token, start, end]);

  useEffect(() => { load(); }, [load]);

  if (!hasCapability('INVENTORY_MANAGE')) {
    return <div className="p-6 alert alert-error">Permission denied.</div>;
  }

  return (
    <PrintLayout
      title="Weekly Operations Packet"
      facilityName={user?.facilityName}
      dateRange={{ start, end }}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!loaded && !error && <p className="text-text-muted">Loading...</p>}

      {loaded && health && (
        <>
          {/* A) Health Summary */}
          <PrintSection title="A. Operations Health Summary">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Missing Health</h3>
                <SummaryTable rows={[
                  { label: 'Open Missing', value: health.missing.openCount },
                  { label: '> 7 Days', value: health.missing.over7Days, warn: health.missing.over7Days > 0 },
                  { label: '> 30 Days', value: health.missing.over30Days, alert: health.missing.over30Days > 0 },
                  { label: 'Resolution Rate', value: `${health.missing.resolutionRate30d}%`, warn: health.missing.resolutionRate30d < 70 },
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Case Throughput</h3>
                <SummaryTable rows={[
                  { label: 'Completed', value: health.cases.completed30d },
                  { label: 'Canceled', value: health.cases.canceled30d },
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Financial Integrity</h3>
                <SummaryTable rows={[
                  { label: 'Overrides', value: health.financial.overrideCount30d },
                  { label: 'Gratis', value: health.financial.gratisCount30d },
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Device Stability (7d)</h3>
                <SummaryTable rows={[
                  { label: 'Total Events', value: health.devices.totalEvents7d },
                  { label: 'Errors', value: health.devices.errorEvents7d, warn: health.devices.errorEvents7d > 0 },
                  { label: 'Error Rate', value: `${health.devices.errorRate7d}%`, warn: health.devices.errorRate7d > 5 },
                ]} />
              </div>
            </div>
          </PrintSection>

          {/* B) Open Missing Aging */}
          <PrintSection title={`B. Open Missing Aging (Top ${AGING_LIMIT})`} pageBreak>
            <p className="text-xs text-text-muted mb-2">Scope: Top {AGING_LIMIT} items sorted by days missing (descending, point-in-time)</p>
            {agingItems.length === 0 ? (
              <p className="text-sm text-text-muted">No missing items.</p>
            ) : (
              <table className="print-table w-full text-sm border-collapse border border-border">
                <thead><tr className="bg-surface-secondary">
                  <th className="p-2 text-left border border-border">Catalog</th>
                  <th className="p-2 text-left border border-border">Lot / Serial</th>
                  <th className="p-2 text-left border border-border">Location</th>
                  <th className="p-2 text-left border border-border">Missing Since</th>
                  <th className="p-2 text-right border border-border">Days</th>
                </tr></thead>
                <tbody>
                  {agingItems.map((item) => (
                    <tr key={item.inventoryItemId}>
                      <td className="p-2 border border-border">{item.catalogName}</td>
                      <td className="p-2 border border-border text-xs">{item.lotNumber || item.serialNumber || '-'}</td>
                      <td className="p-2 border border-border">{item.locationName || '-'}</td>
                      <td className="p-2 border border-border text-xs">{new Date(item.missingSince).toLocaleDateString()}</td>
                      <td className={`p-2 border border-border text-right font-semibold ${item.daysMissing > 30 ? 'text-[var(--color-red)]' : item.daysMissing > 7 ? 'text-[var(--color-orange)]' : ''}`}>
                        {item.daysMissing}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PrintSection>

          {/* C) Missing Drivers */}
          <PrintSection title={`C. Missing Drivers — Top ${TOP_DRIVERS} by Location`} pageBreak>
            {byLocation?.topDrivers && byLocation.topDrivers.length > 0 ? (
              <DriverTable drivers={byLocation.topDrivers.slice(0, TOP_DRIVERS)} />
            ) : (
              <p className="text-sm text-text-muted">No location driver data.</p>
            )}
          </PrintSection>

          <PrintSection title={`C (cont). Missing Drivers — Top ${TOP_DRIVERS} by Catalog`}>
            {byCatalog?.topDrivers && byCatalog.topDrivers.length > 0 ? (
              <DriverTable drivers={byCatalog.topDrivers.slice(0, TOP_DRIVERS)} />
            ) : (
              <p className="text-sm text-text-muted">No catalog driver data.</p>
            )}
          </PrintSection>

          {/* D) Device Errors */}
          <PrintSection title="D. Device Errors (Last 7 Days)" pageBreak>
            <p className="text-xs text-text-muted mb-2">Scope: Up to {DEVICE_ERROR_LIMIT} most recent error events</p>
            {deviceErrors.length === 0 ? (
              <p className="text-sm text-text-muted">No device errors in the last 7 days.</p>
            ) : (
              <table className="print-table w-full text-sm border-collapse border border-border">
                <thead><tr className="bg-surface-secondary">
                  <th className="p-2 text-left border border-border">Occurred</th>
                  <th className="p-2 text-left border border-border">Device</th>
                  <th className="p-2 text-left border border-border">Error</th>
                  <th className="p-2 text-left border border-border">Raw Value</th>
                </tr></thead>
                <tbody>
                  {deviceErrors.map((evt) => (
                    <tr key={evt.id}>
                      <td className="p-2 border border-border text-xs whitespace-nowrap">{new Date(evt.occurredAt).toLocaleString()}</td>
                      <td className="p-2 border border-border text-xs">{evt.deviceName}</td>
                      <td className="p-2 border border-border text-xs text-[var(--color-red)]">{evt.processingError || '-'}</td>
                      <td className="p-2 border border-border text-xs">{evt.rawValue?.slice(0, 60) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PrintSection>

          {/* E) Financial Integrity */}
          <PrintSection title="E. Financial Integrity" pageBreak>
            <p className="text-xs text-text-muted mb-2">Scope: Overrides and gratis events (last 30 days), plus {FINANCIAL_DISPLAY_LIMIT} most recent financial events</p>
            <table className="print-table w-full text-sm border-collapse border border-border max-w-md mb-4">
              <tbody>
                <tr><td className="p-2 border border-border">Cost Overrides</td><td className="p-2 border border-border text-right font-semibold">{finOverrides}</td></tr>
                <tr><td className="p-2 border border-border">Gratis Items</td><td className="p-2 border border-border text-right font-semibold">{finGratis}</td></tr>
              </tbody>
            </table>
            {financialEvents.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-2">Latest Financial Events (up to {FINANCIAL_DISPLAY_LIMIT})</h3>
                <table className="print-table w-full text-sm border-collapse border border-border">
                  <thead><tr className="bg-surface-secondary">
                    <th className="p-2 text-left border border-border">Date</th>
                    <th className="p-2 text-left border border-border">Catalog</th>
                    <th className="p-2 text-left border border-border">Type</th>
                    <th className="p-2 text-right border border-border">Cost</th>
                    <th className="p-2 text-right border border-border">Override</th>
                    <th className="p-2 text-left border border-border">Reason</th>
                    <th className="p-2 text-left border border-border">Gratis</th>
                  </tr></thead>
                  <tbody>
                    {financialEvents.map((evt) => (
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
              </>
            )}
          </PrintSection>
        </>
      )}
    </PrintLayout>
  );
}

function SummaryTable({ rows }: { rows: { label: string; value: number | string; warn?: boolean; alert?: boolean }[] }) {
  return (
    <table className="print-table w-full text-sm border-collapse border border-border">
      <tbody>
        {rows.map((r) => {
          const cls = r.alert ? 'text-[var(--color-red)] font-semibold' : r.warn ? 'text-[var(--color-orange)] font-semibold' : '';
          return (
            <tr key={r.label}>
              <td className="p-2 border border-border">{r.label}</td>
              <td className={`p-2 border border-border text-right ${cls}`}>{r.value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DriverTable({ drivers }: { drivers: { label: string; missingCount: number; foundCount: number }[] }) {
  return (
    <table className="print-table w-full text-sm border-collapse border border-border">
      <thead><tr className="bg-surface-secondary">
        <th className="p-2 text-left border border-border">#</th>
        <th className="p-2 text-left border border-border">Name</th>
        <th className="p-2 text-right border border-border">Missing</th>
        <th className="p-2 text-right border border-border">Found</th>
        <th className="p-2 text-right border border-border">Net</th>
      </tr></thead>
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
