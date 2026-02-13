'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getAuthAuditLog,
  getFacilities,
  type AuthAuditLogEntry,
  type AuthEventType,
  type Facility,
} from '@/lib/api/platform';

/**
 * Phase 7.10 — Auth Audit Dashboard
 *
 * Dedicated authentication audit page with summary cards and filtering.
 * Platform layout guards PLATFORM_ADMIN role.
 */

function formatTime(ts: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

const EVENT_BADGE: Record<string, { bg: string; label: string }> = {
  LOGIN_SUCCESS: { bg: 'bg-[var(--color-green)]', label: 'Login OK' },
  LOGIN_FAILED:  { bg: 'bg-[var(--color-red)]',   label: 'Login Failed' },
  LOGOUT:        { bg: 'bg-[var(--color-orange)]', label: 'Logout' },
};

export default function AuthAuditPage() {
  const { user, token } = useAuth();

  const [entries, setEntries] = useState<AuthAuditLogEntry[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [facilityFilter, setFacilityFilter] = useState('');
  const [eventFilter, setEventFilter] = useState<AuthEventType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadFacilities = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getFacilities(token);
      setFacilities(result.facilities);
    } catch {
      // Non-critical
    }
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getAuthAuditLog(token, {
        facilityId: facilityFilter === 'platform' ? null : facilityFilter || undefined,
        eventType: eventFilter || undefined,
        limit: 200,
      });
      setEntries(result.entries);
      setTotal(result.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load auth audit log');
    } finally {
      setIsLoading(false);
    }
  }, [token, facilityFilter, eventFilter]);

  useEffect(() => {
    if (token && user) loadFacilities();
  }, [token, user, loadFacilities]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  // Client-side text search
  const filteredEntries = searchQuery
    ? entries.filter(e =>
        e.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.ipAddress || '').includes(searchQuery) ||
        (e.failureReason || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  // Summary stats (computed from loaded entries)
  const summary = useMemo(() => {
    const successes = entries.filter(e => e.eventType === 'LOGIN_SUCCESS').length;
    const failures = entries.filter(e => e.eventType === 'LOGIN_FAILED').length;
    const uniqueUsers = new Set(entries.map(e => e.username)).size;
    return { successes, failures, uniqueUsers };
  }, [entries]);

  if (!user || !token) {
    return (
      <>
        <Header title="Auth Audit Dashboard" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  return (
    <>
      <Header title="Auth Audit Dashboard" />
      <div className="p-6 max-w-[1400px] mx-auto">
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Summary cards */}
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">{total}</div>
              <div className="text-xs text-text-muted">Total Events</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-green)]">{summary.successes}</div>
              <div className="text-xs text-text-muted">Successful Logins</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className={`text-2xl font-bold ${summary.failures > 10 ? 'text-[var(--color-red)]' : 'text-text-primary'}`}>
                {summary.failures}
              </div>
              <div className="text-xs text-text-muted">
                Failed Logins
                {summary.failures > 10 && (
                  <span className="ml-1 text-[var(--color-red)] font-medium">HIGH</span>
                )}
              </div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">{summary.uniqueUsers}</div>
              <div className="text-xs text-text-muted">Unique Users</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Facility</label>
            <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
              <option value="">All</option>
              <option value="platform">Platform Only</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Event Type</label>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value as AuthEventType | '')}>
              <option value="">All Events</option>
              <option value="LOGIN_SUCCESS">Login Success</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="LOGOUT">Logout</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Search</label>
            <input
              type="text"
              placeholder="Username, IP, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Auth audit table */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading auth events...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No authentication events match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Timestamp</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-secondary">Event</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">User</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Facility</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">IP Address</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    const badge = EVENT_BADGE[entry.eventType] || { bg: 'bg-surface-tertiary', label: entry.eventType };
                    return (
                      <tr key={entry.id} className="border-t border-border hover:bg-surface-secondary">
                        <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                          {formatTime(entry.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-text-primary font-medium text-xs">{entry.username}</div>
                          {entry.userRoles && (
                            <div className="text-[10px] text-text-muted">{entry.userRoles.join(', ')}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-text-secondary text-xs">
                          {entry.facilityName || (entry.facilityId ? 'Unknown' : 'Platform')}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                          {entry.ipAddress || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {entry.failureReason ? (
                            <span className="text-[var(--color-red)]">
                              {entry.failureReason.replace(/_/g, ' ')}
                            </span>
                          ) : entry.success ? (
                            <span className="text-[var(--color-green)] font-medium">OK</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-text-muted">
          Showing {filteredEntries.length} of {total} total events (loaded: {entries.length})
        </div>
      </div>
    </>
  );
}
