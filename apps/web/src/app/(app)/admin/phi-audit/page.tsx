'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { API_BASE } from '@/lib/api/client';
import {
  getAuditStats,
  getAuditAnalytics,
  getAuditSessions,
  getAuditEntries,
  getExcessiveDenials,
  getRetentionList,
  type AuditStats,
  type AuditAnalytics,
  type AuditSession,
  type PhiAuditEntry,
  type ExcessiveDenialEntry,
  type RetentionCase,
} from '@/lib/api/phi-audit';

type TabId = 'overview' | 'sessions' | 'denials' | 'retention';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'denials', label: 'Denials' },
  { id: 'retention', label: 'Retention' },
];

const PAGE_SIZE = 25;

export default function PhiAuditPage() {
  const { user, token } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [userFilter, setUserFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Overview data
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [analytics, setAnalytics] = useState<AuditAnalytics | null>(null);

  // Sessions data
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDrilldown, setSessionDrilldown] = useState<PhiAuditEntry[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Denials data
  const [denials, setDenials] = useState<ExcessiveDenialEntry[]>([]);

  // Retention data
  const [retentionCases, setRetentionCases] = useState<RetentionCase[]>([]);
  const [retentionTotal, setRetentionTotal] = useState(0);
  const [retentionOffset, setRetentionOffset] = useState(0);
  const [onlyPurgeable, setOnlyPurgeable] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');

    try {
      switch (activeTab) {
        case 'overview': {
          const [statsData, analyticsData] = await Promise.all([
            getAuditStats(token, startDate, endDate),
            getAuditAnalytics(token, startDate, endDate),
          ]);
          setStats(statsData);
          setAnalytics(analyticsData);
          break;
        }
        case 'sessions': {
          const res = await getAuditSessions(token, {
            startDate,
            endDate,
            userId: userFilter || undefined,
            limit: PAGE_SIZE,
            offset: sessionsOffset,
          });
          setSessions(res.sessions);
          setSessionsTotal(res.total);
          setExpandedSession(null);
          setSessionDrilldown([]);
          break;
        }
        case 'denials': {
          const res = await getExcessiveDenials(token, {
            startDate,
            endDate,
            limit: PAGE_SIZE,
          });
          setDenials(res.entries);
          break;
        }
        case 'retention': {
          const res = await getRetentionList(token, {
            limit: PAGE_SIZE,
            offset: retentionOffset,
            onlyPurgeable: onlyPurgeable || undefined,
          });
          setRetentionCases(res.cases);
          setRetentionTotal(res.total);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [token, activeTab, startDate, endDate, userFilter, sessionsOffset, retentionOffset, onlyPurgeable]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  // Session drilldown
  const handleSessionExpand = async (session: AuditSession) => {
    const key = `${session.userId}-${session.sessionStart}`;
    if (expandedSession === key) {
      setExpandedSession(null);
      setSessionDrilldown([]);
      return;
    }
    setExpandedSession(key);
    setDrilldownLoading(true);
    try {
      const res = await getAuditEntries(token!, {
        userId: session.userId,
        startDate: session.sessionStart.split('T')[0],
        endDate: session.sessionEnd.split('T')[0] || endDate,
        limit: 100,
      });
      setSessionDrilldown(res.entries);
    } catch {
      setSessionDrilldown([]);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // CSV export (manual fetch for blob, matching reports page pattern)
  const handleExportCSV = async (exportTab: string) => {
    if (!token) return;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (exportTab === 'retention' && onlyPurgeable) params.set('onlyPurgeable', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${API_BASE}/phi-audit/${exportTab}/export${qs}`;
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Access-Purpose': 'AUDIT',
        },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `phi-audit-${exportTab}_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  if (!user?.roles?.includes('ADMIN')) {
    return (
      <>
        <Header title="PHI Audit" />
        <main className="container-full py-4 px-6">
          <div className="alert alert-error">Access denied. Admin role required.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="PHI Audit" />
      <main className="container-full py-4 px-6">
        {error && (
          <div className="alert alert-error mb-4">
            {error}
            <button onClick={() => setError('')} className="ml-4 underline">Dismiss</button>
          </div>
        )}

        {/* Tabs + Filters */}
        <div className="bg-surface-primary rounded-lg p-4 mb-4 border border-border">
          <div className="flex gap-4 flex-wrap mb-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSessionsOffset(0); setRetentionOffset(0); }}
                className={`px-3 py-1.5 rounded cursor-pointer text-sm ${
                  activeTab === tab.id
                    ? 'border-2 border-accent bg-accent text-white'
                    : 'border border-border bg-surface-primary text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <label className="block text-xs mb-1 text-text-secondary">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-2 border border-border rounded bg-surface-primary text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-text-secondary">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2 border border-border rounded bg-surface-primary text-text-primary"
              />
            </div>

            {(activeTab === 'sessions') && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">User ID</label>
                <input
                  type="text"
                  placeholder="Filter by user ID"
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                />
              </div>
            )}

            {activeTab === 'retention' && (
              <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyPurgeable}
                  onChange={(e) => { setOnlyPurgeable(e.target.checked); setRetentionOffset(0); }}
                />
                Only purgeable
              </label>
            )}

            <button onClick={loadData} className="btn btn-primary btn-sm">
              {isLoading ? 'Loading...' : 'Apply'}
            </button>
            {activeTab !== 'overview' && (
              <button onClick={() => handleExportCSV(activeTab)} className="btn btn-secondary btn-sm">
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="loading">Loading audit data...</div>
        ) : (
          <>
            {/* ===== OVERVIEW TAB ===== */}
            {activeTab === 'overview' && stats && analytics && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{stats.total}</div>
                    <div className="text-sm text-text-muted">Total Accesses</div>
                  </div>
                  <div className="bg-[var(--color-green-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-green-700)]">{stats.byOutcome?.ALLOWED ?? 0}</div>
                    <div className="text-sm text-[var(--color-green-700)]">Allowed</div>
                  </div>
                  <div className="bg-[var(--color-red-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-red)]">{stats.byOutcome?.DENIED ?? 0}</div>
                    <div className="text-sm text-[var(--color-red)]">Denied</div>
                  </div>
                  <div className="bg-[var(--color-orange-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-orange-700)]">{stats.emergencyCount}</div>
                    <div className="text-sm text-[var(--color-orange-700)]">Emergency</div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{stats.exportCount}</div>
                    <div className="text-sm text-text-muted">Exports</div>
                  </div>
                </div>

                {/* Analytics cards */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{analytics.totalSessions}</div>
                    <div className="text-sm text-text-muted">Total Sessions</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${analytics.suspiciousSessionCount > 0 ? 'bg-[var(--color-red-bg)]' : 'bg-surface-primary'}`}>
                    <div className={`text-3xl font-bold ${analytics.suspiciousSessionCount > 0 ? 'text-[var(--color-red)]' : 'text-text-primary'}`}>{analytics.suspiciousSessionCount}</div>
                    <div className={`text-sm ${analytics.suspiciousSessionCount > 0 ? 'text-[var(--color-red)]' : 'text-text-muted'}`}>Suspicious Sessions</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${analytics.excessiveDenialCount > 0 ? 'bg-[var(--color-orange-bg)]' : 'bg-surface-primary'}`}>
                    <div className={`text-3xl font-bold ${analytics.excessiveDenialCount > 0 ? 'text-[var(--color-orange-700)]' : 'text-text-primary'}`}>{analytics.excessiveDenialCount}</div>
                    <div className={`text-sm ${analytics.excessiveDenialCount > 0 ? 'text-[var(--color-orange-700)]' : 'text-text-muted'}`}>Excessive Denials</div>
                  </div>
                </div>

                {/* Access by Purpose */}
                {stats.byPurpose && Object.keys(stats.byPurpose).length > 0 && (
                  <div className="bg-surface-primary p-4 rounded-lg mb-4">
                    <h3 className="m-0 mb-2 text-sm text-text-primary">Access by Purpose</h3>
                    <div className="flex gap-4 flex-wrap">
                      {Object.entries(stats.byPurpose).map(([purpose, count]) => (
                        <div key={purpose} className="p-2 bg-surface-secondary rounded">
                          <div className="font-medium text-text-primary">{purpose.replace(/_/g, ' ')}</div>
                          <div className="text-text-muted">{count} accesses</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Users */}
                {analytics.topUsers.length > 0 && (
                  <div className="bg-surface-primary rounded-lg overflow-auto">
                    <h3 className="m-0 p-4 pb-0 text-sm text-text-primary">Top Users by Access Count</h3>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-surface-secondary">
                          <th className="p-3 text-left border-b border-border">User</th>
                          <th className="p-3 text-left border-b border-border">User ID</th>
                          <th className="p-3 text-right border-b border-border">Access Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topUsers.map((u) => (
                          <tr key={u.userId} className="border-b border-border">
                            <td className="p-3">{u.userName}</td>
                            <td className="p-3 font-mono text-xs text-text-muted">{u.userId}</td>
                            <td className="p-3 text-right font-medium">{u.accessCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ===== SESSIONS TAB ===== */}
            {activeTab === 'sessions' && (
              <>
                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">User</th>
                        <th className="p-3 text-left border-b border-border">Session Start</th>
                        <th className="p-3 text-left border-b border-border">Session End</th>
                        <th className="p-3 text-right border-b border-border">Accesses</th>
                        <th className="p-3 text-right border-b border-border">Denials</th>
                        <th className="p-3 text-right border-b border-border">Emergency</th>
                        <th className="p-3 text-center border-b border-border">Suspicious</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session) => {
                        const key = `${session.userId}-${session.sessionStart}`;
                        const isExpanded = expandedSession === key;
                        return (
                          <Fragment key={key}>
                            <tr
                              className={`border-b border-border cursor-pointer hover:bg-surface-secondary ${
                                session.isSuspicious ? 'bg-[var(--color-red-50)]' : ''
                              }`}
                              onClick={() => handleSessionExpand(session)}
                            >
                              <td className="p-3">{session.userName}</td>
                              <td className="p-3 whitespace-nowrap">{formatDateTime(session.sessionStart)}</td>
                              <td className="p-3 whitespace-nowrap">{formatDateTime(session.sessionEnd)}</td>
                              <td className="p-3 text-right">{session.accessCount}</td>
                              <td className={`p-3 text-right ${session.denialCount > 0 ? 'text-[var(--color-red)] font-medium' : ''}`}>
                                {session.denialCount}
                              </td>
                              <td className={`p-3 text-right ${session.emergencyCount > 0 ? 'text-[var(--color-orange)] font-medium' : ''}`}>
                                {session.emergencyCount}
                              </td>
                              <td className="p-3 text-center">
                                {session.isSuspicious ? (
                                  <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-[var(--color-red-bg)] text-[var(--color-red)]">
                                    Suspicious
                                  </span>
                                ) : (
                                  <span className="text-text-muted">-</span>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="p-0">
                                  <div className="bg-surface-secondary p-4">
                                    {session.suspiciousReasons.length > 0 && (
                                      <div className="mb-3 p-2 rounded bg-[var(--color-red-bg)] text-[var(--color-red)] text-xs">
                                        {session.suspiciousReasons.map((r, i) => (
                                          <div key={i}>{r}</div>
                                        ))}
                                      </div>
                                    )}
                                    <div className="mb-2 text-xs text-text-muted">
                                      Purposes: {session.purposes.join(', ')} | Classifications: {session.classifications.join(', ')} | Cases: {session.caseIds.length}
                                    </div>
                                    {drilldownLoading ? (
                                      <div className="text-text-muted text-sm">Loading entries...</div>
                                    ) : sessionDrilldown.length > 0 ? (
                                      <table className="w-full border-collapse text-xs">
                                        <thead>
                                          <tr className="bg-surface-tertiary">
                                            <th className="p-2 text-left border-b border-border">Time</th>
                                            <th className="p-2 text-left border-b border-border">Endpoint</th>
                                            <th className="p-2 text-center border-b border-border">Method</th>
                                            <th className="p-2 text-center border-b border-border">Purpose</th>
                                            <th className="p-2 text-center border-b border-border">Outcome</th>
                                            <th className="p-2 text-left border-b border-border">Denial Reason</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sessionDrilldown.map((entry) => (
                                            <tr key={entry.id} className="border-b border-border">
                                              <td className="p-2 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                                              <td className="p-2 font-mono">{entry.endpoint || '-'}</td>
                                              <td className="p-2 text-center">{entry.httpMethod || '-'}</td>
                                              <td className="p-2 text-center">{entry.accessPurpose}</td>
                                              <td className="p-2 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                                                  entry.outcome === 'ALLOWED'
                                                    ? 'bg-[var(--color-green-bg)] text-[var(--color-green-700)]'
                                                    : 'bg-[var(--color-red-bg)] text-[var(--color-red)]'
                                                }`}>
                                                  {entry.outcome}
                                                </span>
                                              </td>
                                              <td className="p-2">{entry.denialReason || '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <div className="text-text-muted text-sm">No entries found</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {sessions.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-text-muted">No sessions found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {sessionsTotal > PAGE_SIZE && (
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-text-muted">
                      Showing {sessionsOffset + 1}–{Math.min(sessionsOffset + PAGE_SIZE, sessionsTotal)} of {sessionsTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSessionsOffset(Math.max(0, sessionsOffset - PAGE_SIZE))}
                        disabled={sessionsOffset === 0}
                        className="btn btn-secondary btn-sm"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setSessionsOffset(sessionsOffset + PAGE_SIZE)}
                        disabled={sessionsOffset + PAGE_SIZE >= sessionsTotal}
                        className="btn btn-secondary btn-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ===== DENIALS TAB ===== */}
            {activeTab === 'denials' && (
              <div className="bg-surface-primary rounded-lg overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="p-3 text-left border-b border-border">User</th>
                      <th className="p-3 text-left border-b border-border">Hour</th>
                      <th className="p-3 text-right border-b border-border">Denial Count</th>
                      <th className="p-3 text-right border-b border-border">Threshold</th>
                      <th className="p-3 text-left border-b border-border">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {denials.map((entry, idx) => (
                      <tr key={`${entry.userId}-${entry.hourBucket}-${idx}`} className="border-b border-border">
                        <td className="p-3">{entry.userName}</td>
                        <td className="p-3 whitespace-nowrap">{formatDateTime(entry.hourBucket)}</td>
                        <td className="p-3 text-right font-medium text-[var(--color-red)]">{entry.denialCount}</td>
                        <td className="p-3 text-right text-text-muted">{entry.threshold}</td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {entry.denialReasons.map((reason, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 rounded text-xs bg-surface-tertiary">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {denials.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-text-muted">No excessive denials found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ===== RETENTION TAB ===== */}
            {activeTab === 'retention' && (
              <>
                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Entity ID</th>
                        <th className="p-3 text-center border-b border-border">Purgeable</th>
                        <th className="p-3 text-left border-b border-border">Earliest Purge</th>
                        <th className="p-3 text-left border-b border-border">Retention Reasons</th>
                        <th className="p-3 text-left border-b border-border">Details</th>
                        <th className="p-3 text-left border-b border-border">Evaluated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retentionCases.map((c) => (
                        <tr key={c.entityId} className="border-b border-border">
                          <td className="p-3 font-mono text-xs">{c.entityId}</td>
                          <td className="p-3 text-center">
                            {c.isPurgeable ? (
                              <span className="inline-block px-2 py-1 rounded text-xs bg-[var(--color-green-bg)] text-[var(--color-green-700)]">Yes</span>
                            ) : (
                              <span className="inline-block px-2 py-1 rounded text-xs bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]">No</span>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap">{c.earliestPurgeAt ? formatDate(c.earliestPurgeAt) : '-'}</td>
                          <td className="p-3">
                            <div className="flex gap-1 flex-wrap">
                              {c.retentionReasons.map((r) => (
                                <span key={r} className="inline-block px-2 py-0.5 rounded text-xs bg-surface-tertiary">
                                  {r.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-xs text-text-muted">
                            {c.retentionDetails.map((d, i) => (
                              <div key={i}>{d.description}{d.expiresAt ? ` (until ${formatDate(d.expiresAt)})` : ''}</div>
                            ))}
                          </td>
                          <td className="p-3 whitespace-nowrap text-xs text-text-muted">{formatDateTime(c.evaluatedAt)}</td>
                        </tr>
                      ))}
                      {retentionCases.length === 0 && (
                        <tr><td colSpan={6} className="p-4 text-center text-text-muted">No retention records found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {retentionTotal > PAGE_SIZE && (
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-text-muted">
                      Showing {retentionOffset + 1}–{Math.min(retentionOffset + PAGE_SIZE, retentionTotal)} of {retentionTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRetentionOffset(Math.max(0, retentionOffset - PAGE_SIZE))}
                        disabled={retentionOffset === 0}
                        className="btn btn-secondary btn-sm"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setRetentionOffset(retentionOffset + PAGE_SIZE)}
                        disabled={retentionOffset + PAGE_SIZE >= retentionTotal}
                        className="btn btn-secondary btn-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDateTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return iso;
  }
}
