/**
 * Case Dashboard API module
 */

import { request } from './client';
import type { MissingItem } from './readiness';

// ============================================================================
// Types
// ============================================================================

export type AnesthesiaModality = 'GENERAL' | 'SPINAL' | 'REGIONAL' | 'MAC' | 'LOCAL' | 'TIVA';
export type AttestationState = 'NOT_ATTESTED' | 'ATTESTED' | 'VOIDED';
export type CaseEventType =
  | 'CASE_CARD_LINKED'
  | 'CASE_CARD_CHANGED'
  | 'READINESS_ATTESTED'
  | 'READINESS_VOIDED'
  | 'OVERRIDE_ADDED'
  | 'OVERRIDE_MODIFIED'
  | 'OVERRIDE_REMOVED'
  | 'SCHEDULING_CHANGED'
  | 'ANESTHESIA_PLAN_CHANGED'
  | 'CASE_CREATED'
  | 'CASE_ACTIVATED'
  | 'CASE_CANCELLED';

export interface CaseDashboardCaseCard {
  id: string;
  name: string;
  version: string;
  versionId: string;
  status: string;
}

export interface CaseDashboardAnesthesiaPlan {
  modalities: AnesthesiaModality[];
  positioningConsiderations: string | null;
  airwayNotes: string | null;
  anticoagulationConsiderations: string | null;
}

export interface CaseDashboardOverride {
  id: string;
  target: string;
  originalValue: string | null;
  overrideValue: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface CaseDashboardData {
  caseId: string;
  caseNumber: string;
  facility: string;
  facilityId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  surgeon: string;
  surgeonId: string;
  procedureName: string;
  status: string;
  isActive: boolean;
  attestationState: AttestationState;
  attestedBy: string | null;
  attestedAt: string | null;
  voidReason: string | null;
  estimatedDurationMinutes: number | null;
  laterality: string | null;
  orRoom: string | null;
  schedulerNotes: string | null;
  caseType: string;
  procedureCodes: string[];
  patientFlags: Record<string, boolean>;
  admissionTypes: Record<string, boolean>;
  caseCard: CaseDashboardCaseCard | null;
  anesthesiaPlan: CaseDashboardAnesthesiaPlan | null;
  overrides: CaseDashboardOverride[];
  readinessState: 'GREEN' | 'ORANGE' | 'RED';
  missingItems: MissingItem[];
}

export interface CaseDashboardEventLogEntry {
  id: string;
  eventType: CaseEventType;
  userId: string;
  userRole: string;
  userName: string;
  description: string;
  createdAt: string;
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getCaseDashboard(
  token: string,
  caseId: string
): Promise<{ dashboard: CaseDashboardData }> {
  return request(`/case-dashboard/${caseId}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function attestCaseReadiness(
  token: string,
  caseId: string
): Promise<{ success: boolean; attestationState: AttestationState }> {
  return request(`/case-dashboard/${caseId}/attest`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function voidCaseAttestation(
  token: string,
  caseId: string,
  reason: string
): Promise<{ success: boolean; attestationState: AttestationState }> {
  return request(`/case-dashboard/${caseId}/void`, { method: 'POST', body: { reason }, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateAnesthesiaPlan(
  token: string,
  caseId: string,
  data: {
    modalities?: AnesthesiaModality[];
    positioningConsiderations?: string;
    airwayNotes?: string;
    anticoagulationConsiderations?: string;
  }
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/anesthesia`, { method: 'PUT', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function linkCaseCard(
  token: string,
  caseId: string,
  caseCardVersionId: string
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/link-case-card`, {
    method: 'PUT',
    body: { caseCardVersionId },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function addCaseOverride(
  token: string,
  caseId: string,
  data: {
    target: string;
    originalValue?: string;
    overrideValue: string;
    reason: string;
  }
): Promise<{ success: boolean; overrideId: string }> {
  return request(`/case-dashboard/${caseId}/overrides`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCaseOverride(
  token: string,
  caseId: string,
  overrideId: string,
  data: {
    overrideValue?: string;
    reason?: string;
  }
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/overrides/${overrideId}`, { method: 'PUT', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function removeCaseOverride(
  token: string,
  caseId: string,
  overrideId: string
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/overrides/${overrideId}`, { method: 'DELETE', token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseEventLog(
  token: string,
  caseId: string
): Promise<{ eventLog: CaseDashboardEventLogEntry[] }> {
  return request(`/case-dashboard/${caseId}/event-log`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCaseSummary(
  token: string,
  caseId: string,
  data: {
    estimatedDurationMinutes?: number;
    laterality?: string;
    orRoom?: string;
    schedulerNotes?: string;
    caseType?: 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION';
    procedureCodes?: string[];
    patientFlags?: Record<string, boolean>;
    admissionTypes?: Record<string, boolean>;
  }
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/case-summary`, { method: 'PUT', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCaseScheduling(
  token: string,
  caseId: string,
  data: {
    scheduledDate?: string;
    scheduledTime?: string | null;
    orRoom?: string | null;
  }
): Promise<{ success: boolean }> {
  return request(`/case-dashboard/${caseId}/scheduling`, { method: 'PUT', body: data, token });
}
