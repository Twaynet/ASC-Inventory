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
  type ReportFilters,
  type FinancialReportFilters,
} from '@/lib/api';
import { getVendors, type Vendor } from '@/lib/api/vendors';

type ReportType = 'inventory-readiness' | 'verification-activity' | 'checklist-compliance' | 'case-summary' | 'vendor-concessions' | 'inventory-valuation' | 'loaner-exposure';

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
];

export default function AdminReportsPage() {
  const { user, token } = useAuth();

  const [selectedReport, setSelectedReport] = useState<ReportType>('inventory-readiness');
  const [filters, setFilters] = useState<ReportFilters & FinancialReportFilters>({
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

  const getReadinessColor = (state: string) => {
    switch (state) {
      case 'GREEN': return '#38a169';
      case 'ORANGE': return '#dd6b20';
      case 'RED': return '#e53e3e';
      default: return '#718096';
    }
  };

  return (
    <>
      <Header title="Reports" />
      <main className="admin-main" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>

        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: '1rem' }}>Dismiss</button>
          </div>
        )}

        {/* Report Selection & Filters */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {REPORT_DEFINITIONS.map(report => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: selectedReport === report.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedReport === report.id ? 'var(--primary)' : 'var(--surface)',
                  color: selectedReport === report.id ? 'white' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                {report.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Start Date</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                style={{ padding: '0.5rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>End Date</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                style={{ padding: '0.5rem' }}
              />
            </div>

            {(selectedReport === 'inventory-readiness' || selectedReport === 'case-summary') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Surgeon</label>
                <select
                  value={filters.surgeonId || ''}
                  onChange={(e) => setFilters({ ...filters, surgeonId: e.target.value || undefined })}
                  style={{ padding: '0.5rem' }}
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
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Readiness State</label>
                <select
                  value={filters.readinessState || ''}
                  onChange={(e) => setFilters({ ...filters, readinessState: e.target.value || undefined })}
                  style={{ padding: '0.5rem' }}
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
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Checklist Type</label>
                <select
                  value={filters.checklistType || ''}
                  onChange={(e) => setFilters({ ...filters, checklistType: (e.target.value || undefined) as 'TIMEOUT' | 'DEBRIEF' | undefined })}
                  style={{ padding: '0.5rem' }}
                >
                  <option value="">All Types</option>
                  <option value="TIMEOUT">Timeout</option>
                  <option value="DEBRIEF">Debrief</option>
                </select>
              </div>
            )}

            {selectedReport === 'case-summary' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Status</label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                  style={{ padding: '0.5rem' }}
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
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Vendor</label>
                <select
                  value={filters.vendorId || ''}
                  onChange={(e) => setFilters({ ...filters, vendorId: e.target.value || undefined })}
                  style={{ padding: '0.5rem' }}
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
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Override Reason</label>
                <select
                  value={filters.overrideReason || ''}
                  onChange={(e) => setFilters({ ...filters, overrideReason: e.target.value || undefined })}
                  style={{ padding: '0.5rem' }}
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
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Ownership Type</label>
                  <select
                    value={filters.ownershipType || ''}
                    onChange={(e) => setFilters({ ...filters, ownershipType: e.target.value || undefined })}
                    style={{ padding: '0.5rem' }}
                  >
                    <option value="">All Types</option>
                    <option value="OWNED">Owned</option>
                    <option value="CONSIGNMENT">Consignment</option>
                    <option value="LOANER">Loaner</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Category</label>
                  <select
                    value={filters.category || ''}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
                    style={{ padding: '0.5rem' }}
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
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Status</label>
                <select
                  value={filters.isOverdue === undefined ? '' : String(filters.isOverdue)}
                  onChange={(e) => setFilters({ ...filters, isOverdue: e.target.value === '' ? undefined : e.target.value === 'true' })}
                  style={{ padding: '0.5rem' }}
                >
                  <option value="">All Sets</option>
                  <option value="true">Overdue Only</option>
                  <option value="false">Not Overdue</option>
                </select>
              </div>
            )}

            <button onClick={loadReport} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
              {isLoadingData ? 'Loading...' : 'Run Report'}
            </button>
            <button onClick={handleExportCSV} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{inventoryReadinessData.summary.totalCases}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Cases</div>
                  </div>
                  <div style={{ background: '#c6f6d5', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#276749' }}>{inventoryReadinessData.summary.greenCount}</div>
                    <div style={{ fontSize: '0.875rem', color: '#276749' }}>Green</div>
                  </div>
                  <div style={{ background: '#feebc8', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c05621' }}>{inventoryReadinessData.summary.orangeCount}</div>
                    <div style={{ fontSize: '0.875rem', color: '#c05621' }}>Orange</div>
                  </div>
                  <div style={{ background: '#fed7d7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c53030' }}>{inventoryReadinessData.summary.redCount}</div>
                    <div style={{ fontSize: '0.875rem', color: '#c53030' }}>Red</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{inventoryReadinessData.summary.attestedCount}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Attested</div>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Procedure</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Surgeon</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>OR</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>State</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Verified</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Missing</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Attested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryReadinessData.rows.map((row) => (
                        <tr key={row.caseId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{row.scheduledDate}</td>
                          <td style={{ padding: '0.75rem' }}>{row.procedureName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.surgeonName}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.orRoom || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: getReadinessColor(row.readinessState),
                              color: 'white',
                              fontSize: '0.75rem',
                            }}>
                              {row.readinessState}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.totalVerified}/{row.totalRequired}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: row.missingCount > 0 ? '#c53030' : 'inherit' }}>
                            {row.missingCount}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{verificationActivityData.summary.totalEvents}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Events</div>
                  </div>
                  {verificationActivityData.summary.byType.slice(0, 4).map(t => (
                    <div key={t.eventType} style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{t.count}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t.eventType}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Time</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Event Type</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Item</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Category</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Performed By</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationActivityData.rows.map((row) => (
                        <tr key={row.eventId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{row.occurredDate}</td>
                          <td style={{ padding: '0.75rem' }}>{row.occurredAt.split(' ')[1]?.substring(0, 5) || ''}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: row.eventType === 'VERIFIED' ? '#c6f6d5' : '#e2e8f0',
                              fontSize: '0.75rem',
                            }}>
                              {row.eventType}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>{row.catalogName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.category}</td>
                          <td style={{ padding: '0.75rem' }}>{row.performedByName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.locationName || '-'}</td>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Timeout Checklists</h3>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{checklistComplianceData.summary.timeout.completionRate}%</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {checklistComplianceData.summary.timeout.completed} / {checklistComplianceData.summary.timeout.total} completed
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Debrief Checklists</h3>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{checklistComplianceData.summary.debrief.completionRate}%</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {checklistComplianceData.summary.debrief.completed} / {checklistComplianceData.summary.debrief.total} completed
                    </div>
                    {checklistComplianceData.summary.debrief.pendingReviews > 0 && (
                      <div style={{ fontSize: '0.875rem', color: '#dd6b20', marginTop: '0.25rem' }}>
                        {checklistComplianceData.summary.debrief.pendingReviews} pending reviews
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Procedure</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Type</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Circulator</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Surgeon</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Scrub</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistComplianceData.rows.map((row, idx) => (
                        <tr key={`${row.caseId}-${row.checklistType}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{row.scheduledDate}</td>
                          <td style={{ padding: '0.75rem' }}>{row.procedureName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.checklistType}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: row.checklistStatus === 'COMPLETED' ? '#c6f6d5' : row.checklistStatus === 'IN_PROGRESS' ? '#feebc8' : '#e2e8f0',
                              fontSize: '0.75rem',
                            }}>
                              {row.checklistStatus}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: row.circulatorSigned === 'Yes' ? '#38a169' : '#718096' }}>
                            {row.circulatorSigned}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: row.surgeonSigned === 'Yes' ? '#38a169' : '#718096' }}>
                            {row.surgeonSigned}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: row.scrubSigned === 'Yes' ? '#38a169' : '#718096' }}>
                            {row.scrubSigned}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {(row.pendingScrubReview === 'Yes' || row.pendingSurgeonReview === 'Yes') && (
                              <span style={{ color: '#dd6b20' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{caseSummaryData.summary.totalCases}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total</div>
                  </div>
                  {caseSummaryData.summary.byStatus.map(s => (
                    <div key={s.status} style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{s.count}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.status}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Procedure</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Surgeon</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>OR</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Readiness</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Pref Card</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Checklists</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseSummaryData.rows.map((row) => (
                        <tr key={row.caseId} style={{ borderBottom: '1px solid var(--border)', opacity: row.isCancelled === 'Yes' ? 0.5 : 1 }}>
                          <td style={{ padding: '0.75rem' }}>{row.scheduledDate}</td>
                          <td style={{ padding: '0.75rem' }}>{row.procedureName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.surgeonName}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.orRoom || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: row.status === 'COMPLETED' ? '#c6f6d5' : row.status === 'CANCELLED' ? '#fed7d7' : '#e2e8f0',
                              fontSize: '0.75rem',
                            }}>
                              {row.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{ color: getReadinessColor(row.readinessState) }}>{row.readinessState}</span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.caseCardName ? 'Yes' : 'No'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.checklistsCompleted}</td>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{vendorConcessionsData.summary.totalEvents}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Events</div>
                  </div>
                  <div style={{ background: '#c6f6d5', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#276749' }}>{vendorConcessionsData.summary.totalSavings.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: '#276749' }}>Total Savings</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{vendorConcessionsData.summary.totalCatalogValue.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Catalog Value</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{vendorConcessionsData.summary.totalActualCost.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Actual Cost</div>
                  </div>
                  <div style={{ background: '#ebf8ff', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2b6cb0' }}>{vendorConcessionsData.summary.gratisCount}</div>
                    <div style={{ fontSize: '0.875rem', color: '#2b6cb0' }}>Gratis Items</div>
                  </div>
                </div>

                {/* Savings by Vendor */}
                {vendorConcessionsData.summary.byVendor.length > 0 && (
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>Savings by Vendor</h3>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {vendorConcessionsData.summary.byVendor.map(v => (
                        <div key={v.vendorName} style={{ padding: '0.5rem', background: '#f7fafc', borderRadius: '4px' }}>
                          <div style={{ fontWeight: '500' }}>{v.vendorName}</div>
                          <div style={{ color: '#38a169' }}>{v.savingsDollars} ({v.count} items)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Vendor</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Item</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Case</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Catalog</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Actual</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Savings</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorConcessionsData.rows.map((row) => (
                        <tr key={row.eventId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{row.occurredAt.split(' ')[0]}</td>
                          <td style={{ padding: '0.75rem' }}>{row.vendorName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.catalogName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.caseName || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>{row.catalogCostDollars}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>{row.actualCostDollars}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#38a169', fontWeight: '500' }}>{row.savingsDollars}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: row.isGratis === 'Yes' ? '#ebf8ff' : '#e2e8f0',
                              fontSize: '0.75rem',
                            }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{inventoryValuationData.summary.totalItems}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Items</div>
                  </div>
                  <div style={{ background: '#c6f6d5', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#276749' }}>{inventoryValuationData.summary.totalValue.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: '#276749' }}>Total Value</div>
                  </div>
                  {inventoryValuationData.summary.byOwnershipType.map(o => (
                    <div key={o.ownershipType} style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{o.valueDollars}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{o.ownershipType} ({o.itemCount})</div>
                    </div>
                  ))}
                </div>

                {/* Value by Category */}
                {inventoryValuationData.summary.byCategory.length > 0 && (
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>Value by Category</h3>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {inventoryValuationData.summary.byCategory.map(c => (
                        <div key={c.category} style={{ padding: '0.5rem', background: '#f7fafc', borderRadius: '4px' }}>
                          <div style={{ fontWeight: '500' }}>{c.category}</div>
                          <div style={{ color: '#718096' }}>{c.valueDollars} ({c.itemCount} items)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Item</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Category</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Manufacturer</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Barcode</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Ownership</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Expires</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryValuationData.rows.map((row) => (
                        <tr key={row.itemId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{row.catalogName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.category}</td>
                          <td style={{ padding: '0.75rem' }}>{row.manufacturer || '-'}</td>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.barcode}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: row.ownershipType === 'OWNED' ? '#c6f6d5' : row.ownershipType === 'CONSIGNMENT' ? '#feebc8' : '#e2e8f0',
                              fontSize: '0.75rem',
                            }}>
                              {row.ownershipType}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.availabilityStatus}</td>
                          <td style={{ padding: '0.75rem' }}>{row.expiresAt || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>{row.unitCostDollars}</td>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{loanerExposureData.summary.totalOpenSets}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Open Sets</div>
                  </div>
                  <div style={{ background: '#feebc8', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c05621' }}>{loanerExposureData.summary.totalEstimatedValue.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: '#c05621' }}>Total Exposure</div>
                  </div>
                  <div style={{ background: '#fed7d7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c53030' }}>{loanerExposureData.summary.overdueCount}</div>
                    <div style={{ fontSize: '0.875rem', color: '#c53030' }}>Overdue Sets</div>
                  </div>
                  <div style={{ background: '#fed7d7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c53030' }}>{loanerExposureData.summary.overdueValue.dollars}</div>
                    <div style={{ fontSize: '0.875rem', color: '#c53030' }}>Overdue Value</div>
                  </div>
                </div>

                {/* Exposure by Vendor */}
                {loanerExposureData.summary.byVendor.length > 0 && (
                  <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>Exposure by Vendor</h3>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {loanerExposureData.summary.byVendor.map(v => (
                        <div key={v.vendorName} style={{ padding: '0.5rem', background: '#f7fafc', borderRadius: '4px' }}>
                          <div style={{ fontWeight: '500' }}>{v.vendorName}</div>
                          <div style={{ color: '#718096' }}>{v.valueDollars} ({v.openSets} open, {v.overdueSets} overdue)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--surface)', borderRadius: '8px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Set ID</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Vendor</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Case</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Received</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Due</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Items</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Value</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanerExposureData.rows.map((row) => (
                        <tr key={row.loanerSetId} style={{ borderBottom: '1px solid var(--border)', background: row.isOverdue === 'Yes' ? '#fff5f5' : 'transparent' }}>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.setIdentifier}</td>
                          <td style={{ padding: '0.75rem' }}>{row.vendorName}</td>
                          <td style={{ padding: '0.75rem' }}>{row.caseName || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>{row.receivedAt?.split('T')[0] || '-'}</td>
                          <td style={{ padding: '0.75rem' }}>{row.expectedReturnDate || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.actualItemCount || row.declaredItemCount || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>{row.estimatedValueDollars}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {row.isOverdue === 'Yes' ? (
                              <span style={{
                                display: 'inline-block',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                background: '#fed7d7',
                                color: '#c53030',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                              }}>
                                {row.daysOverdue}d OVERDUE
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-block',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                background: '#c6f6d5',
                                fontSize: '0.75rem',
                              }}>
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
          </>
        )}
      </main>
    </>
  );
}
