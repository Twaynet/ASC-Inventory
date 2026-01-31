'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryReadinessReport,
  getVerificationActivityReport,
  getChecklistComplianceReport,
  getCaseSummaryReport,
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
  type ReportFilters,
} from '@/lib/api';

type ReportType = 'inventory-readiness' | 'verification-activity' | 'checklist-compliance' | 'case-summary';

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
];

export default function AdminReportsPage() {
  const { user, token } = useAuth();

  const [selectedReport, setSelectedReport] = useState<ReportType>('inventory-readiness');
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [surgeons, setSurgeons] = useState<{ id: string; name: string }[]>([]);
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

  useEffect(() => {
    if (token) {
      getSurgeons(token).then(result => setSurgeons(result.users)).catch(() => {});
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
          </>
        )}
      </main>
    </>
  );
}
