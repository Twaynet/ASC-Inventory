'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCalendarSummary,
  type CalendarDaySummary,
} from '@/lib/api/readiness';

/**
 * Phase 7.12 — Readiness Calendar Summary
 *
 * Day-grid list showing case counts by readiness risk state per date.
 * Uses GET /api/readiness/calendar-summary with granularity=day.
 */

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function riskBar(green: number, orange: number, red: number, total: number) {
  if (total === 0) return null;
  const gPct = (green / total) * 100;
  const oPct = (orange / total) * 100;
  const rPct = (red / total) * 100;
  return (
    <div className="flex h-3 rounded overflow-hidden w-full min-w-[100px]">
      {gPct > 0 && <div className="bg-[var(--color-green)]" style={{ width: `${gPct}%` }} />}
      {oPct > 0 && <div className="bg-[var(--color-orange)]" style={{ width: `${oPct}%` }} />}
      {rPct > 0 && <div className="bg-[var(--color-red)]" style={{ width: `${rPct}%` }} />}
    </div>
  );
}

function defaultStartDate(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 13);
  return d.toISOString().slice(0, 10);
}

export default function ReadinessCalendarSummaryPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [days, setDays] = useState<CalendarDaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getCalendarSummary(token, startDate, endDate, 'day');
      setDays(result.days || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar summary');
    } finally {
      setIsLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  if (!user || !token) {
    return (
      <>
        <Header title="Readiness Calendar" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!hasRole('ADMIN') && !hasRole('SCHEDULER')) {
    return (
      <>
        <Header title="Readiness Calendar" />
        <div className="p-6">
          <div className="alert alert-error">
            Access denied. This page requires Admin or Scheduler role.
          </div>
        </div>
      </>
    );
  }

  // Totals
  const totalCases = days.reduce((s, d) => s + d.caseCount, 0);
  const totalGreen = days.reduce((s, d) => s + d.greenCount, 0);
  const totalOrange = days.reduce((s, d) => s + d.orangeCount, 0);
  const totalRed = days.reduce((s, d) => s + d.redCount, 0);

  return (
    <>
      <Header title="Readiness Calendar" />
      <div className="p-6 max-w-[1200px] mx-auto">
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Summary cards */}
        {!isLoading && days.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">{totalCases}</div>
              <div className="text-xs text-text-muted">Total Cases</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-green)]">{totalGreen}</div>
              <div className="text-xs text-text-muted">Green</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-orange)]">{totalOrange}</div>
              <div className="text-xs text-text-muted">Orange</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-red)]">{totalRed}</div>
              <div className="text-xs text-text-muted">Red</div>
            </div>
          </div>
        )}

        {/* Day grid */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading calendar data...</div>
          ) : days.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No scheduled cases in the selected date range.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="text-left py-3 px-4 font-semibold text-text-secondary">Date</th>
                  <th className="text-center py-3 px-4 font-semibold text-text-secondary">Cases</th>
                  <th className="text-center py-3 px-4 font-semibold text-[var(--color-green)]">Green</th>
                  <th className="text-center py-3 px-4 font-semibold text-[var(--color-orange)]">Orange</th>
                  <th className="text-center py-3 px-4 font-semibold text-[var(--color-red)]">Red</th>
                  <th className="py-3 px-4 font-semibold text-text-secondary" style={{ minWidth: 140 }}>Risk Distribution</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date} className="border-t border-border hover:bg-surface-secondary">
                    <td className="py-3 px-4 font-medium text-text-primary">
                      {formatDate(day.date)}
                    </td>
                    <td className="py-3 px-4 text-center text-text-primary font-medium">
                      {day.caseCount}
                    </td>
                    <td className="py-3 px-4 text-center text-[var(--color-green)] font-medium">
                      {day.greenCount}
                    </td>
                    <td className="py-3 px-4 text-center text-[var(--color-orange)] font-medium">
                      {day.orangeCount}
                    </td>
                    <td className="py-3 px-4 text-center text-[var(--color-red)] font-medium">
                      {day.redCount}
                    </td>
                    <td className="py-3 px-4">
                      {riskBar(day.greenCount, day.orangeCount, day.redCount, day.caseCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
