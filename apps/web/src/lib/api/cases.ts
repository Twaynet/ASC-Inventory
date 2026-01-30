/**
 * Cases API module
 */

import { request } from './client';
import { callContract } from './contract-client';
import { contract } from '@asc/contract';
import {
  CaseResponseSchema,
  DeleteCaseResponseSchema,
  ActivateCaseRequestSchema,
  CancelCaseRequestSchema,
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
  return callContract(contract.cases.list, {
    query: filters,
    token,
  }) as Promise<{ cases: Case[] }>;
}

export async function getCase(token: string, caseId: string): Promise<{ case: Case }> {
  return callContract(contract.cases.get, {
    params: { caseId },
    token,
  }) as Promise<{ case: Case }>;
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
  return callContract(contract.cases.approve, {
    params: { caseId },
    body: data,
    token,
  }) as Promise<{ case: Case }>;
}

export async function rejectCase(token: string, caseId: string, reason: string): Promise<{ case: Case }> {
  return callContract(contract.cases.reject, {
    params: { caseId },
    body: { reason },
    token,
  }) as Promise<{ case: Case }>;
}

export async function updateCase(
  token: string,
  caseId: string,
  data: { procedureName?: string; surgeonId?: string }
): Promise<{ case: Case }> {
  return callContract(contract.cases.update, {
    params: { caseId },
    body: data,
    token,
  }) as Promise<{ case: Case }>;
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
  return callContract(contract.cases.assignRoom, {
    params: { caseId },
    body: data,
    token,
  }) as Promise<{ case: Case }>;
}
