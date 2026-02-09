'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryReadinessReport,
  getVerificationActivityReport,
  getChecklistComplianceReport,
  getCaseSummaryReport,
  getVendorConcessionsReport,
  getInventoryValuationReport,
  getLoanerExposureReport,
  getCancelledCasesReport,
  getCaseTimelinesReport,
  getDebriefSummaryReport,
  getCaseEventLogReport,
  getReportExportUrl,
  getSurgeons,
  type InventoryReadinessRow,
  type InventoryReadinessSummary,
  type VerificationActivityRow,
  type VerificationActivitySummary,
  type ChecklistComplianceRow,
  type ChecklistComplianceSummary,
  type CaseSummaryRow,
  type CaseSummarySummary,
  type VendorConcessionRow,
  type VendorConcessionSummary,
  type InventoryValuationRow,
  type InventoryValuationSummary,
  type LoanerExposureRow,
  type LoanerExposureSummary,
  type CancelledCaseRow,
  type CancelledCaseSummary,
  type CaseTimelineRow,
  type CaseTimelineSummary,
  type DebriefSummaryRow,
  type DebriefSummarySummary,
  type CaseEventLogRow,
  type CaseEventLogSummary,
  type ReportFilters,
  type FinancialReportFilters,
  type AuditReportFilters,
} from '@/lib/api';
import { getVendors, type Vendor } from '@/lib/api/vendors';

type ReportType = 'inventory-readiness' | 'verification-activity' | 'checklist-compliance' | 'case-summary' | 'vendor-concessions' | 'inventory-valuation' | 'loaner-exposure' | 'cancelled-cases' | 'case-timelines' | 'debrief-summary' | 'case-event-log';

const REPORT_DEFINITIONS = [
  {
    id: 'inventory-readiness' as ReportType,
    name: 'Inventory Readiness',
    description: 'Case readiness status with item verification details',
    category: 'inventory',
  },
  {
    id: 'verification-activity' as ReportType,
    name: 'Verification Activity',
    description: 'Inventory event activity by type, user, and time',
    category: 'inventory',
  },
  {
    id: 'checklist-compliance' as ReportType,
    name: 'Checklist Compliance',
    description: 'Timeout and debrief completion rates',
    category: 'compliance',
  },
  {
    id: 'case-summary' as ReportType,
    name: 'Case Summary',
    description: 'Cases by status, surgeon, and procedure',
    category: 'cases',
  },
  {
    id: 'vendor-concessions' as ReportType,
    name: 'Vendor Concessions',
    description: 'Cost overrides, gratis items, and savings by vendor',
    category: 'financial',
  },
  {
    id: 'inventory-valuation' as ReportType,
    name: 'Inventory Valuation',
    description: 'Current inventory value by ownership type and category',
    category: 'financial',
  },
  {
    id: 'loaner-exposure' as ReportType,
    name: 'Loaner Exposure',
    description: 'Open loaner sets and overdue returns by vendor',
    category: 'financial',
  },
  {
    id: 'cancelled-cases' as ReportType,
    name: 'Cancelled Cases',
    description: 'Cancelled cases with reasons and prior status',
    category: 'audit',
  },
  {
    id: 'case-timelines' as ReportType,
    name: 'Case Timelines',
    description: 'Case status transitions with actors and reasons',
    category: 'audit',
  },
  {
    id: 'debrief-summary' as ReportType,
    name: 'Debrief Summary',
    description: 'Debrief completion, duration, signatures, and flags',
    category: 'audit',
  },
  {
    id: 'case-event-log' as ReportType,
    name: 'Case Event Log',
    description: 'Cross-case event log by type and user',
    category: 'audit',
  },
];

export default function AdminReportsPage() {
  const { user, token } = useAuth();

  const [selectedReport, setSelectedReport] = useState<ReportType>('inventory-readiness');
  const [filters, setFilters] = useState<ReportFilters & FinancialReportFilters & AuditReportFilters>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [surgeons, setSurgeons] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState('');

  // Report data state
  const [inventoryReadinessData, setInventoryReadinessData] = useState<{
    rows: InventoryReadinessRow[];
    summary: InventoryReadinessSummary;
  } | null>(null);
  const [verificationActivityData, setVerificationActivityData] = useState<{
    rows: VerificationActivityRow[];
    summary: VerificationActivitySummary;
  } | null>(null);
  const [checklistComplianceData, setChecklistComplianceData] = useState<{
    rows: ChecklistComplianceRow[];
    summary: ChecklistComplianceSummary;
  } | null>(null);
  const [caseSummaryData, setCaseSummaryData] = useState<{
    rows: CaseSummaryRow[];
    summary: CaseSummarySummary;
  } | null>(null);
  const [vendorConcessionsData, setVendorConcessionsData] = useState<{
    rows: VendorConcessionRow[];
    summary: VendorConcessionSummary;
  } | null>(null);
  const [inventoryValuationData, setInventoryValuationData] = useState<{
    rows: InventoryValuationRow[];
    summary: InventoryValuationSummary;
  } | null>(null);
  const [loanerExposureData, setLoanerExposureData] = useState<{
    rows: LoanerExposureRow[];
    summary: LoanerExposureSummary;
  } | null>(null);
  const [cancelledCasesData, setCancelledCasesData] = useState<{
    rows: CancelledCaseRow[];
    summary: CancelledCaseSummary;
  } | null>(null);
  const [caseTimelinesData, setCaseTimelinesData] = useState<{
    rows: CaseTimelineRow[];
    summary: CaseTimelineSummary;
  } | null>(null);
  const [debriefSummaryData, setDebriefSummaryData] = useState<{
    rows: DebriefSummaryRow[];
    summary: DebriefSummarySummary;
  } | null>(null);
  const [caseEventLogData, setCaseEventLogData] = useState<{
    rows: CaseEventLogRow[];
    summary: CaseEventLogSummary;
  } | null>(null);

  useEffect(() => {
    if (token) {
      getSurgeons(token).then(result => setSurgeons(result.users)).catch(() => {});
      getVendors(token).then(result => setVendors(result.vendors)).catch(() => {});
    }
  }, [token]);

  const loadReport = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    setError('');

    try {
      switch (selectedReport) {
        case 'inventory-readiness':
          const irData = await getInventoryReadinessReport(token, filters);
          setInventoryReadinessData(irData);
          break;
        case 'verification-activity':
          const vaData = await getVerificationActivityReport(token, filters);
          setVerificationActivityData(vaData);
          break;
        case 'checklist-compliance':
          const ccData = await getChecklistComplianceReport(token, filters);
          setChecklistComplianceData(ccData);
          break;
        case 'case-summary':
          const csData = await getCaseSummaryReport(token, filters);
          setCaseSummaryData(csData);
          break;
        case 'vendor-concessions':
          const vcData = await getVendorConcessionsReport(token, filters);
          setVendorConcessionsData(vcData);
          break;
        case 'inventory-valuation':
          const ivData = await getInventoryValuationReport(token, filters);
          setInventoryValuationData(ivData);
          break;
        case 'loaner-exposure':
          const leData = await getLoanerExposureReport(token, filters);
          setLoanerExposureData(leData);
          break;
        case 'cancelled-cases':
          const ccasData = await getCancelledCasesReport(token, filters);
          setCancelledCasesData(ccasData);
          break;
        case 'case-timelines':
          const ctData = await getCaseTimelinesReport(token, filters);
          setCaseTimelinesData(ctData);
          break;
        case 'debrief-summary':
          const dsData = await getDebriefSummaryReport(token, filters);
          setDebriefSummaryData(dsData);
          break;
        case 'case-event-log':
          const celData = await getCaseEventLogReport(token, filters);
          setCaseEventLogData(celData);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, selectedReport, filters]);

  useEffect(() => {
    if (token) {
      loadReport();
    }
  }, [token, loadReport]);

  const handleExportCSV = async () => {
    if (!token) return;
    const url = getReportExportUrl(selectedReport, filters);
    // Open in new window with auth header
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${selectedReport}_${filters.startDate}_${filters.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const getReadinessBadgeClass = (state: string) => {
    switch (state) {
      case 'GREEN': return 'bg-[var(--color-green)] text-white';
      case 'ORANGE': return 'bg-[var(--color-orange)] text-white';
      case 'RED': return 'bg-[var(--color-red)] text-white';
      default: return 'bg-surface-tertiary';
    }
  };

  const getReadinessTextClass = (state: string) => {
    switch (state) {
      case 'GREEN': return 'text-[var(--color-green)]';
      case 'ORANGE': return 'text-[var(--color-orange)]';
      case 'RED': return 'text-[var(--color-red)]';
      default: return 'text-text-muted';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-[var(--color-green-bg)] text-[var(--color-green-700)]';
      case 'IN_PROGRESS': return 'bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]';
      case 'CANCELLED': return 'bg-[var(--color-red-bg)] text-[var(--color-red)]';
      default: return 'bg-surface-tertiary';
    }
  };

  return (
    <>
      <Header title="Reports" />
      <main className="container-full py-4 px-6">

        {error && (
          <div className="error-message mb-4">
            {error}
            <button onClick={() => setError('')} className="ml-4">Dismiss</button>
          </div>
        )}

        {/* Report Selection & Filters */}
        <div className="bg-surface-primary rounded-lg p-4 mb-4 border border-border">
          <div className="flex gap-4 flex-wrap mb-4">
            {REPORT_DEFINITIONS.map(report => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`px-4 py-2 rounded cursor-pointer ${
                  selectedReport === report.id
                    ? 'border-2 border-accent bg-accent text-white'
                    : 'border border-border bg-surface-primary text-text-primary'
                }`}
              >
                {report.name}
              </button>
            ))}
          </div>

          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <label className="block text-xs mb-1 text-text-secondary">Start Date</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="p-2 border border-border rounded bg-surface-primary text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-text-secondary">End Date</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="p-2 border border-border rounded bg-surface-primary text-text-primary"
              />
            </div>

            {(selectedReport === 'inventory-readiness' || selectedReport === 'case-summary') && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Surgeon</label>
                <select
                  value={filters.surgeonId || ''}
                  onChange={(e) => setFilters({ ...filters, surgeonId: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Surgeons</option>
                  {surgeons.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedReport === 'inventory-readiness' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Readiness State</label>
                <select
                  value={filters.readinessState || ''}
                  onChange={(e) => setFilters({ ...filters, readinessState: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All States</option>
                  <option value="GREEN">Green</option>
                  <option value="ORANGE">Orange</option>
                  <option value="RED">Red</option>
                </select>
              </div>
            )}

            {selectedReport === 'checklist-compliance' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Checklist Type</label>
                <select
                  value={filters.checklistType || ''}
                  onChange={(e) => setFilters({ ...filters, checklistType: (e.target.value || undefined) as 'TIMEOUT' | 'DEBRIEF' | undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Types</option>
                  <option value="TIMEOUT">Timeout</option>
                  <option value="DEBRIEF">Debrief</option>
                </select>
              </div>
            )}

            {selectedReport === 'case-summary' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="READY">Ready</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}

            {(selectedReport === 'vendor-concessions' || selectedReport === 'loaner-exposure') && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Vendor</label>
                <select
                  value={filters.vendorId || ''}
                  onChange={(e) => setFilters({ ...filters, vendorId: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Vendors</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedReport === 'vendor-concessions' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Override Reason</label>
                <select
                  value={filters.overrideReason || ''}
                  onChange={(e) => setFilters({ ...filters, overrideReason: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Reasons</option>
                  <option value="CATALOG_ERROR">Catalog Error</option>
                  <option value="NEGOTIATED_DISCOUNT">Negotiated Discount</option>
                  <option value="VENDOR_CREDIT">Vendor Credit</option>
                  <option value="DAMAGED_ITEM">Damaged Item</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            )}

            {selectedReport === 'inventory-valuation' && (
              <>
                <div>
                  <label className="block text-xs mb-1 text-text-secondary">Ownership Type</label>
                  <select
                    value={filters.ownershipType || ''}
                    onChange={(e) => setFilters({ ...filters, ownershipType: e.target.value || undefined })}
                    className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                  >
                    <option value="">All Types</option>
                    <option value="OWNED">Owned</option>
                    <option value="CONSIGNMENT">Consignment</option>
                    <option value="LOANER">Loaner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1 text-text-secondary">Category</label>
                  <select
                    value={filters.category || ''}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
                    className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                  >
                    <option value="">All Categories</option>
                    <option value="IMPLANT">Implants</option>
                    <option value="INSTRUMENT">Instruments</option>
                    <option value="CONSUMABLE">Consumables</option>
                  </select>
                </div>
              </>
            )}

            {selectedReport === 'loaner-exposure' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Status</label>
                <select
                  value={filters.isOverdue === undefined ? '' : String(filters.isOverdue)}
                  onChange={(e) => setFilters({ ...filters, isOverdue: e.target.value === '' ? undefined : e.target.value === 'true' })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Sets</option>
                  <option value="true">Overdue Only</option>
                  <option value="false">Not Overdue</option>
                </select>
              </div>
            )}

            {(selectedReport === 'cancelled-cases' || selectedReport === 'case-timelines' || selectedReport === 'debrief-summary') && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Surgeon</label>
                <select
                  value={filters.surgeonId || ''}
                  onChange={(e) => setFilters({ ...filters, surgeonId: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Surgeons</option>
                  {surgeons.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedReport === 'case-timelines' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">To Status</label>
                <select
                  value={filters.toStatus || ''}
                  onChange={(e) => setFilters({ ...filters, toStatus: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="READY">Ready</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}

            {selectedReport === 'debrief-summary' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Status</label>
                <select
                  value={filters.debriefStatus || ''}
                  onChange={(e) => setFilters({ ...filters, debriefStatus: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            )}

            {selectedReport === 'case-event-log' && (
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Event Type</label>
                <select
                  value={filters.eventType || ''}
                  onChange={(e) => setFilters({ ...filters, eventType: e.target.value || undefined })}
                  className="p-2 border border-border rounded bg-surface-primary text-text-primary"
                >
                  <option value="">All Types</option>
                  <option value="CASE_CREATED">Case Created</option>
                  <option value="CASE_ACTIVATED">Case Activated</option>
                  <option value="CASE_CANCELLED">Case Cancelled</option>
                  <option value="CASE_CARD_LINKED">Case Card Linked</option>
                  <option value="CASE_CARD_CHANGED">Case Card Changed</option>
                  <option value="READINESS_ATTESTED">Readiness Attested</option>
                  <option value="READINESS_VOIDED">Readiness Voided</option>
                  <option value="OVERRIDE_ADDED">Override Added</option>
                  <option value="OVERRIDE_MODIFIED">Override Modified</option>
                  <option value="OVERRIDE_REMOVED">Override Removed</option>
                  <option value="SCHEDULING_CHANGED">Scheduling Changed</option>
                  <option value="ANESTHESIA_PLAN_CHANGED">Anesthesia Plan Changed</option>
                </select>
              </div>
            )}

            <button onClick={loadReport} className="btn-primary">
              {isLoadingData ? 'Loading...' : 'Run Report'}
            </button>
            <button onClick={handleExportCSV} className="btn-secondary">
              Export CSV
            </button>
          </div>
        </div>

        {/* Report Results */}
        {isLoadingData ? (
          <div className="loading">Loading report data...</div>
        ) : (
          <>
            {/* Inventory Readiness Report */}
            {selectedReport === 'inventory-readiness' && inventoryReadinessData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{inventoryReadinessData.summary.totalCases}</div>
                    <div className="text-sm text-text-muted">Total Cases</div>
                  </div>
                  <div className="bg-[var(--color-green-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-green-700)]">{inventoryReadinessData.summary.greenCount}</div>
                    <div className="text-sm text-[var(--color-green-700)]">Green</div>
                  </div>
                  <div className="bg-[var(--color-orange-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-orange-700)]">{inventoryReadinessData.summary.orangeCount}</div>
                    <div className="text-sm text-[var(--color-orange-700)]">Orange</div>
                  </div>
                  <div className="bg-[var(--color-red-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-red)]">{inventoryReadinessData.summary.redCount}</div>
                    <div className="text-sm text-[var(--color-red)]">Red</div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{inventoryReadinessData.summary.attestedCount}</div>
                    <div className="text-sm text-text-muted">Attested</div>
                  </div>
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">OR</th>
                        <th className="p-3 text-center border-b border-border">State</th>
                        <th className="p-3 text-center border-b border-border">Verified</th>
                        <th className="p-3 text-center border-b border-border">Missing</th>
                        <th className="p-3 text-center border-b border-border">Attested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryReadinessData.rows.map((row) => (
                        <tr key={row.caseId} className="border-b border-border">
                          <td className="p-3">{row.scheduledDate}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.surgeonName}</td>
                          <td className="p-3 text-center">{row.orRoom || '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${getReadinessBadgeClass(row.readinessState)}`}>
                              {row.readinessState}
                            </span>
                          </td>
                          <td className="p-3 text-center">{row.totalVerified}/{row.totalRequired}</td>
                          <td className={`p-3 text-center ${row.missingCount > 0 ? 'text-[var(--color-red)]' : ''}`}>
                            {row.missingCount}
                          </td>
                          <td className="p-3 text-center">
                            {row.attestationState === 'ATTESTED' ? 'Yes' : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Verification Activity Report */}
            {selectedReport === 'verification-activity' && verificationActivityData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{verificationActivityData.summary.totalEvents}</div>
                    <div className="text-sm text-text-muted">Total Events</div>
                  </div>
                  {verificationActivityData.summary.byType.slice(0, 4).map(t => (
                    <div key={t.eventType} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-text-primary">{t.count}</div>
                      <div className="text-sm text-text-muted">{t.eventType}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Time</th>
                        <th className="p-3 text-left border-b border-border">Event Type</th>
                        <th className="p-3 text-left border-b border-border">Item</th>
                        <th className="p-3 text-left border-b border-border">Category</th>
                        <th className="p-3 text-left border-b border-border">Performed By</th>
                        <th className="p-3 text-left border-b border-border">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationActivityData.rows.map((row) => (
                        <tr key={row.eventId} className="border-b border-border">
                          <td className="p-3">{row.occurredDate}</td>
                          <td className="p-3">{row.occurredAt.split(' ')[1]?.substring(0, 5) || ''}</td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${row.eventType === 'VERIFIED' ? 'bg-[var(--color-green-bg)]' : 'bg-surface-tertiary'}`}>
                              {row.eventType}
                            </span>
                          </td>
                          <td className="p-3">{row.catalogName}</td>
                          <td className="p-3">{row.category}</td>
                          <td className="p-3">{row.performedByName}</td>
                          <td className="p-3">{row.locationName || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Checklist Compliance Report */}
            {selectedReport === 'checklist-compliance' && checklistComplianceData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg">
                    <h3 className="m-0 mb-2 text-base text-text-primary">Timeout Checklists</h3>
                    <div className="text-3xl font-bold text-text-primary">{checklistComplianceData.summary.timeout.completionRate}%</div>
                    <div className="text-sm text-text-muted">
                      {checklistComplianceData.summary.timeout.completed} / {checklistComplianceData.summary.timeout.total} completed
                    </div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg">
                    <h3 className="m-0 mb-2 text-base text-text-primary">Debrief Checklists</h3>
                    <div className="text-3xl font-bold text-text-primary">{checklistComplianceData.summary.debrief.completionRate}%</div>
                    <div className="text-sm text-text-muted">
                      {checklistComplianceData.summary.debrief.completed} / {checklistComplianceData.summary.debrief.total} completed
                    </div>
                    {checklistComplianceData.summary.debrief.pendingReviews > 0 && (
                      <div className="text-sm text-[var(--color-orange)] mt-1">
                        {checklistComplianceData.summary.debrief.pendingReviews} pending reviews
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Type</th>
                        <th className="p-3 text-center border-b border-border">Status</th>
                        <th className="p-3 text-center border-b border-border">Circulator</th>
                        <th className="p-3 text-center border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">Scrub</th>
                        <th className="p-3 text-center border-b border-border">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistComplianceData.rows.map((row, idx) => (
                        <tr key={`${row.caseId}-${row.checklistType}-${idx}`} className="border-b border-border">
                          <td className="p-3">{row.scheduledDate}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.checklistType}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadgeClass(row.checklistStatus)}`}>
                              {row.checklistStatus}
                            </span>
                          </td>
                          <td className={`p-3 text-center ${row.circulatorSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'}`}>
                            {row.circulatorSigned}
                          </td>
                          <td className={`p-3 text-center ${row.surgeonSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'}`}>
                            {row.surgeonSigned}
                          </td>
                          <td className={`p-3 text-center ${row.scrubSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'}`}>
                            {row.scrubSigned}
                          </td>
                          <td className="p-3 text-center">
                            {(row.pendingScrubReview === 'Yes' || row.pendingSurgeonReview === 'Yes') && (
                              <span className="text-[var(--color-orange)]">
                                {row.pendingScrubReview === 'Yes' && 'Scrub '}
                                {row.pendingSurgeonReview === 'Yes' && 'Surgeon'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Case Summary Report */}
            {selectedReport === 'case-summary' && caseSummaryData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{caseSummaryData.summary.totalCases}</div>
                    <div className="text-sm text-text-muted">Total</div>
                  </div>
                  {caseSummaryData.summary.byStatus.map(s => (
                    <div key={s.status} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold text-text-primary">{s.count}</div>
                      <div className="text-xs text-text-muted">{s.status}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">OR</th>
                        <th className="p-3 text-center border-b border-border">Status</th>
                        <th className="p-3 text-center border-b border-border">Readiness</th>
                        <th className="p-3 text-center border-b border-border">Pref Card</th>
                        <th className="p-3 text-center border-b border-border">Checklists</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseSummaryData.rows.map((row) => (
                        <tr key={row.caseId} className={`border-b border-border ${row.isCancelled === 'Yes' ? 'opacity-50' : ''}`}>
                          <td className="p-3">{row.scheduledDate}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.surgeonName}</td>
                          <td className="p-3 text-center">{row.orRoom || '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadgeClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={getReadinessTextClass(row.readinessState)}>{row.readinessState}</span>
                          </td>
                          <td className="p-3 text-center">{row.caseCardName ? 'Yes' : 'No'}</td>
                          <td className="p-3 text-center">{row.checklistsCompleted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Vendor Concessions Report */}
            {selectedReport === 'vendor-concessions' && vendorConcessionsData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{vendorConcessionsData.summary.totalEvents}</div>
                    <div className="text-sm text-text-muted">Total Events</div>
                  </div>
                  <div className="bg-[var(--color-green-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-green-700)]">{vendorConcessionsData.summary.totalSavings.dollars}</div>
                    <div className="text-sm text-[var(--color-green-700)]">Total Savings</div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{vendorConcessionsData.summary.totalCatalogValue.dollars}</div>
                    <div className="text-sm text-text-muted">Catalog Value</div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{vendorConcessionsData.summary.totalActualCost.dollars}</div>
                    <div className="text-sm text-text-muted">Actual Cost</div>
                  </div>
                  <div className="bg-[var(--color-blue-100)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-blue-600)]">{vendorConcessionsData.summary.gratisCount}</div>
                    <div className="text-sm text-[var(--color-blue-600)]">Gratis Items</div>
                  </div>
                </div>

                {vendorConcessionsData.summary.byVendor.length > 0 && (
                  <div className="bg-surface-primary p-4 rounded-lg mb-4">
                    <h3 className="m-0 mb-2 text-sm text-text-primary">Savings by Vendor</h3>
                    <div className="flex gap-4 flex-wrap">
                      {vendorConcessionsData.summary.byVendor.map(v => (
                        <div key={v.vendorName} className="p-2 bg-surface-secondary rounded">
                          <div className="font-medium text-text-primary">{v.vendorName}</div>
                          <div className="text-[var(--color-green)]">{v.savingsDollars} ({v.count} items)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Vendor</th>
                        <th className="p-3 text-left border-b border-border">Item</th>
                        <th className="p-3 text-left border-b border-border">Case</th>
                        <th className="p-3 text-right border-b border-border">Catalog</th>
                        <th className="p-3 text-right border-b border-border">Actual</th>
                        <th className="p-3 text-right border-b border-border">Savings</th>
                        <th className="p-3 text-center border-b border-border">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorConcessionsData.rows.map((row) => (
                        <tr key={row.eventId} className="border-b border-border">
                          <td className="p-3">{row.occurredAt.split(' ')[0]}</td>
                          <td className="p-3">{row.vendorName}</td>
                          <td className="p-3">{row.catalogName}</td>
                          <td className="p-3">{row.caseName || '-'}</td>
                          <td className="p-3 text-right">{row.catalogCostDollars}</td>
                          <td className="p-3 text-right">{row.actualCostDollars}</td>
                          <td className="p-3 text-right text-[var(--color-green)] font-medium">{row.savingsDollars}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${row.isGratis === 'Yes' ? 'bg-[var(--color-blue-100)]' : 'bg-surface-tertiary'}`}>
                              {row.isGratis === 'Yes' ? 'GRATIS' : row.overrideReason || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Inventory Valuation Report */}
            {selectedReport === 'inventory-valuation' && inventoryValuationData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{inventoryValuationData.summary.totalItems}</div>
                    <div className="text-sm text-text-muted">Total Items</div>
                  </div>
                  <div className="bg-[var(--color-green-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-green-700)]">{inventoryValuationData.summary.totalValue.dollars}</div>
                    <div className="text-sm text-[var(--color-green-700)]">Total Value</div>
                  </div>
                  {inventoryValuationData.summary.byOwnershipType.map(o => (
                    <div key={o.ownershipType} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-text-primary">{o.valueDollars}</div>
                      <div className="text-sm text-text-muted">{o.ownershipType} ({o.itemCount})</div>
                    </div>
                  ))}
                </div>

                {inventoryValuationData.summary.byCategory.length > 0 && (
                  <div className="bg-surface-primary p-4 rounded-lg mb-4">
                    <h3 className="m-0 mb-2 text-sm text-text-primary">Value by Category</h3>
                    <div className="flex gap-4 flex-wrap">
                      {inventoryValuationData.summary.byCategory.map(c => (
                        <div key={c.category} className="p-2 bg-surface-secondary rounded">
                          <div className="font-medium text-text-primary">{c.category}</div>
                          <div className="text-text-muted">{c.valueDollars} ({c.itemCount} items)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Item</th>
                        <th className="p-3 text-left border-b border-border">Category</th>
                        <th className="p-3 text-left border-b border-border">Manufacturer</th>
                        <th className="p-3 text-left border-b border-border">Barcode</th>
                        <th className="p-3 text-center border-b border-border">Ownership</th>
                        <th className="p-3 text-center border-b border-border">Status</th>
                        <th className="p-3 text-left border-b border-border">Expires</th>
                        <th className="p-3 text-right border-b border-border">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryValuationData.rows.map((row) => (
                        <tr key={row.itemId} className="border-b border-border">
                          <td className="p-3">{row.catalogName}</td>
                          <td className="p-3">{row.category}</td>
                          <td className="p-3">{row.manufacturer || '-'}</td>
                          <td className="p-3 font-mono text-xs">{row.barcode}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${row.ownershipType === 'OWNED' ? 'bg-[var(--color-green-bg)]' : row.ownershipType === 'CONSIGNMENT' ? 'bg-[var(--color-orange-bg)]' : 'bg-surface-tertiary'}`}>
                              {row.ownershipType}
                            </span>
                          </td>
                          <td className="p-3 text-center">{row.availabilityStatus}</td>
                          <td className="p-3">{row.expiresAt || '-'}</td>
                          <td className="p-3 text-right font-medium">{row.unitCostDollars}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Loaner Exposure Report */}
            {selectedReport === 'loaner-exposure' && loanerExposureData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-text-primary">{loanerExposureData.summary.totalOpenSets}</div>
                    <div className="text-sm text-text-muted">Open Sets</div>
                  </div>
                  <div className="bg-[var(--color-orange-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-orange-700)]">{loanerExposureData.summary.totalEstimatedValue.dollars}</div>
                    <div className="text-sm text-[var(--color-orange-700)]">Total Exposure</div>
                  </div>
                  <div className="bg-[var(--color-red-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-red)]">{loanerExposureData.summary.overdueCount}</div>
                    <div className="text-sm text-[var(--color-red)]">Overdue Sets</div>
                  </div>
                  <div className="bg-[var(--color-red-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-red)]">{loanerExposureData.summary.overdueValue.dollars}</div>
                    <div className="text-sm text-[var(--color-red)]">Overdue Value</div>
                  </div>
                </div>

                {loanerExposureData.summary.byVendor.length > 0 && (
                  <div className="bg-surface-primary p-4 rounded-lg mb-4">
                    <h3 className="m-0 mb-2 text-sm text-text-primary">Exposure by Vendor</h3>
                    <div className="flex gap-4 flex-wrap">
                      {loanerExposureData.summary.byVendor.map(v => (
                        <div key={v.vendorName} className="p-2 bg-surface-secondary rounded">
                          <div className="font-medium text-text-primary">{v.vendorName}</div>
                          <div className="text-text-muted">{v.valueDollars} ({v.openSets} open, {v.overdueSets} overdue)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Set ID</th>
                        <th className="p-3 text-left border-b border-border">Vendor</th>
                        <th className="p-3 text-left border-b border-border">Case</th>
                        <th className="p-3 text-left border-b border-border">Received</th>
                        <th className="p-3 text-left border-b border-border">Due</th>
                        <th className="p-3 text-center border-b border-border">Items</th>
                        <th className="p-3 text-right border-b border-border">Value</th>
                        <th className="p-3 text-center border-b border-border">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanerExposureData.rows.map((row) => (
                        <tr key={row.loanerSetId} className={`border-b border-border ${row.isOverdue === 'Yes' ? 'bg-[var(--color-red-50)]' : ''}`}>
                          <td className="p-3 font-mono text-xs">{row.setIdentifier}</td>
                          <td className="p-3">{row.vendorName}</td>
                          <td className="p-3">{row.caseName || '-'}</td>
                          <td className="p-3">{row.receivedAt?.split('T')[0] || '-'}</td>
                          <td className="p-3">{row.expectedReturnDate || '-'}</td>
                          <td className="p-3 text-center">{row.actualItemCount || row.declaredItemCount || '-'}</td>
                          <td className="p-3 text-right font-medium">{row.estimatedValueDollars}</td>
                          <td className="p-3 text-center">
                            {row.isOverdue === 'Yes' ? (
                              <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-[var(--color-red-bg)] text-[var(--color-red)]">
                                {row.daysOverdue}d OVERDUE
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-1 rounded text-xs bg-[var(--color-green-bg)]">
                                Open
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Cancelled Cases Report */}
            {selectedReport === 'cancelled-cases' && cancelledCasesData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-[var(--color-red-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-red)]">{cancelledCasesData.summary.totalCancelled}</div>
                    <div className="text-sm text-[var(--color-red)]">Total Cancelled</div>
                  </div>
                  {cancelledCasesData.summary.bySurgeon.slice(0, 4).map(s => (
                    <div key={s.surgeonName} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold">{s.count}</div>
                      <div className="text-xs text-text-muted">{s.surgeonName}</div>
                    </div>
                  ))}
                </div>

                {cancelledCasesData.summary.byPriorStatus.length > 0 && (
                  <div className="bg-surface-primary p-4 rounded-lg mb-4">
                    <h3 className="m-0 mb-2 text-sm">By Prior Status</h3>
                    <div className="flex gap-4 flex-wrap">
                      {cancelledCasesData.summary.byPriorStatus.map(s => (
                        <div key={s.status} className="p-2 bg-surface-secondary rounded">
                          <div className="font-medium">{s.status}</div>
                          <div className="text-text-muted">{s.count} cases</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">OR</th>
                        <th className="p-3 text-center border-b border-border">Prior Status</th>
                        <th className="p-3 text-left border-b border-border">Reason</th>
                        <th className="p-3 text-left border-b border-border">Cancelled By</th>
                        <th className="p-3 text-left border-b border-border">Cancelled At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledCasesData.rows.map((row) => (
                        <tr key={row.caseId} className="border-b border-border">
                          <td className="p-3">{row.scheduledDate}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.surgeonName}</td>
                          <td className="p-3 text-center">{row.orRoom || '-'}</td>
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-1 rounded bg-surface-tertiary text-xs">
                              {row.priorStatus}
                            </span>
                          </td>
                          <td className="p-3">{row.cancellationReason || '-'}</td>
                          <td className="p-3">{row.cancelledByName}</td>
                          <td className="p-3">{row.cancelledAt.split(' ')[0] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Case Timelines Report */}
            {selectedReport === 'case-timelines' && caseTimelinesData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold">{caseTimelinesData.summary.totalTransitions}</div>
                    <div className="text-sm text-text-muted">Total Transitions</div>
                  </div>
                  {caseTimelinesData.summary.byTransition.slice(0, 4).map(t => (
                    <div key={t.transition} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold">{t.count}</div>
                      <div className="text-[0.7rem] text-text-muted">{t.transition}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Time</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">From</th>
                        <th className="p-3 text-center border-b border-border">To</th>
                        <th className="p-3 text-left border-b border-border">Reason</th>
                        <th className="p-3 text-left border-b border-border">Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseTimelinesData.rows.map((row) => (
                        <tr key={row.eventId} className="border-b border-border">
                          <td className="p-3 whitespace-nowrap">{row.occurredAt}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.surgeonName}</td>
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-1 rounded bg-surface-tertiary text-xs">
                              {row.fromStatus}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${
                              row.toStatus === 'CANCELLED' ? 'bg-[var(--color-red-bg)]' : row.toStatus === 'COMPLETED' ? 'bg-[var(--color-green-bg)]' : 'bg-[var(--color-orange-bg)]'
                            }`}>
                              {row.toStatus}
                            </span>
                          </td>
                          <td className="p-3">{row.reason || '-'}</td>
                          <td className="p-3">{row.actorName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Debrief Summary Report */}
            {selectedReport === 'debrief-summary' && debriefSummaryData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold">{debriefSummaryData.summary.totalDebriefs}</div>
                    <div className="text-sm text-text-muted">Total Debriefs</div>
                  </div>
                  <div className="bg-[var(--color-green-bg)] p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-[var(--color-green-700)]">{debriefSummaryData.summary.completionRate}%</div>
                    <div className="text-sm text-[var(--color-green-700)]">Completion Rate</div>
                  </div>
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold">{debriefSummaryData.summary.avgDurationMinutes}m</div>
                    <div className="text-sm text-text-muted">Avg Duration</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${debriefSummaryData.summary.pendingCount > 0 ? 'bg-[var(--color-orange-bg)]' : 'bg-surface-primary'}`}>
                    <div className={`text-3xl font-bold ${debriefSummaryData.summary.pendingCount > 0 ? 'text-[var(--color-orange-700)]' : ''}`}>{debriefSummaryData.summary.pendingCount}</div>
                    <div className={`text-sm ${debriefSummaryData.summary.pendingCount > 0 ? 'text-[var(--color-orange-700)]' : 'text-text-muted'}`}>Pending Reviews</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${debriefSummaryData.summary.flaggedCount > 0 ? 'bg-[var(--color-red-bg)]' : 'bg-surface-primary'}`}>
                    <div className={`text-3xl font-bold ${debriefSummaryData.summary.flaggedCount > 0 ? 'text-[var(--color-red)]' : ''}`}>{debriefSummaryData.summary.flaggedCount}</div>
                    <div className={`text-sm ${debriefSummaryData.summary.flaggedCount > 0 ? 'text-[var(--color-red)]' : 'text-text-muted'}`}>Flagged</div>
                  </div>
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Date</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">Surgeon</th>
                        <th className="p-3 text-center border-b border-border">Status</th>
                        <th className="p-3 text-left border-b border-border">Started</th>
                        <th className="p-3 text-left border-b border-border">Completed</th>
                        <th className="p-3 text-center border-b border-border">Duration</th>
                        <th className="p-3 text-center border-b border-border">Signatures</th>
                        <th className="p-3 text-center border-b border-border">Pending</th>
                        <th className="p-3 text-center border-b border-border">Flagged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debriefSummaryData.rows.map((row) => (
                        <tr key={row.caseId} className={`border-b border-border ${row.flagged === 'Yes' ? 'bg-[var(--color-red-50)]' : ''}`}>
                          <td className="p-3">{row.scheduledDate}</td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.surgeonName}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadgeClass(row.checklistStatus)}`}>
                              {row.checklistStatus}
                            </span>
                          </td>
                          <td className="p-3 text-xs">{row.startedAt || '-'}</td>
                          <td className="p-3 text-xs">{row.completedAt || '-'}</td>
                          <td className="p-3 text-center">{row.durationMinutes !== '' ? `${row.durationMinutes}m` : '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`mr-1 ${row.circulatorSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'}`} title="Circulator">C</span>
                            <span className={`mr-1 ${row.surgeonSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'}`} title="Surgeon">S</span>
                            <span className={row.scrubSigned === 'Yes' ? 'text-[var(--color-green)]' : 'text-text-muted'} title="Scrub">Sc</span>
                          </td>
                          <td className="p-3 text-center">
                            {row.pendingReviews !== 'None' ? (
                              <span className="text-[var(--color-orange)] text-xs">{row.pendingReviews}</span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {row.flagged === 'Yes' ? (
                              <span className="text-[var(--color-red)] font-medium">Yes</span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Case Event Log Report */}
            {selectedReport === 'case-event-log' && caseEventLogData && (
              <>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-4">
                  <div className="bg-surface-primary p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold">{caseEventLogData.summary.totalEvents}</div>
                    <div className="text-sm text-text-muted">Total Events</div>
                  </div>
                  {caseEventLogData.summary.byEventType.slice(0, 4).map(t => (
                    <div key={t.eventType} className="bg-surface-primary p-4 rounded-lg text-center">
                      <div className="text-3xl font-bold">{t.count}</div>
                      <div className="text-[0.7rem] text-text-muted">{t.eventType.replace(/_/g, ' ')}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-surface-primary rounded-lg overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="p-3 text-left border-b border-border">Time</th>
                        <th className="p-3 text-left border-b border-border">Event Type</th>
                        <th className="p-3 text-left border-b border-border">Procedure</th>
                        <th className="p-3 text-left border-b border-border">User</th>
                        <th className="p-3 text-center border-b border-border">Role</th>
                        <th className="p-3 text-left border-b border-border">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseEventLogData.rows.map((row) => (
                        <tr key={row.eventId} className="border-b border-border">
                          <td className="p-3 whitespace-nowrap">{row.occurredAt}</td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${
                              row.eventType.includes('CANCEL') ? 'bg-[var(--color-red-bg)]' : row.eventType.includes('ATTEST') ? 'bg-[var(--color-green-bg)]' : 'bg-surface-tertiary'
                            }`}>
                              {row.eventType.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3">{row.procedureName}</td>
                          <td className="p-3">{row.userName}</td>
                          <td className="p-3 text-center text-xs">{row.userRole}</td>
                          <td className="p-3 max-w-[300px] overflow-hidden text-ellipsis">{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
