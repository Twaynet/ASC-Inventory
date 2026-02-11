/**
 * PHI Audit API module — read-only audit visibility (Phase 5)
 *
 * All endpoints are GET-only. No mutations exist.
 * Access requires PHI_AUDIT_ACCESS capability (ADMIN role).
 * X-Access-Purpose: AUDIT is auto-injected by client.ts for /phi-audit/* paths.
 */

import { request, API_BASE } from './client';

// ============================================================================
// Types — mirror backend response shapes exactly
// ============================================================================

export interface PhiAuditEntry {
  id: string;
  userId: string;
  userRoles: string[];
  facilityId: string;
  organizationIds: string[];
  caseId: string | null;
  phiClassification: 'PHI_CLINICAL' | 'PHI_BILLING' | 'PHI_AUDIT';
  accessPurpose: 'CLINICAL_CARE' | 'SCHEDULING' | 'BILLING' | 'AUDIT' | 'EMERGENCY';
  outcome: 'ALLOWED' | 'DENIED';
  denialReason: string | null;
  requestId: string | null;
  endpoint: string | null;
  httpMethod: string | null;
  isEmergency: boolean;
  emergencyJustification: string | null;
  createdAt: string;
}

export interface PhiAuditEntriesResponse {
  entries: PhiAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditStats {
  total: number;
  byOutcome: Record<string, number>;
  byPurpose: Record<string, number>;
  emergencyCount: number;
  exportCount: number;
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

export interface AuditSession {
  userId: string;
  userName: string;
  sessionStart: string;
  sessionEnd: string;
  accessCount: number;
  denialCount: number;
  emergencyCount: number;
  classifications: string[];
  purposes: string[];
  caseIds: string[];
  isSuspicious: boolean;
  suspiciousReasons: string[];
}

export interface AuditSessionsResponse {
  sessions: AuditSession[];
  total: number;
}

export interface ExcessiveDenialEntry {
  userId: string;
  userName: string;
  hourBucket: string;
  denialCount: number;
  denialReasons: string[];
  threshold: number;
}

export interface AuditAnalytics {
  totalSessions: number;
  suspiciousSessionCount: number;
  excessiveDenialCount: number;
  topUsers: Array<{
    userId: string;
    userName: string;
    accessCount: number;
  }>;
}

export type RetentionReason = 'ACTIVE_CASE' | 'BILLING_HOLD' | 'AUDIT_RETENTION';

export interface RetentionDetail {
  reason: RetentionReason;
  description: string;
  expiresAt: string | null;
}

export interface RetentionCase {
  entityType: 'SURGICAL_CASE';
  entityId: string;
  facilityId: string;
  isPurgeable: boolean;
  earliestPurgeAt: string | null;
  retentionReasons: RetentionReason[];
  retentionDetails: RetentionDetail[];
  evaluatedAt: string;
}

export interface RetentionListResponse {
  cases: RetentionCase[];
  total: number;
}

// ============================================================================
// Filter types
// ============================================================================

export interface PhiAuditFilters {
  userId?: string;
  caseId?: string;
  outcome?: string;
  accessPurpose?: string;
  phiClassification?: string;
  isEmergency?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface SessionFilters {
  userId?: string;
  startDate?: string;
  endDate?: string;
  onlySuspicious?: boolean;
  limit?: number;
  offset?: number;
}

export interface DenialFilters {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface RetentionFilters {
  limit?: number;
  offset?: number;
  onlyPurgeable?: boolean;
}

// ============================================================================
// Helper — build query string from filters
// ============================================================================

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

// ============================================================================
// API functions — all GET-only
// ============================================================================

export async function getAuditEntries(token: string, filters: PhiAuditFilters = {}): Promise<PhiAuditEntriesResponse> {
  const qs = toQueryString(filters as Record<string, string | number | boolean | undefined>);
  return request<PhiAuditEntriesResponse>(`/phi-audit${qs}`, { token });
}

export async function getAuditEntry(token: string, id: string): Promise<PhiAuditEntry> {
  return request<PhiAuditEntry>(`/phi-audit/${id}`, { token });
}

export async function getAuditStats(token: string, startDate?: string, endDate?: string): Promise<AuditStats> {
  const qs = toQueryString({ startDate, endDate });
  return request<AuditStats>(`/phi-audit/stats${qs}`, { token });
}

export async function getAuditSessions(token: string, filters: SessionFilters = {}): Promise<AuditSessionsResponse> {
  const qs = toQueryString(filters as Record<string, string | number | boolean | undefined>);
  return request<AuditSessionsResponse>(`/phi-audit/sessions${qs}`, { token });
}

export async function getExcessiveDenials(token: string, filters: DenialFilters = {}): Promise<{ entries: ExcessiveDenialEntry[] }> {
  const qs = toQueryString(filters as Record<string, string | number | boolean | undefined>);
  return request<{ entries: ExcessiveDenialEntry[] }>(`/phi-audit/excessive-denials${qs}`, { token });
}

export async function getAuditAnalytics(token: string, startDate?: string, endDate?: string): Promise<AuditAnalytics> {
  const qs = toQueryString({ startDate, endDate });
  return request<AuditAnalytics>(`/phi-audit/analytics${qs}`, { token });
}

export async function getRetentionList(token: string, filters: RetentionFilters = {}): Promise<RetentionListResponse> {
  const qs = toQueryString(filters as Record<string, string | number | boolean | undefined>);
  return request<RetentionListResponse>(`/phi-audit/retention${qs}`, { token });
}

export async function getRetentionStatus(token: string, entityId: string): Promise<RetentionCase> {
  return request<RetentionCase>(`/phi-audit/retention/${entityId}`, { token });
}

// ============================================================================
// CSV export URL builder (for manual blob download with AUDIT purpose header)
// ============================================================================

export function getPhiAuditExportUrl(tab: string, filters: Record<string, string | undefined>): string {
  const qs = toQueryString(filters as Record<string, string | undefined>);
  return `${API_BASE}/phi-audit/${tab}/export${qs}`;
}
