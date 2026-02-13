'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getDeviceEvents,
  getDevices,
  type DeviceEventListItem,
  type Device,
} from '@/lib/api/inventory';

/**
 * Phase 7.8 — Device Event Explorer
 *
 * Read-only paginated list of device events.
 * Uses GET /api/inventory/device-events (CASE_VIEW capability).
 */

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultEnd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DeviceEventsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const mountedRef = useRef(false);

  const [events, setEvents] = useState<DeviceEventListItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Filters — restore from URL params if present
  const [deviceFilter, setDeviceFilter] = useState(searchParams.get('deviceId') || '');
  const [errorFilter, setErrorFilter] = useState(searchParams.get('errorFilter') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [startDate, setStartDate] = useState(searchParams.get('start') || defaultStart);
  const [endDate, setEndDate] = useState(searchParams.get('end') || defaultEnd);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getDevices(token);
      setDevices(result.devices);
    } catch {
      // Non-critical
    }
  }, [token]);

  const loadEvents = useCallback(async (cursor?: string) => {
    if (!token) return;
    if (!cursor) setIsLoading(true);
    try {
      const result = await getDeviceEvents(token, {
        deviceId: deviceFilter || undefined,
        hasError: errorFilter === 'errors' ? true : errorFilter === 'success' ? false : undefined,
        q: searchQuery || undefined,
        start: startDate ? `${startDate}T00:00:00Z` : undefined,
        end: endDate ? `${endDate}T23:59:59Z` : undefined,
        limit: 50,
        cursor,
      });
      if (cursor) {
        setEvents(prev => [...prev, ...result.events]);
      } else {
        setEvents(result.events);
      }
      setNextCursor(result.nextCursor);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load device events');
    } finally {
      setIsLoading(false);
    }
  }, [token, deviceFilter, errorFilter, searchQuery, startDate, endDate]);

  useEffect(() => {
    if (token && user) loadDevices();
  }, [token, user, loadDevices]);

  useEffect(() => {
    if (token && user) loadEvents();
  }, [token, user, loadEvents]);

  // Live URL sync — debounced to avoid rapid replace spam
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (deviceFilter) params.set('deviceId', deviceFilter);
      if (errorFilter) params.set('errorFilter', errorFilter);
      if (searchQuery) params.set('q', searchQuery);
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      const qs = params.toString();
      const target = `${pathname}${qs ? `?${qs}` : ''}`;
      const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      if (target !== current) router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [deviceFilter, errorFilter, searchQuery, startDate, endDate, pathname, router, searchParams]);

  if (!user || !token) {
    return (
      <>
        <Header title="Device Events" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  return (
    <>
      <Header title="Device Events" />
      <div className="p-6 max-w-[1400px] mx-auto">
        <button
          className="btn btn-secondary btn-sm mb-4"
          onClick={() => router.push('/admin/devices')}
        >
          &larr; Back to Device Registry
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <div className="bg-surface-secondary border border-border rounded-lg p-3 mb-4 text-sm text-text-secondary">
          This log shows raw scan events from barcode scanners and other devices.
          Each row represents a physical scan — not an inventory action.
          Use filters to investigate scan failures or track device activity.
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Device</label>
            <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
              <option value="">All Devices</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Status</label>
            <select value={errorFilter} onChange={(e) => setErrorFilter(e.target.value)}>
              <option value="">All</option>
              <option value="errors">Errors Only</option>
              <option value="success">Success Only</option>
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
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Search raw value</label>
            <input
              type="text"
              placeholder="Barcode data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const params = new URLSearchParams();
              if (deviceFilter) params.set('deviceId', deviceFilter);
              if (errorFilter) params.set('errorFilter', errorFilter);
              if (searchQuery) params.set('q', searchQuery);
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
            <div className="text-center py-8 text-text-muted">Loading device events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No device events match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Device</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Raw Value</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-secondary">Processed</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => (
                    <tr key={evt.id} className="border-t border-border hover:bg-surface-secondary">
                      <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                        {formatDateTime(evt.occurredAt)}
                      </td>
                      <td className="py-3 px-4 text-text-primary text-xs font-medium">
                        {evt.deviceName}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs">
                        <span className="inline-block px-2 py-0.5 rounded bg-surface-tertiary">
                          {evt.payloadType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-text-secondary max-w-[300px] truncate">
                        {evt.rawValue}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {evt.processed ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-green-bg)] text-[var(--color-green-700)]">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-tertiary text-text-muted">
                            No
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {evt.processingError ? (
                          <span className="text-[var(--color-red)]">{evt.processingError}</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Load more */}
        {nextCursor && (
          <div className="mt-4 text-center">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadEvents(nextCursor)}
            >
              Load More
            </button>
          </div>
        )}

        <div className="mt-3 text-xs text-text-muted">
          Showing {events.length} events
        </div>
      </div>
    </>
  );
}
