'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getAuditLog,
  getConfigKeys,
  getFacilities,
  type AuditLogEntry,
  type ConfigKey,
  type Facility,
} from '@/lib/api/platform';

/**
 * Phase 7.9 — Config Audit Viewer
 *
 * Dedicated audit page with diff display and enhanced filtering.
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

export default function ConfigAuditPage() {
  const { user, token } = useAuth();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [configKeys, setConfigKeys] = useState<ConfigKey[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [keyFilter, setKeyFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadReferenceData = useCallback(async () => {
    if (!token) return;
    try {
      const [keysResult, facilityResult] = await Promise.all([
        getConfigKeys(token),
        getFacilities(token),
      ]);
      setConfigKeys(keysResult.keys);
      setFacilities(facilityResult.facilities);
    } catch {
      // Non-critical — filters just won't populate
    }
  }, [token]);

  const loadAuditLog = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getAuditLog(token, {
        key: keyFilter || undefined,
        facilityId: facilityFilter || undefined,
        limit: 100,
      });
      setEntries(result.entries);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setIsLoading(false);
    }
  }, [token, keyFilter, facilityFilter]);

  useEffect(() => {
    if (token && user) loadReferenceData();
  }, [token, user, loadReferenceData]);

  useEffect(() => {
    if (token && user) loadAuditLog();
  }, [token, user, loadAuditLog]);

  // Client-side text search filter
  const filteredEntries = searchQuery
    ? entries.filter(e =>
        e.configKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.changeReason || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  if (!user || !token) {
    return (
      <>
        <Header title="Config Audit Viewer" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  return (
    <>
      <Header title="Config Audit Viewer" />
      <div className="p-6 max-w-[1400px] mx-auto">
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Config Key</label>
            <select value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)}>
              <option value="">All Keys</option>
              {configKeys.map(k => (
                <option key={k.key} value={k.key}>{k.displayName}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Facility</label>
            <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
              <option value="">All (Platform + Facilities)</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Search</label>
            <input
              type="text"
              placeholder="Key, actor, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Audit table */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading audit log...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No audit log entries match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Key</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-secondary">Action</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Change</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Actor</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border hover:bg-surface-secondary">
                      <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                        {formatTime(entry.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-text-primary font-medium text-xs font-mono">
                          {entry.configKey}
                        </div>
                        {entry.facilityId && (
                          <div className="inline-block mt-1 px-1.5 py-0.5 text-[10px] rounded bg-surface-tertiary text-text-muted">
                            {facilities.find(f => f.id === entry.facilityId)?.name || 'Facility'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${
                          entry.action === 'SET' ? 'bg-accent' : 'bg-[var(--color-orange)]'
                        }`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className="text-[var(--color-red)] line-through">
                          {entry.oldValue || '(none)'}
                        </span>
                        <span className="text-text-muted mx-1">&rarr;</span>
                        <span className="text-[var(--color-green)]">
                          {entry.newValue || '(none)'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs">
                        {entry.actorName}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs max-w-[200px] truncate">
                        {entry.changeReason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-text-muted">
          Showing {filteredEntries.length} of {entries.length} entries (limit: 100)
        </div>
      </div>
    </>
  );
}
