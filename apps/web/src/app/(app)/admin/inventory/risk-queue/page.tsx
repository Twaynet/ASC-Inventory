'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function RiskQueuePage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [riskItems, setRiskItems] = useState<RiskQueueItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterRule, setFilterRule] = useState<string>('');

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
  }, [token, user, loadData]);

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

      <main className="container risk-queue-page">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Summary Cards */}
        <div className="summary-cards">
          {['RED', 'ORANGE', 'YELLOW'].map(severity => (
            <div
              key={severity}
              className={`summary-card ${filterSeverity === severity ? 'selected' : ''}`}
              onClick={() => setFilterSeverity(filterSeverity === severity ? '' : severity)}
              style={{
                borderColor: filterSeverity === severity ? SEVERITY_COLORS[severity].border : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="summary-value"
                style={{ color: SEVERITY_COLORS[severity].color }}
              >
                {severityCounts[severity] || 0}
              </div>
              <div className="summary-label">{severity}</div>
            </div>
          ))}
          <div className="summary-card total">
            <div className="summary-value">{riskItems.length}</div>
            <div className="summary-label">TOTAL</div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          <div className="filters">
            <select
              value={filterRule}
              onChange={(e) => setFilterRule(e.target.value)}
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
          <div className="table-container">
            <table className="data-table">
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
                    <td colSpan={6} className="empty-state">
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
                          className="severity-badge"
                          style={{
                            backgroundColor: SEVERITY_COLORS[item.severity]?.bg || '#e2e8f0',
                            color: SEVERITY_COLORS[item.severity]?.color || '#4a5568',
                          }}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td>
                        <span className="rule-badge">
                          {RULE_LABELS[item.rule] || item.rule}
                        </span>
                      </td>
                      <td className="name-cell">{item.catalogName}</td>
                      <td className="identifier-cell">
                        {item.identifier || <span className="muted">-</span>}
                      </td>
                      <td className="expires-cell">
                        {item.expiresAt ? (
                          <span>
                            {new Date(item.expiresAt).toLocaleDateString()}
                            {item.daysToExpire !== null && (
                              <span className="days-badge">
                                {item.daysToExpire <= 0
                                  ? `${Math.abs(item.daysToExpire)}d ago`
                                  : `${item.daysToExpire}d`}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="explain-cell">{item.explain}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="info-note">
          <strong>Note:</strong> Risk items are computed on-demand from Catalog v1.1 intent flags and current Inventory state.
          No data is stored or cached. Severity is derived from catalog criticality (CRITICAL=RED, IMPORTANT=ORANGE, ROUTINE=YELLOW).
          Expired items are always RED.
        </div>
      </main>

      <style jsx>{`
        .risk-queue-page {
          padding: 2rem 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .summary-card:hover {
          border-color: #e2e8f0;
        }

        .summary-card.total {
          background: #f7fafc;
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
        }

        .summary-label {
          font-size: 0.75rem;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .filters-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .filters select {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table th {
          background: #f8f9fa;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .data-table tr:hover {
          background: #f8f9fa;
        }

        .severity-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .rule-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          background: #edf2f7;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #4a5568;
        }

        .name-cell {
          font-weight: 500;
        }

        .identifier-cell {
          font-family: monospace;
          font-size: 0.875rem;
        }

        .expires-cell {
          white-space: nowrap;
        }

        .days-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.125rem 0.375rem;
          background: #edf2f7;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #718096;
        }

        .explain-cell {
          font-size: 0.875rem;
          color: #4a5568;
          max-width: 300px;
        }

        .muted {
          color: #a0aec0;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .info-note {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #ebf8ff;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #2b6cb0;
        }

        .alert-error {
          background: #fed7d7;
          border: 1px solid #fc8181;
          color: #c53030;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .loading {
          text-align: center;
          padding: 2rem;
          color: #718096;
        }

        .btn {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .btn-secondary {
          background: #e2e8f0;
          color: #4a5568;
        }

        .btn-secondary:hover {
          background: #cbd5e0;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
        }
      `}</style>
    </>
  );
}
