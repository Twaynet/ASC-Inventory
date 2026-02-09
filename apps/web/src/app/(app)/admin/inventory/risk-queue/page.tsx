'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getInventoryRiskQueue, type RiskQueueItem } from '@/lib/api';

const SEVERITY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  RED: { bg: '#fed7d7', color: '#c53030', border: '#fc8181' },
  ORANGE: { bg: '#feebc8', color: '#c05621', border: '#f6ad55' },
  YELLOW: { bg: '#fefcbf', color: '#975a16', border: '#f6e05e' },
};

const RULE_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  EXPIRING_SOON: 'Expiring Soon',
  MISSING_EXPIRATION: 'Missing Expiration',
  MISSING_LOT: 'Missing Lot',
  MISSING_SERIAL: 'Missing Serial',
};

const VALID_RULES = Object.keys(RULE_LABELS);

export default function RiskQueuePage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const searchParams = useSearchParams();

  // Deep link support: ?rule=EXPIRED initializes rule filter
  const urlRule = searchParams.get('rule');

  const [riskItems, setRiskItems] = useState<RiskQueueItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterRule, setFilterRule] = useState<string>(
    urlRule && VALID_RULES.includes(urlRule) ? urlRule : '',
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getInventoryRiskQueue(token);
      setRiskItems(result.riskItems);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk queue');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && hasRole('ADMIN')) {
      loadData();
    }
  }, [token, hasRole, loadData]);

  // Filter items
  const filteredItems = riskItems.filter(item => {
    if (filterSeverity && item.severity !== filterSeverity) return false;
    if (filterRule && item.rule !== filterRule) return false;
    return true;
  });

  // Count by severity
  const severityCounts = riskItems.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Count by rule
  const ruleCounts = riskItems.reduce((acc, item) => {
    acc[item.rule] = (acc[item.rule] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Inventory Risk Queue" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Inventory Risk Queue" />

      <main className="container-full py-8">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Summary Cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 mb-6">
          {['RED', 'ORANGE', 'YELLOW'].map(severity => (
            <div
              key={severity}
              className="bg-surface-primary rounded-lg p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.1)] border-2 transition-colors cursor-pointer hover:border-border"
              onClick={() => setFilterSeverity(filterSeverity === severity ? '' : severity)}
              style={{
                borderColor: filterSeverity === severity ? SEVERITY_COLORS[severity].border : 'transparent',
              }}
            >
              <div
                className="text-[2rem] font-bold"
                style={{ color: SEVERITY_COLORS[severity].color }}
              >
                {severityCounts[severity] || 0}
              </div>
              <div className="text-xs text-text-muted uppercase tracking-wide">{severity}</div>
            </div>
          ))}
          <div className="bg-surface-secondary rounded-lg p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.1)] border-2 border-transparent">
            <div className="text-[2rem] font-bold text-text-primary">{riskItems.length}</div>
            <div className="text-xs text-text-muted uppercase tracking-wide">TOTAL</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <select
              value={filterRule}
              onChange={(e) => setFilterRule(e.target.value)}
              className="p-2 border border-border rounded text-sm bg-surface-primary text-text-primary"
            >
              <option value="">All Rules</option>
              {Object.entries(RULE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label} ({ruleCounts[key] || 0})
                </option>
              ))}
            </select>
            {(filterSeverity || filterRule) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilterSeverity('');
                  setFilterRule('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <button className="btn btn-secondary" onClick={loadData}>
            Refresh
          </button>
        </div>

        {/* Risk Items Table */}
        {isLoadingData ? (
          <div className="loading">Loading risk items...</div>
        ) : (
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-x-auto">
            <table className="w-full border-collapse [&_th]:p-3 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-secondary [&_th]:font-semibold [&_th]:text-sm [&_td]:p-3 [&_td]:text-left [&_td]:border-b [&_td]:border-border [&_tr:hover]:bg-surface-secondary">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Rule</th>
                  <th>Item</th>
                  <th>Identifier</th>
                  <th>Expires</th>
                  <th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="!text-center text-text-muted !p-8">
                      {riskItems.length === 0
                        ? 'No risk items found. All inventory is compliant.'
                        : 'No items match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, index) => (
                    <tr key={`${item.inventoryItemId}-${item.rule}-${index}`}>
                      <td>
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: SEVERITY_COLORS[item.severity]?.bg || '#e2e8f0',
                            color: SEVERITY_COLORS[item.severity]?.color || '#4a5568',
                          }}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td>
                        <span className="inline-block px-2 py-1 bg-surface-tertiary rounded text-xs font-medium text-text-secondary">
                          {RULE_LABELS[item.rule] || item.rule}
                        </span>
                      </td>
                      <td className="font-medium text-text-primary">{item.catalogName}</td>
                      <td className="font-mono text-sm">
                        {item.identifier || <span className="text-text-muted">-</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {item.expiresAt ? (
                          <span>
                            {new Date(item.expiresAt).toLocaleDateString()}
                            {item.daysToExpire !== null && (
                              <span className="inline-block ml-2 px-1.5 py-0.5 bg-surface-tertiary rounded text-xs text-text-muted">
                                {item.daysToExpire <= 0
                                  ? `${Math.abs(item.daysToExpire)}d ago`
                                  : `${item.daysToExpire}d`}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="text-sm text-text-secondary max-w-[300px]">{item.explain}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 p-4 bg-[var(--color-blue-50)] rounded-lg text-sm text-[var(--color-blue-500)]">
          <strong>Note:</strong> Risk items are computed on-demand from Catalog v1.1 intent flags and current Inventory state.
          No data is stored or cached. Severity is derived from catalog criticality (CRITICAL=RED, IMPORTANT=ORANGE, ROUTINE=YELLOW).
          Expired items are always RED.
        </div>
      </main>
    </>
  );
}
