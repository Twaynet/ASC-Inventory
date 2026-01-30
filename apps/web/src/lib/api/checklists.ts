/**
 * Checklists API module (OR Time Out & Post-op Debrief)
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface ChecklistItem {
  key: string;
  label: string;
  type: 'checkbox' | 'select' | 'text' | 'readonly';
  required: boolean;
  options?: string[];
  noDefault?: boolean;
  showIf?: { key: string; value: string };
  roleRestricted?: string;
}

export interface RequiredSignature {
  role: string;
  required: boolean;
  conditional?: boolean;
  conditions?: string[];
}

export interface ChecklistResponse {
  itemKey: string;
  value: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: string;
}

export interface ChecklistSignature {
  id: string;
  role: string;
  signedByUserId: string;
  signedByName: string;
  signedAt: string;
  method: string;
  flaggedForReview: boolean;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface ChecklistInstance {
  id: string;
  caseId: string;
  facilityId: string;
  type: 'TIMEOUT' | 'DEBRIEF';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  templateVersionId: string;
  templateName: string;
  items: ChecklistItem[];
  requiredSignatures: RequiredSignature[];
  responses: ChecklistResponse[];
  signatures: ChecklistSignature[];
  roomId: string | null;
  roomName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  pendingScrubReview: boolean;
  pendingSurgeonReview: boolean;
  scrubReviewCompletedAt: string | null;
  surgeonReviewCompletedAt: string | null;
}

export interface CaseChecklistsResponse {
  caseId: string;
  featureEnabled: boolean;
  timeout: ChecklistInstance | null;
  debrief: ChecklistInstance | null;
  canStartCase: boolean;
  canCompleteCase: boolean;
}

export interface ChecklistTemplateItem {
  key: string;
  label: string;
  type: 'checkbox' | 'select' | 'text' | 'readonly';
  required: boolean;
  options?: string[];
}

export interface ChecklistTemplateSignature {
  role: string;
  required: boolean;
  conditional?: boolean;
  conditions?: string[];
}

export interface ChecklistTemplateData {
  id: string;
  facilityId: string;
  type: 'TIMEOUT' | 'DEBRIEF';
  name: string;
  isActive: boolean;
  currentVersionId: string | null;
  versionNumber: number | null;
  items: ChecklistTemplateItem[];
  requiredSignatures: ChecklistTemplateSignature[];
}

export interface PendingReview {
  instanceId: string;
  caseId: string;
  caseName: string;
  surgeonName: string;
  completedAt: string;
  pendingScrub: boolean;
  pendingSurgeon: boolean;
  scrubReviewCompletedAt: string | null;
  surgeonReviewCompletedAt: string | null;
}

export interface PendingReviewsResponse {
  pendingReviews: PendingReview[];
  total: number;
}

export interface FlaggedReview {
  signatureId: string | null;
  instanceId: string;
  caseId: string;
  checklistType: 'TIMEOUT' | 'DEBRIEF';
  caseName: string;
  surgeonName: string;
  signatureRole: string | null;
  signedByName: string | null;
  signedAt: string | null;
  flaggedForReview: boolean;
  flagComment: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNotes: string | null;
  equipmentNotes: string | null;
  improvementNotes: string | null;
  surgeonNotes: string | null;
  surgeonFlagged: boolean;
  surgeonFlaggedAt: string | null;
  surgeonFlaggedComment: string | null;
  flagSource: 'staff' | 'surgeon' | 'both';
}

export interface DebriefItemForReview {
  instanceId: string;
  caseId: string;
  caseName: string;
  surgeonName: string;
  completedAt: string | null;
  equipmentNotes: string | null;
  improvementNotes: string | null;
}

export interface FlaggedReviewsResponse {
  flaggedReviews: FlaggedReview[];
  resolvedReviews: FlaggedReview[];
  debriefItemsForReview: DebriefItemForReview[];
  totalUnresolved: number;
  totalResolved: number;
}

export interface SurgeonChecklist {
  instanceId: string;
  caseId: string;
  caseNumber: string;
  procedureName: string;
  scheduledDate: string;
  checklistType: 'TIMEOUT' | 'DEBRIEF';
  status: string;
  completedAt: string | null;
  surgeonNotes: string | null;
  surgeonFlagged: boolean;
  surgeonFlaggedAt: string | null;
  surgeonFlaggedComment: string | null;
  roomName: string | null;
}

export interface SurgeonChecklistsResponse {
  checklists: SurgeonChecklist[];
  total: number;
}

// ============================================================================
// Endpoints — Case Checklists
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getCaseChecklists(
  token: string,
  caseId: string
): Promise<CaseChecklistsResponse> {
  return request(`/cases/${caseId}/checklists`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function startChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  roomId?: string
): Promise<ChecklistInstance> {
  return request(`/cases/${caseId}/checklists/start`, {
    method: 'POST',
    body: { type, roomId },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function respondToChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  itemKey: string,
  value: string
): Promise<ChecklistInstance> {
  return request(`/cases/${caseId}/checklists/${type}/respond`, {
    method: 'POST',
    body: { itemKey, value },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function signChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  method: 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP' = 'LOGIN',
  flaggedForReview: boolean = false,
  flagComment?: string
): Promise<ChecklistInstance> {
  return request(`/cases/${caseId}/checklists/${type}/sign`, {
    method: 'POST',
    body: { method, flaggedForReview, flagComment },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function completeChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF'
): Promise<ChecklistInstance> {
  return request(`/cases/${caseId}/checklists/${type}/complete`, {
    method: 'POST',
    body: {},
    token,
  });
}

// ============================================================================
// Endpoints — Async Reviews
// ============================================================================

// TODO(api-schema): needs Zod request + response schema
export async function recordAsyncReview(
  token: string,
  caseId: string,
  notes: string | null,
  method: 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP' = 'LOGIN'
): Promise<ChecklistInstance> {
  return request(`/cases/${caseId}/checklists/debrief/async-review`, {
    method: 'POST',
    body: { notes, method },
    token,
  });
}

// TODO(api-schema): needs Zod response schema
export async function getPendingReviews(token: string): Promise<PendingReviewsResponse> {
  return request('/pending-reviews', { token });
}

// TODO(api-schema): needs Zod response schema
export async function getMyPendingReviews(token: string): Promise<PendingReviewsResponse> {
  return request('/my-pending-reviews', { token });
}

// ============================================================================
// Endpoints — Flagged Reviews
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getFlaggedReviews(token: string): Promise<FlaggedReviewsResponse> {
  return request('/flagged-reviews', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function resolveFlaggedReview(
  token: string,
  signatureId: string,
  notes?: string
): Promise<{ success: boolean }> {
  return request(`/flagged-reviews/${signatureId}/resolve`, {
    method: 'POST',
    body: { notes },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function resolveSurgeonFlag(
  token: string,
  instanceId: string,
  notes?: string
): Promise<{ success: boolean }> {
  return request(`/flagged-reviews/${instanceId}/resolve-surgeon-flag`, {
    method: 'POST',
    body: { notes },
    token,
  });
}

// ============================================================================
// Endpoints — Surgeon Checklists
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getSurgeonChecklists(token: string): Promise<SurgeonChecklistsResponse> {
  return request('/surgeon/my-checklists', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateSurgeonFeedback(
  token: string,
  instanceId: string,
  feedback: {
    notes?: string;
    flagged?: boolean;
    flaggedComment?: string;
  }
): Promise<{ success: boolean }> {
  return request(`/surgeon/checklists/${instanceId}/feedback`, {
    method: 'PUT',
    body: feedback,
    token,
  });
}

// ============================================================================
// Endpoints — Checklist Templates
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getChecklistTemplates(token: string): Promise<{ templates: ChecklistTemplateData[] }> {
  return request('/checklists/templates', { token });
}

// TODO(api-schema): needs Zod response schema
export async function getChecklistTemplate(
  token: string,
  type: 'TIMEOUT' | 'DEBRIEF'
): Promise<ChecklistTemplateData> {
  return request(`/checklists/templates/${type}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateChecklistTemplate(
  token: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  items: ChecklistTemplateItem[],
  requiredSignatures: ChecklistTemplateSignature[]
): Promise<ChecklistTemplateData> {
  return request(`/checklists/templates/${type}`, {
    method: 'PUT',
    body: { items, requiredSignatures },
    token,
  });
}
