/**
 * Case Cards API module
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export type CaseCardStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
export type CaseType = 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION';

export interface CaseCardSummary {
  id: string;
  surgeonId: string;
  surgeonName: string;
  procedureName: string;
  procedureCodes: string[];
  caseType: CaseType;
  defaultDurationMinutes: number | null;
  status: CaseCardStatus;
  version: string;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
}

export interface CaseCardVersionData {
  id: string;
  versionNumber: string;
  headerInfo: Record<string, unknown>;
  patientFlags: Record<string, unknown>;
  instrumentation: Record<string, unknown>;
  equipment: Record<string, unknown>;
  supplies: Record<string, unknown>;
  medications: Record<string, unknown>;
  setupPositioning: Record<string, unknown>;
  surgeonNotes: Record<string, unknown>;
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
}

export interface CaseCardDetail extends CaseCardSummary {
  turnoverNotes: string | null;
}

export interface CaseCardEditLogEntry {
  id: string;
  editorUserId: string;
  editorName: string;
  editorRole: string;
  changeSummary: string;
  reasonForChange: string | null;
  previousVersionId: string | null;
  newVersionId: string | null;
  editedAt: string;
}

export interface CaseCardCreateRequest {
  surgeonId: string;
  procedureName: string;
  procedureCodes?: string[];
  caseType?: CaseType;
  defaultDurationMinutes?: number;
  turnoverNotes?: string;
  headerInfo?: Record<string, unknown>;
  patientFlags?: Record<string, unknown>;
  instrumentation?: Record<string, unknown>;
  equipment?: Record<string, unknown>;
  supplies?: Record<string, unknown>;
  medications?: Record<string, unknown>;
  setupPositioning?: Record<string, unknown>;
  surgeonNotes?: Record<string, unknown>;
  reasonForChange?: string;
}

export interface CaseCardUpdateRequest extends Partial<CaseCardCreateRequest> {
  changeSummary: string;
  reasonForChange?: string;
  versionBump?: 'major' | 'minor' | 'patch';
}

export interface CaseCardFeedbackSubmitRequest {
  surgicalCaseId: string;
  itemsUnused?: string[];
  itemsMissing?: string[];
  setupIssues?: string;
  staffComments?: string;
  suggestedEdits?: string;
}

export interface CaseCardFeedback {
  id: string;
  surgicalCaseId: string;
  procedureName: string;
  scheduledDate: string;
  itemsUnused: string[];
  itemsMissing: string[];
  setupIssues: string | null;
  staffComments: string | null;
  suggestedEdits: string | null;
  submittedByUserId: string;
  submittedByName: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewNotes: string | null;
  reviewAction: 'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED' | null;
  createdAt: string;
}

export interface CaseCardFeedbackResponse {
  feedback: CaseCardFeedback[];
  summary: {
    total: number;
    pending: number;
    reviewed: number;
  };
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getCaseCards(
  token: string,
  filters?: { surgeonId?: string; status?: string; search?: string }
): Promise<{ cards: CaseCardSummary[] }> {
  const params = new URLSearchParams();
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/case-cards${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseCard(
  token: string,
  id: string
): Promise<{ card: CaseCardDetail; currentVersion: CaseCardVersionData | null }> {
  return request(`/case-cards/${id}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseCardEditLog(
  token: string,
  id: string
): Promise<{ editLog: CaseCardEditLogEntry[] }> {
  return request(`/case-cards/${id}/edit-log`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseCardVersions(
  token: string,
  id: string
): Promise<{ versions: { id: string; versionNumber: string; createdAt: string; createdByName: string }[] }> {
  return request(`/case-cards/${id}/versions`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createCaseCard(
  token: string,
  data: CaseCardCreateRequest
): Promise<{ card: CaseCardSummary }> {
  return request('/case-cards', { method: 'POST', token, body: data });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCaseCard(
  token: string,
  id: string,
  data: CaseCardUpdateRequest
): Promise<{ success: boolean; version: string; versionId: string }> {
  return request(`/case-cards/${id}`, { method: 'PUT', token, body: data });
}

// TODO(api-schema): needs Zod request + response schema
export async function activateCaseCard(
  token: string,
  id: string
): Promise<{ success: boolean; status: string }> {
  return request(`/case-cards/${id}/activate`, { method: 'POST', token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deprecateCaseCard(
  token: string,
  id: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  return request(`/case-cards/${id}/deprecate`, { method: 'POST', token, body: { reason } });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseCardSurgeons(
  token: string
): Promise<{ surgeons: { id: string; name: string }[] }> {
  return request('/case-cards/surgeons', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function submitCaseCardFeedback(
  token: string,
  caseCardId: string,
  data: CaseCardFeedbackSubmitRequest
): Promise<{ feedbackId: string; createdAt: string }> {
  return request(`/case-cards/${caseCardId}/feedback`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseCardFeedback(
  token: string,
  caseCardId: string,
  status?: 'pending' | 'reviewed'
): Promise<CaseCardFeedbackResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/case-cards/${caseCardId}/feedback${query}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function reviewCaseCardFeedback(
  token: string,
  caseCardId: string,
  feedbackId: string,
  action: 'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED',
  notes?: string
): Promise<{ success: boolean; feedbackId: string; action: string; reviewedAt: string }> {
  return request(`/case-cards/${caseCardId}/feedback/${feedbackId}/review`, {
    method: 'POST',
    body: { action, notes },
    token,
  });
}
