'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getSurgeryRequests,
  getSurgeryRequestClinics,
  type SurgeryRequest,
  type SurgeryRequestStatus,
  type ClinicSummary,
} from '@/lib/api/surgery-requests';

const STATUS_OPTIONS: { value: SurgeryRequestStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'RETURNED_TO_CLINIC', label: 'Returned' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
  { value: 'CONVERTED', label: 'Converted' },
];

const STATUS_BADGE: Record<SurgeryRequestStatus, { bg: string; text: string; label: string }> = {
  SUBMITTED: { bg: 'bg-[var(--color-blue-bg)]', text: 'text-[var(--color-blue-700)]', label: 'Submitted' },
  RETURNED_TO_CLINIC: { bg: 'bg-[var(--color-orange-bg)]', text: 'text-[var(--color-orange-700)]', label: 'Returned' },
  ACCEPTED: { bg: 'bg-[var(--color-green-bg)]', text: 'text-[var(--color-green-700)]', label: 'Accepted' },
  REJECTED: { bg: 'bg-[var(--color-red-bg)]', text: 'text-[var(--color-red-700)]', label: 'Rejected' },
  WITHDRAWN: { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: 'Withdrawn' },
  CONVERTED: { bg: 'bg-[var(--color-purple-bg)]', text: 'text-[var(--color-purple-700)]', label: 'Converted' },
};

export default function SurgeryRequestsPage() {
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const router = useRouter();

  const [requests, setRequests] = useState<SurgeryRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<SurgeryRequestStatus | ''>('SUBMITTED');
  const [clinicFilter, setClinicFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [result, clinicsResult] = await Promise.all([
        getSurgeryRequests(token, {
          status: statusFilter || undefined,
          clinicId: clinicFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        getSurgeryRequestClinics(token),
      ]);
      setRequests(result.requests);
      setTotal(result.total);
      setClinics(clinicsResult.clinics);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surgery requests');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, statusFilter, clinicFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (token && user) loadData();
  }, [token, user, loadData]);

  if (!user) return null;
  if (!hasRole('ADMIN') && !hasRole('SCHEDULER')) {
    return (
      <>
        <Header title="Surgery Requests" />
        <div className="p-6"><div className="alert alert-error">Access denied. Admin or Scheduler role required.</div></div>
      </>
    );
  }

  return (
    <>
      <Header title="Surgery Requests" />
      <div className="p-6 max-w-[1400px] mx-auto">
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SurgeryRequestStatus | '')}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>Clinic</label>
            <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}>
              <option value="">All Clinics</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
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
        ) : requests.length === 0 ? (
          <div className="text-center py-8 text-text-muted">No surgery requests match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Submitted</th>
                  <th className="text-left">Clinic</th>
                  <th className="text-left">Patient</th>
                  <th className="text-left">Procedure</th>
                  <th className="text-left">Surgeon</th>
                  <th className="text-left">Scheduled Intent</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="cursor-pointer hover:bg-surface-secondary"
                    onClick={() => router.push(`/admin/surgery-requests/${req.id}`)}
                  >
                    <td className="whitespace-nowrap">{formatDate(req.lastSubmittedAt)}</td>
                    <td>{req.clinicName}</td>
                    <td>{req.patientDisplayName || req.patientClinicKey || '—'}</td>
                    <td>{req.procedureName}</td>
                    <td>{req.surgeonName || '—'}</td>
                    <td className="whitespace-nowrap">
                      {req.scheduledDate
                        ? `${req.scheduledDate}${req.scheduledTime ? ` ${req.scheduledTime}` : ''}`
                        : '—'}
                    </td>
                    <td>
                      <StatusBadge status={req.status} />
                    </td>
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

function StatusBadge({ status }: { status: SurgeryRequestStatus }) {
  const badge = STATUS_BADGE[status] || { bg: 'bg-surface-tertiary', text: 'text-text-muted', label: status };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
