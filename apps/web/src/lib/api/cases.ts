/**
 * Cases API module
 */

import { request } from './client';
import { callContract } from './contract-client';
import { contract } from '@asc/contract';
import {
  DeleteCaseResponseSchema,
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
  preopCheckedInAt: string | null;
  preopCheckedInByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivateCaseRequest {
  scheduledDate: string;
  scheduledTime?: string;
}

export interface CaseStatusEvent {
  id: string;
  surgicalCaseId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  context: unknown;
  actorUserId: string;
  actorName: string;
  createdAt: string;
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
  return callContract(contract.cases.create, {
    body: data,
    token,
  }) as Promise<{ case: Case }>;
}

export async function activateCase(token: string, caseId: string, data: ActivateCaseRequest): Promise<{ case: Case }> {
  return callContract(contract.cases.activate, {
    params: { caseId },
    body: data,
    token,
  }) as Promise<{ case: Case }>;
}

export async function deactivateCase(token: string, caseId: string): Promise<{ case: Case }> {
  return callContract(contract.cases.deactivate, {
    params: { caseId },
    token,
  }) as Promise<{ case: Case }>;
}

export async function cancelCase(token: string, caseId: string, reason?: string): Promise<{ case: Case }> {
  return callContract(contract.cases.cancel, {
    params: { caseId },
    body: { reason },
    token,
  }) as Promise<{ case: Case }>;
}

export async function checkInPreop(token: string, caseId: string): Promise<{ case: Case }> {
  return callContract(contract.cases.checkInPreop, {
    params: { caseId },
    token,
  }) as Promise<{ case: Case }>;
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

export async function getCaseStatusEvents(
  token: string,
  caseId: string
): Promise<CaseStatusEvent[]> {
  return callContract(contract.cases.statusEvents, {
    params: { caseId },
    token,
  }) as Promise<CaseStatusEvent[]>;
}
