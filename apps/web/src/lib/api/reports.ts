/**
 * Reports API module
 */

import { request, API_BASE } from './client';

// ============================================================================
// Types
// ============================================================================

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: 'inventory' | 'cases' | 'compliance';
  filters: string[];
  exportFormats: string[];
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  readinessState?: string;
  surgeonId?: string;
  eventType?: string;
  userId?: string;
  checklistType?: 'TIMEOUT' | 'DEBRIEF';
  status?: string;
}

export interface InventoryReadinessRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  caseStatus: string;
  orRoom: string;
  surgeonName: string;
  readinessState: string;
  totalRequired: number;
  totalVerified: number;
  totalAvailable: number;
  missingCount: number;
  attestationState: string;
  attestedAt: string;
  attestedByName: string;
}

export interface InventoryReadinessSummary {
  totalCases: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  attestedCount: number;
  dateRange: { start: string; end: string };
}

export interface VerificationActivityRow {
  eventId: string;
  eventType: string;
  occurredAt: string;
  occurredDate: string;
  performedByName: string;
  performedById: string;
  barcode: string;
  catalogName: string;
  category: string;
  locationName: string;
  notes: string;
}

export interface VerificationActivitySummary {
  totalEvents: number;
  byType: Array<{ eventType: string; count: number; uniqueItems: number }>;
  dateRange: { start: string; end: string };
}

export interface ChecklistComplianceRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  surgeonName: string;
  checklistType: string;
  checklistStatus: string;
  startedAt: string;
  completedAt: string;
  circulatorSigned: string;
  surgeonSigned: string;
  scrubSigned: string;
  anesthesiaSigned: string;
  pendingScrubReview: string;
  pendingSurgeonReview: string;
  signatureCount: number;
}

export interface ChecklistComplianceSummary {
  totalChecklists: number;
  timeout: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completionRate: number;
  };
  debrief: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completionRate: number;
    pendingReviews: number;
  };
  dateRange: { start: string; end: string };
}

export interface CaseSummaryRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  orRoom: string;
  isActive: string;
  isCancelled: string;
  cancelledAt: string;
  estimatedDuration: number | string;
  surgeonName: string;
  readinessState: string;
  attestationState: string;
  caseCardName: string;
  checklistsCompleted: number;
}

export interface CaseSummarySummary {
  totalCases: number;
  byStatus: Array<{ status: string; count: number }>;
  activeCases: number;
  cancelledCases: number;
  withCaseCard: number;
  attestedCases: number;
  dateRange: { start: string; end: string };
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getAvailableReports(
  token: string
): Promise<{ reports: ReportDefinition[] }> {
  return request('/reports', { token });
}

// TODO(api-schema): needs Zod response schema
export async function getInventoryReadinessReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: InventoryReadinessRow[]; summary: InventoryReadinessSummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.readinessState) params.set('readinessState', filters.readinessState);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/reports/inventory-readiness${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getVerificationActivityReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: VerificationActivityRow[]; summary: VerificationActivitySummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId) params.set('userId', filters.userId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/reports/verification-activity${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getChecklistComplianceReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: ChecklistComplianceRow[]; summary: ChecklistComplianceSummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.checklistType) params.set('checklistType', filters.checklistType);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/reports/checklist-compliance${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseSummaryReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: CaseSummaryRow[]; summary: CaseSummarySummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.status) params.set('status', filters.status);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/reports/case-summary${query}`, { token });
}

export function getReportExportUrl(
  reportType: 'inventory-readiness' | 'verification-activity' | 'checklist-compliance' | 'case-summary',
  filters: ReportFilters = {}
): string {
  const params = new URLSearchParams();
  params.set('format', 'csv');
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.readinessState) params.set('readinessState', filters.readinessState);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.checklistType) params.set('checklistType', filters.checklistType);
  if (filters.status) params.set('status', filters.status);
  return `${API_BASE}/reports/${reportType}?${params.toString()}`;
}
