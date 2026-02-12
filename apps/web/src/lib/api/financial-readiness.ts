/**
 * Financial Readiness API Client (Phase 2)
 *
 * Admin-only endpoints for observational financial risk tracking.
 */

import { request } from './client';

// ============================================================================
// TYPES
// ============================================================================

export type FinancialRiskState = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export type ClinicFinancialState = 'UNKNOWN' | 'DECLARED_CLEARED' | 'DECLARED_AT_RISK';
export type AscFinancialState = 'UNKNOWN' | 'VERIFIED_CLEARED' | 'VERIFIED_AT_RISK';
export type OverrideState = 'NONE' | 'OVERRIDE_CLEARED' | 'OVERRIDE_AT_RISK';

export interface FinancialDashboardRow {
  surgeryRequestId: string;
  procedureName: string;
  surgeonName: string | null;
  clinicName: string | null;
  patientDisplayName: string | null;
  scheduledDate: string | null;
  requestStatus: string;
  riskState: FinancialRiskState;
  clinicState: ClinicFinancialState;
  ascState: AscFinancialState;
  overrideState: OverrideState;
  recomputedAt: string | null;
}

export interface FinancialDeclarationEvent {
  id: string;
  state: ClinicFinancialState;
  reasonCodes: string[];
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface FinancialVerificationEvent {
  id: string;
  state: AscFinancialState;
  reasonCodes: string[];
  note: string | null;
  verifiedByName: string | null;
  createdAt: string;
}

export interface FinancialOverrideEvent {
  id: string;
  state: OverrideState;
  reasonCode: string | null;
  note: string | null;
  overriddenByName: string | null;
  createdAt: string;
}

export interface FinancialReadinessDetail {
  request: {
    id: string;
    procedureName: string;
    surgeonName: string | null;
    clinicName: string | null;
    patientDisplayName: string | null;
    scheduledDate: string | null;
    status: string;
  };
  cache: {
    riskState: FinancialRiskState;
    clinicState: ClinicFinancialState;
    ascState: AscFinancialState;
    overrideState: OverrideState;
    recomputedAt: string | null;
  };
  declarations: FinancialDeclarationEvent[];
  verifications: FinancialVerificationEvent[];
  overrides: FinancialOverrideEvent[];
}

export interface FinancialCacheResponse {
  cache: {
    surgeryRequestId: string;
    riskState: FinancialRiskState;
    clinicState: ClinicFinancialState;
    ascState: AscFinancialState;
    overrideState: OverrideState;
    recomputedAt: string;
  };
}

// ============================================================================
// API CALLS
// ============================================================================

export async function getFinancialDashboard(
  token: string,
  filters?: {
    riskState?: FinancialRiskState;
    clinicId?: string;
    surgeonId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: FinancialDashboardRow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.riskState) params.set('riskState', filters.riskState);
  if (filters?.clinicId) params.set('clinicId', filters.clinicId);
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request(`/admin/financial-readiness/dashboard${qs ? `?${qs}` : ''}`, { token });
}

export async function getFinancialReadinessDetail(
  token: string,
  requestId: string,
): Promise<FinancialReadinessDetail> {
  return request(`/admin/financial-readiness/${requestId}`, { token });
}

export async function recordClinicDeclaration(
  token: string,
  requestId: string,
  body: { state: string; reasonCodes?: string[]; note?: string },
): Promise<FinancialCacheResponse> {
  return request(`/admin/financial-readiness/${requestId}/declare`, {
    method: 'POST', body, token,
  });
}

export async function recordAscVerification(
  token: string,
  requestId: string,
  body: { state: string; reasonCodes?: string[]; note?: string },
): Promise<FinancialCacheResponse> {
  return request(`/admin/financial-readiness/${requestId}/verify`, {
    method: 'POST', body, token,
  });
}

export async function recordFinancialOverride(
  token: string,
  requestId: string,
  body: { state: string; reasonCode: string | null; note?: string },
): Promise<FinancialCacheResponse> {
  return request(`/admin/financial-readiness/${requestId}/override`, {
    method: 'POST', body, token,
  });
}
