/**
 * Cases API module
 */

import { request } from './client';
import {
  CaseListResponseSchema,
  CaseResponseSchema,
  DeleteCaseResponseSchema,
  ActivateCaseRequestSchema,
  ApproveCaseRequestSchema,
  RejectCaseRequestSchema,
  CancelCaseRequestSchema,
  UpdateCaseRequestSchema,
  AssignRoomRequestSchema,
} from './schemas';

// ============================================================================
// Types
// ============================================================================

export interface Case {
  id: string;
  caseNumber: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  surgeonId: string;
  surgeonName: string;
  procedureName: string;
  preferenceCardVersionId: string | null;
  status: string;
  notes: string | null;
  isActive: boolean;
  activatedAt: string | null;
  activatedByUserId: string | null;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivateCaseRequest {
  scheduledDate: string;
  scheduledTime?: string;
}

// ============================================================================
// Endpoints
// ============================================================================

export async function getCases(token: string, filters?: { date?: string; status?: string; active?: string; search?: string }): Promise<{ cases: Case[] }> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.active !== undefined) params.set('active', filters.active);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/cases${query}`, { token, responseSchema: CaseListResponseSchema });
}

export async function getCase(token: string, caseId: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}`, { token, responseSchema: CaseResponseSchema });
}

export async function createCase(token: string, data: Partial<Case>): Promise<{ case: Case }> {
  return request('/cases', { method: 'POST', body: data, token, responseSchema: CaseResponseSchema });
}

export async function activateCase(token: string, caseId: string, data: ActivateCaseRequest): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/activate`, { method: 'POST', body: data, token, requestSchema: ActivateCaseRequestSchema, responseSchema: CaseResponseSchema });
}

export async function deactivateCase(token: string, caseId: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/deactivate`, { method: 'POST', body: {}, token, responseSchema: CaseResponseSchema });
}

export async function cancelCase(token: string, caseId: string, reason?: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/cancel`, { method: 'POST', body: { reason }, token, requestSchema: CancelCaseRequestSchema, responseSchema: CaseResponseSchema });
}

export async function approveCase(token: string, caseId: string, data: { scheduledDate: string; scheduledTime?: string; roomId?: string }): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/approve`, { method: 'POST', body: data, token, requestSchema: ApproveCaseRequestSchema, responseSchema: CaseResponseSchema });
}

export async function rejectCase(token: string, caseId: string, reason: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/reject`, { method: 'POST', body: { reason }, token, requestSchema: RejectCaseRequestSchema, responseSchema: CaseResponseSchema });
}

export async function updateCase(
  token: string,
  caseId: string,
  data: { procedureName?: string; surgeonId?: string }
): Promise<{ case: Case }> {
  return request(`/cases/${caseId}`, { method: 'PATCH', body: data, token, requestSchema: UpdateCaseRequestSchema, responseSchema: CaseResponseSchema });
}

export async function deleteCase(
  token: string,
  caseId: string
): Promise<{ success: boolean; message: string }> {
  return request(`/cases/${caseId}`, { method: 'DELETE', token, responseSchema: DeleteCaseResponseSchema });
}

export async function assignCaseRoom(
  token: string,
  caseId: string,
  data: {
    roomId: string | null;
    sortOrder?: number;
    estimatedDurationMinutes?: number;
  }
): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/assign-room`, { method: 'PATCH', body: data, token, requestSchema: AssignRoomRequestSchema, responseSchema: CaseResponseSchema });
}
