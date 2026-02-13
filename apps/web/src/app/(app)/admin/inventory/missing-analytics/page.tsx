'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getMissingAnalytics,
  type MissingAnalyticsGroupBy,
  type MissingAnalyticsResolution,
  type MissingAnalyticsGroup,
  type MissingAnalyticsResponse,
} from '@/lib/api/inventory';

/**
 * Phase 8 — Missing Inventory Analytics
 *
 * Trend analysis over structured MISSING/FOUND inventory events.
 * Grouped by day, location, catalog, surgeon, or staff.
 */

const GROUP_BY_OPTIONS: { value: MissingAnalyticsGroupBy; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'location', label: 'Location' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'surgeon', label: 'Surgeon' },
  { value: 'staff', label: 'Staff' },
];

const RESOLUTION_OPTIONS: { value: MissingAnalyticsResolution; label: string }[] = [
  { value: 'BOTH', label: 'Both' },
  { value: 'MISSING', label: 'Missing Only' },
  { value: 'FOUND', label: 'Found Only' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/** Simple inline SVG bar for table rows */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  if (max === 0) return null;
  const width = Math.max((value / max) * 100, 0);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-xs tabular-nums">{value}</span>
      <div className="flex-1 h-4 bg-surface-secondary rounded overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/** Simple SVG line chart for day grouping */
function DayChart({ groups }: { groups: MissingAnalyticsGroup[] }) {
  if (groups.length === 0) return null;

  const maxVal = Math.max(...groups.flatMap(g => [g.missingCount, g.foundCount]), 1);
  const w = 700;
  const h = 220;
  const padX = 40;
  const padY = 20;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;

  const xStep = groups.length > 1 ? chartW / (groups.length - 1) : chartW;

  function toX(i: number) {
    return padX + (groups.length > 1 ? i * xStep : chartW / 2);
  }
  function toY(val: number) {
    return padY + chartH - (val / maxVal) * chartH;
  }

  const missingPath = groups
    .map((g, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(g.missingCount)}`)
    .join(' ');
  const foundPath = groups
    .map((g, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(g.foundCount)}`)
    .join(' ');

  // Y-axis ticks
  const ticks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[700px] h-auto">
        {/* Grid lines */}
        {ticks.map(t => (
          <g key={t}>
            <line
              x1={padX} y1={toY(t)} x2={w - padX} y2={toY(t)}
              stroke="var(--border-default)" strokeWidth="1" strokeDasharray="4,4"
            />
            <text x={padX - 6} y={toY(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
              {t}
            </text>
          </g>
        ))}

        {/* Missing line */}
        <path d={missingPath} fill="none" stroke="var(--color-red)" strokeWidth="2" />
        {groups.map((g, i) => (
          <circle key={`m-${i}`} cx={toX(i)} cy={toY(g.missingCount)} r="3" fill="var(--color-red)" />
        ))}

        {/* Found line */}
        <path d={foundPath} fill="none" stroke="var(--color-green)" strokeWidth="2" />
        {groups.map((g, i) => (
          <circle key={`f-${i}`} cx={toX(i)} cy={toY(g.foundCount)} r="3" fill="var(--color-green)" />
        ))}

        {/* X-axis labels (sample a subset if too many) */}
        {groups.map((g, i) => {
          const showEvery = Math.max(1, Math.ceil(groups.length / 12));
          if (i % showEvery !== 0 && i !== groups.length - 1) return null;
          return (
            <text key={`x-${i}`} x={toX(i)} y={h - 2} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
              {formatDate(g.key)}
            </text>
          );
        })}

        {/* Legend */}
        <circle cx={w - 140} cy={12} r="4" fill="var(--color-red)" />
        <text x={w - 132} y={16} fontSize="10" fill="var(--text-secondary)">Missing</text>
        <circle cx={w - 70} cy={12} r="4" fill="var(--color-green)" />
        <text x={w - 62} y={16} fontSize="10" fill="var(--text-secondary)">Found</text>
      </svg>
    </div>
  );
}

export default function MissingAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { hasRole } = useAccessControl();

  // Parse URL params with defaults
  const defaults = defaultDateRange();
  const urlStart = searchParams.get('start') || defaults.start;
  const urlEnd = searchParams.get('end') || defaults.end;
  const urlGroupBy = (searchParams.get('groupBy') as MissingAnalyticsGroupBy) || 'day';
  const urlResolution = (searchParams.get('resolution') as MissingAnalyticsResolution) || 'BOTH';

  const [start, setStart] = useState(urlStart);
  const [end, setEnd] = useState(urlEnd);
  const [groupBy, setGroupBy] = useState<MissingAnalyticsGroupBy>(urlGroupBy);
  const [resolution, setResolution] = useState<MissingAnalyticsResolution>(urlResolution);
  const [data, setData] = useState<MissingAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync URL params
  const updateUrl = useCallback((s: string, e: string, g: MissingAnalyticsGroupBy, r: MissingAnalyticsResolution) => {
    const params = new URLSearchParams();
    params.set('start', s);
    params.set('end', e);
    params.set('groupBy', g);
    params.set('resolution', r);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getMissingAnalytics(token, {
        start: new Date(start + 'T00:00:00Z').toISOString(),
        end: new Date(end + 'T23:59:59Z').toISOString(),
        groupBy,
        resolution,
      });
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [token, start, end, groupBy, resolution]);

  // Load data on mount and when params change
  useEffect(() => {
    loadData();
    updateUrl(start, end, groupBy, resolution);
  }, [loadData, updateUrl, start, end, groupBy, resolution]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const drillDown = useCallback((g: MissingAnalyticsGroup) => {
    const params = new URLSearchParams();
    params.set('start', new Date(start + 'T00:00:00Z').toISOString());
    params.set('end', new Date(end + 'T23:59:59Z').toISOString());
    params.set('groupBy', groupBy);
    params.set('resolution', resolution);
    if (groupBy === 'day') {
      params.set('date', g.key);
    } else {
      params.set('groupKey', g.key);
    }
    router.push(`/admin/inventory/missing-events?${params.toString()}`);
  }, [router, start, end, groupBy, resolution]);

  // Compute max for bar charts
  const maxCount = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.groups.flatMap(g => [g.missingCount, g.foundCount]), 1);
  }, [data]);

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Missing Analytics" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Missing Inventory Analytics" />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Filters */}
        <div className="bg-surface-primary rounded-lg border border-border p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Group By</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as MissingAnalyticsGroupBy)}>
                {GROUP_BY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Resolution</label>
              <select value={resolution} onChange={e => setResolution(e.target.value as MissingAnalyticsResolution)}>
                {RESOLUTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={copyLink}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading && (
          <div className="text-center py-12 text-text-muted">Loading analytics...</div>
        )}

        {data && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Total Missing</div>
                <div className="text-2xl font-bold text-[var(--color-red)]">{data.summary.totalMissing}</div>
              </div>
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Total Found</div>
                <div className="text-2xl font-bold text-[var(--color-green)]">{data.summary.totalFound}</div>
              </div>
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Net Open</div>
                <div className="text-2xl font-bold text-text-primary">{data.summary.netOpen}</div>
              </div>
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Resolution Rate</div>
                <div className="text-2xl font-bold text-accent">
                  {data.summary.resolutionRate !== null
                    ? `${Math.round(data.summary.resolutionRate * 100)}%`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Top Drivers */}
            {data.topDrivers && data.topDrivers.length > 0 && (
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Top 3 Drivers</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {data.topDrivers.map((d, i) => (
                    <div key={d.key} className="flex items-center gap-2">
                      <span className="text-lg font-bold text-text-muted w-6">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{d.label}</div>
                        <div className="text-xs text-text-muted">
                          {d.missingCount} missing / {d.foundCount} found
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chart (day only) */}
            {groupBy === 'day' && data.groups.length > 0 && (
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Trend</h3>
                <DayChart groups={data.groups} />
              </div>
            )}

            {/* Data Table */}
            <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="text-left p-3 font-medium text-text-secondary">
                        {groupBy === 'day' ? 'Date' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
                      </th>
                      <th className="text-left p-3 font-medium text-text-secondary w-[35%]">Missing</th>
                      <th className="text-left p-3 font-medium text-text-secondary w-[35%]">Found</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-text-muted">
                          No events found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      data.groups.map(g => (
                        <tr
                          key={g.key}
                          className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors cursor-pointer"
                          onClick={() => drillDown(g)}
                          title="Click to view events"
                        >
                          <td className="p-3 text-text-primary font-medium">
                            <span className="underline decoration-dotted underline-offset-2">
                              {groupBy === 'day' ? formatDate(g.key) : g.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <Bar value={g.missingCount} max={maxCount} color="var(--color-red)" />
                          </td>
                          <td className="p-3">
                            <Bar value={g.foundCount} max={maxCount} color="var(--color-green)" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals row */}
            {data.groups.length > 0 && (
              <div className="text-xs text-text-muted text-right">
                {data.groups.length} group{data.groups.length !== 1 ? 's' : ''} &middot;{' '}
                {data.summary.totalMissing} missing / {data.summary.totalFound} found
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
