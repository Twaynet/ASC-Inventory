/**
 * Surgery Request API Client (Phase 1 Readiness)
 *
 * ASC admin endpoints for reviewing and managing clinic-submitted surgery requests.
 */

import { request } from './client';

// ============================================================================
// TYPES
// ============================================================================

export interface SurgeryRequest {
  id: string;
  targetFacilityId: string;
  sourceClinicId: string;
  sourceRequestId: string;
  status: SurgeryRequestStatus;
  procedureName: string;
  surgeonId: string | null;
  surgeonName: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  patientRefId: string;
  patientDisplayName: string | null;
  patientClinicKey: string | null;
  patientBirthYear: number | null;
  clinicName: string | null;
  submittedAt: string;
  lastSubmittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type SurgeryRequestStatus =
  | 'SUBMITTED'
  | 'RETURNED_TO_CLINIC'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'CONVERTED';

export interface SurgeryRequestSubmission {
  id: string;
  requestId: string;
  submissionSeq: number;
  submittedAt: string;
  receivedAt: string;
  payloadVersion: number;
  createdAt: string;
}

export interface SurgeryRequestAuditEvent {
  id: string;
  requestId: string;
  submissionId: string | null;
  eventType: string;
  actorType: string;
  actorClinicId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
}

export interface ChecklistInstance {
  id: string;
  requestId: string;
  submissionId: string;
  templateVersionId: string;
  templateName: string | null;
  templateVersion: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistResponse {
  id: string;
  instanceId: string;
  itemKey: string;
  response: unknown;
  actorType: string;
  actorClinicId: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface SurgeryRequestDetail {
  request: SurgeryRequest;
  submissions: SurgeryRequestSubmission[];
  auditEvents: SurgeryRequestAuditEvent[];
  checklistInstances: ChecklistInstance[];
  checklistResponses: ChecklistResponse[];
  conversion: {
    surgicalCaseId: string;
    convertedAt: string;
    convertedByUserId: string;
  } | null;
}

export interface ClinicSummary {
  id: string;
  name: string;
}

// ============================================================================
// API CALLS
// ============================================================================

export async function getSurgeryRequests(
  token: string,
  filters?: {
    status?: SurgeryRequestStatus;
    clinicId?: string;
    surgeonId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ requests: SurgeryRequest[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.clinicId) params.set('clinicId', filters.clinicId);
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request(`/admin/surgery-requests${qs ? `?${qs}` : ''}`, { token });
}

export async function getSurgeryRequest(
  token: string,
  id: string,
): Promise<SurgeryRequestDetail> {
  return request(`/admin/surgery-requests/${id}`, { token });
}

export async function getSurgeryRequestClinics(
  token: string,
): Promise<{ clinics: ClinicSummary[] }> {
  return request('/admin/surgery-requests/clinics', { token });
}

export async function returnSurgeryRequest(
  token: string,
  id: string,
  body: { reasonCode: string; note?: string },
): Promise<{ request: SurgeryRequest }> {
  return request(`/admin/surgery-requests/${id}/return`, {
    method: 'POST',
    body,
    token,
  });
}

export async function acceptSurgeryRequest(
  token: string,
  id: string,
  body?: { note?: string },
): Promise<{ request: SurgeryRequest }> {
  return request(`/admin/surgery-requests/${id}/accept`, {
    method: 'POST',
    body: body || {},
    token,
  });
}

export async function rejectSurgeryRequest(
  token: string,
  id: string,
  body: { reasonCode: string; note?: string },
): Promise<{ request: SurgeryRequest }> {
  return request(`/admin/surgery-requests/${id}/reject`, {
    method: 'POST',
    body,
    token,
  });
}

export async function convertSurgeryRequest(
  token: string,
  id: string,
): Promise<{ request: SurgeryRequest; surgicalCaseId: string }> {
  return request(`/admin/surgery-requests/${id}/convert`, {
    method: 'POST',
    body: {},
    token,
  });
}

export async function completeSurgeryRequestChecklist(
  token: string,
  requestId: string,
  instanceId: string,
): Promise<{ checklistInstance: ChecklistInstance }> {
  return request(`/admin/surgery-requests/${requestId}/checklist/complete`, {
    method: 'POST',
    body: { instanceId },
    token,
  });
}
