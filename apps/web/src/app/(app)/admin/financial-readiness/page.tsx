'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getFinancialDashboard,
  type FinancialDashboardRow,
  type FinancialRiskState,
} from '@/lib/api/financial-readiness';

const RISK_OPTIONS: { value: FinancialRiskState | ''; label: string }[] = [
  { value: '', label: 'All Risk Levels' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const RISK_BADGE: Record<FinancialRiskState, { bg: string; text: string; label: string }> = {
  HIGH: { bg: 'bg-[var(--color-red-bg)]', text: 'text-[var(--color-red-700)]', label: 'High' },
  MEDIUM: { bg: 'bg-[var(--color-orange-bg)]', text: 'text-[var(--color-orange-700)]', label: 'Medium' },
  LOW: { bg: 'bg-[var(--color-green-bg)]', text: 'text-[var(--color-green-700)]', label: 'Low' },
  UNKNOWN: { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: 'Unknown' },
};

const CLINIC_STATE_LABELS: Record<string, string> = {
  UNKNOWN: 'Not declared',
  DECLARED_CLEARED: 'Cleared',
  DECLARED_AT_RISK: 'At Risk',
};

const ASC_STATE_LABELS: Record<string, string> = {
  UNKNOWN: 'Not verified',
  VERIFIED_CLEARED: 'Cleared',
  VERIFIED_AT_RISK: 'At Risk',
};

export default function FinancialReadinessPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const router = useRouter();

  const [rows, setRows] = useState<FinancialDashboardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Filters — default to HIGH
  const [riskFilter, setRiskFilter] = useState<FinancialRiskState | ''>('HIGH');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getFinancialDashboard(token, {
        riskState: riskFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRows(result.rows);
      setTotal(result.total);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial readiness data');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, riskFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  if (!user) return null;
  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Financial Readiness" />
        <div className="p-6"><div className="alert alert-error">Access denied. Admin role required.</div></div>
      </>
    );
  }

  return (
    <>
      <Header title="Financial Readiness" />
      <div className="p-6 max-w-[1400px] mx-auto">
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Observational banner */}
        <div className="alert alert-info mb-4">
          Observational tracking only — does not block scheduling or case creation.
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>Risk Level</label>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as FinancialRiskState | '')}>
              {RISK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From Date</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To Date</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4 text-text-secondary text-sm">
          {total} request{total !== 1 ? 's' : ''} found
        </div>

        {/* Table */}
        {isLoadingData ? (
          <div className="text-center py-8 text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-text-muted">No surgery requests match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Patient</th>
                  <th className="text-left">Procedure</th>
                  <th className="text-left">Surgeon</th>
                  <th className="text-left">Clinic</th>
                  <th className="text-left">Scheduled</th>
                  <th className="text-left">Clinic</th>
                  <th className="text-left">ASC</th>
                  <th className="text-left">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.surgeryRequestId}
                    className="cursor-pointer hover:bg-surface-secondary"
                    onClick={() => router.push(`/admin/financial-readiness/${row.surgeryRequestId}`)}
                  >
                    <td>{row.patientDisplayName || '—'}</td>
                    <td>{row.procedureName}</td>
                    <td>{row.surgeonName || '—'}</td>
                    <td>{row.clinicName || '—'}</td>
                    <td className="whitespace-nowrap">{row.scheduledDate || '—'}</td>
                    <td className="text-xs">{CLINIC_STATE_LABELS[row.clinicState] || row.clinicState}</td>
                    <td className="text-xs">{ASC_STATE_LABELS[row.ascState] || row.ascState}</td>
                    <td><RiskBadge risk={row.riskState} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RiskBadge({ risk }: { risk: FinancialRiskState }) {
  const badge = RISK_BADGE[risk] || { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: risk };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  );
}
