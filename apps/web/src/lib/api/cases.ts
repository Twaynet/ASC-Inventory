/**
 * Cases API module
 */

import { request } from './client';

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

// TODO(api-schema): needs Zod response schema
export async function getCases(token: string, filters?: { date?: string; status?: string; active?: string; search?: string }): Promise<{ cases: Case[] }> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.active !== undefined) params.set('active', filters.active);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/cases${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCase(token: string, caseId: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createCase(token: string, data: Partial<Case>): Promise<{ case: Case }> {
  return request('/cases', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function activateCase(token: string, caseId: string, data: ActivateCaseRequest): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/activate`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deactivateCase(token: string, caseId: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/deactivate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function cancelCase(token: string, caseId: string, reason?: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/cancel`, { method: 'POST', body: { reason }, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function approveCase(token: string, caseId: string, data: { scheduledDate: string; scheduledTime?: string; roomId?: string }): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/approve`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function rejectCase(token: string, caseId: string, reason: string): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/reject`, { method: 'POST', body: { reason }, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCase(
  token: string,
  caseId: string,
  data: { procedureName?: string; surgeonId?: string }
): Promise<{ case: Case }> {
  return request(`/cases/${caseId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function deleteCase(
  token: string,
  caseId: string
): Promise<{ success: boolean; message: string }> {
  return request(`/cases/${caseId}`, { method: 'DELETE', token });
}

// TODO(api-schema): needs Zod request + response schema
export async function assignCaseRoom(
  token: string,
  caseId: string,
  data: {
    roomId: string | null;
    sortOrder?: number;
    estimatedDurationMinutes?: number;
  }
): Promise<{ case: Case }> {
  return request(`/cases/${caseId}/assign-room`, { method: 'PATCH', body: data, token });
}
