'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getDeviceEvents, type DeviceEventListItem } from '@/lib/api/inventory';

const MAX_ERRORS = 50;

function last7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function PrintDeviceErrorsPage() {
  const { user, token } = useAuth();
  const { hasCapability } = useAccessControl();
  const range = last7DaysRange();
  const [errors, setErrors] = useState<DeviceEventListItem[]>([]);
  const [totalAll, setTotalAll] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const startISO = new Date(range.start + 'T00:00:00Z').toISOString();
      const endISO = new Date(range.end + 'T23:59:59Z').toISOString();
      const [allEvents, errorEvents] = await Promise.all([
        getDeviceEvents(token, { start: startISO, end: endISO, limit: 1 }),
        getDeviceEvents(token, { start: startISO, end: endISO, hasError: true, limit: MAX_ERRORS }),
      ]);
      setTotalAll(allEvents.events.length + (allEvents.nextCursor ? 999 : 0));
      setTotalErrors(errorEvents.events.length);
      setErrors(errorEvents.events);
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoaded(true);
    }
  }, [token, range.start, range.end]);

  useEffect(() => { load(); }, [load]);

  if (!hasCapability('INVENTORY_MANAGE')) {
    return <div className="p-6 alert alert-error">Permission denied.</div>;
  }

  return (
    <PrintLayout
      title="Device Errors"
      facilityName={user?.facilityName}
      dateRange={{ start: range.start, end: range.end }}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!loaded && !error && <p className="text-text-muted">Loading...</p>}
      {loaded && (
        <>
          <PrintSection title="Summary">
            <table className="print-table w-full text-sm border-collapse border border-border max-w-md">
              <tbody>
                <tr><td className="p-2 border border-border">Error Events (7d)</td><td className="p-2 border border-border text-right font-semibold">{totalErrors}</td></tr>
                {totalAll > 0 && <tr><td className="p-2 border border-border">Note</td><td className="p-2 border border-border text-right text-xs text-text-muted">Showing up to {MAX_ERRORS} most recent errors</td></tr>}
              </tbody>
            </table>
          </PrintSection>

          {errors.length > 0 && (
            <PrintSection title="Recent Error Events">
              <p className="text-xs text-text-muted mb-2">Scope: Last {MAX_ERRORS} error events (last 7 days)</p>
              <table className="print-table w-full text-sm border-collapse border border-border">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="p-2 text-left border border-border">Occurred</th>
                    <th className="p-2 text-left border border-border">Device</th>
                    <th className="p-2 text-left border border-border">Type</th>
                    <th className="p-2 text-left border border-border">Error</th>
                    <th className="p-2 text-left border border-border">Raw Value</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((evt) => (
                    <tr key={evt.id}>
                      <td className="p-2 border border-border text-xs whitespace-nowrap">{new Date(evt.occurredAt).toLocaleString()}</td>
                      <td className="p-2 border border-border text-xs">{evt.deviceName}</td>
                      <td className="p-2 border border-border text-xs">{evt.deviceType}</td>
                      <td className="p-2 border border-border text-xs text-[var(--color-red)]">{evt.processingError || '-'}</td>
                      <td className="p-2 border border-border text-xs max-w-[200px] truncate">{evt.rawValue?.slice(0, 60) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PrintSection>
          )}

          {errors.length === 0 && !error && (
            <PrintSection>
              <p className="text-text-muted text-sm">No device errors in the last 7 days.</p>
            </PrintSection>
          )}
        </>
      )}
    </PrintLayout>
  );
}
