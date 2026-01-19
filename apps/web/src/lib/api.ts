/**
 * API Client for ASC Inventory System
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// Auth
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: string;
    facilityId: string;
    facilityName: string;
  };
}

export async function login(facilityKey: string, username: string, password: string): Promise<LoginResponse> {
  return api('/auth/login', { method: 'POST', body: { facilityKey, username, password } });
}

export async function getMe(token: string): Promise<{ user: LoginResponse['user'] }> {
  return api('/auth/me', { token });
}

// Readiness
export interface MissingItem {
  catalogId: string;
  catalogName: string;
  requiredQuantity: number;
  availableQuantity: number;
  reason: string;
}

export interface CaseReadiness {
  caseId: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  procedureName: string;
  surgeonId: string;
  surgeonName: string;
  readinessState: 'GREEN' | 'ORANGE' | 'RED';
  missingItems: MissingItem[];
  totalRequiredItems: number;
  totalVerifiedItems: number;
  hasAttestation: boolean;
  attestedAt: string | null;
  attestedByName: string | null;
  attestationId: string | null;
  hasSurgeonAcknowledgment: boolean;
  surgeonAcknowledgedAt: string | null;
  surgeonAcknowledgmentId: string | null;
  // Active/Inactive workflow
  isActive: boolean;
  isCancelled: boolean;
}

export interface DayBeforeResponse {
  facilityId: string;
  facilityName: string;
  targetDate: string;
  cases: CaseReadiness[];
  summary: {
    total: number;
    green: number;
    orange: number;
    red: number;
    attested: number;
  };
}

export async function getDayBeforeReadiness(
  token: string,
  date?: string,
  refresh?: boolean
): Promise<DayBeforeResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (refresh) params.set('refresh', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/readiness/day-before${query}`, { token });
}

// Calendar Summary (Month/Week views)
export interface CalendarDaySummary {
  date: string;
  caseCount: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
}

export interface CalendarCaseSummary {
  caseId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  procedureName: string;
  surgeonName: string;
  readinessState: 'GREEN' | 'ORANGE' | 'RED';
}

export interface CalendarSummaryResponse {
  days?: CalendarDaySummary[];
  cases?: CalendarCaseSummary[];
}

export async function getCalendarSummary(
  token: string,
  startDate: string,
  endDate: string,
  granularity: 'day' | 'case'
): Promise<CalendarSummaryResponse> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    granularity,
  });
  return api(`/readiness/calendar-summary?${params.toString()}`, { token });
}

// ============================================================================
// Case Cards
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

export async function getCaseCards(
  token: string,
  filters?: { surgeonId?: string; status?: string; search?: string }
): Promise<{ cards: CaseCardSummary[] }> {
  const params = new URLSearchParams();
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/case-cards${query}`, { token });
}

export async function getCaseCard(
  token: string,
  id: string
): Promise<{ card: CaseCardDetail; currentVersion: CaseCardVersionData | null }> {
  return api(`/case-cards/${id}`, { token });
}

export async function getCaseCardEditLog(
  token: string,
  id: string
): Promise<{ editLog: CaseCardEditLogEntry[] }> {
  return api(`/case-cards/${id}/edit-log`, { token });
}

export async function getCaseCardVersions(
  token: string,
  id: string
): Promise<{ versions: { id: string; versionNumber: string; createdAt: string; createdByName: string }[] }> {
  return api(`/case-cards/${id}/versions`, { token });
}

export async function createCaseCard(
  token: string,
  data: CaseCardCreateRequest
): Promise<{ card: CaseCardSummary }> {
  return api('/case-cards', { method: 'POST', token, body: data });
}

export async function updateCaseCard(
  token: string,
  id: string,
  data: CaseCardUpdateRequest
): Promise<{ success: boolean; version: string; versionId: string }> {
  return api(`/case-cards/${id}`, { method: 'PUT', token, body: data });
}

export async function activateCaseCard(
  token: string,
  id: string
): Promise<{ success: boolean; status: string }> {
  return api(`/case-cards/${id}/activate`, { method: 'POST', token });
}

export async function deprecateCaseCard(
  token: string,
  id: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  return api(`/case-cards/${id}/deprecate`, { method: 'POST', token, body: { reason } });
}

export async function getCaseCardSurgeons(
  token: string
): Promise<{ surgeons: { id: string; name: string }[] }> {
  return api('/case-cards/surgeons', { token });
}

// ============================================================================
// OPERATIONAL REPORTS
// ============================================================================

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: 'inventory' | 'cases' | 'compliance';
  filters: string[];
  exportFormats: string[];
}

export interface InventoryReadinessRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  caseStatus: string;
  orRoom: string;
  surgeonName: string;
  readinessState: string;
  totalRequired: number;
  totalVerified: number;
  totalAvailable: number;
  missingCount: number;
  attestationState: string;
  attestedAt: string;
  attestedByName: string;
}

export interface InventoryReadinessSummary {
  totalCases: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  attestedCount: number;
  dateRange: { start: string; end: string };
}

export interface VerificationActivityRow {
  eventId: string;
  eventType: string;
  occurredAt: string;
  occurredDate: string;
  performedByName: string;
  performedById: string;
  barcode: string;
  catalogName: string;
  category: string;
  locationName: string;
  notes: string;
}

export interface VerificationActivitySummary {
  totalEvents: number;
  byType: Array<{ eventType: string; count: number; uniqueItems: number }>;
  dateRange: { start: string; end: string };
}

export interface ChecklistComplianceRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  surgeonName: string;
  checklistType: string;
  checklistStatus: string;
  startedAt: string;
  completedAt: string;
  circulatorSigned: string;
  surgeonSigned: string;
  scrubSigned: string;
  anesthesiaSigned: string;
  pendingScrubReview: string;
  pendingSurgeonReview: string;
  signatureCount: number;
}

export interface ChecklistComplianceSummary {
  totalChecklists: number;
  timeout: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completionRate: number;
  };
  debrief: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completionRate: number;
    pendingReviews: number;
  };
  dateRange: { start: string; end: string };
}

export interface CaseSummaryRow {
  caseId: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  orRoom: string;
  isActive: string;
  isCancelled: string;
  cancelledAt: string;
  estimatedDuration: number | string;
  surgeonName: string;
  readinessState: string;
  attestationState: string;
  caseCardName: string;
  checklistsCompleted: number;
}

export interface CaseSummarySummary {
  totalCases: number;
  byStatus: Array<{ status: string; count: number }>;
  activeCases: number;
  cancelledCases: number;
  withCaseCard: number;
  attestedCases: number;
  dateRange: { start: string; end: string };
}

export async function getAvailableReports(
  token: string
): Promise<{ reports: ReportDefinition[] }> {
  return api('/reports', { token });
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  readinessState?: string;
  surgeonId?: string;
  eventType?: string;
  userId?: string;
  checklistType?: 'TIMEOUT' | 'DEBRIEF';
  status?: string;
}

export async function getInventoryReadinessReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: InventoryReadinessRow[]; summary: InventoryReadinessSummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.readinessState) params.set('readinessState', filters.readinessState);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/reports/inventory-readiness${query}`, { token });
}

export async function getVerificationActivityReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: VerificationActivityRow[]; summary: VerificationActivitySummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId) params.set('userId', filters.userId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/reports/verification-activity${query}`, { token });
}

export async function getChecklistComplianceReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: ChecklistComplianceRow[]; summary: ChecklistComplianceSummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.checklistType) params.set('checklistType', filters.checklistType);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/reports/checklist-compliance${query}`, { token });
}

export async function getCaseSummaryReport(
  token: string,
  filters: ReportFilters = {}
): Promise<{ rows: CaseSummaryRow[]; summary: CaseSummarySummary }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.status) params.set('status', filters.status);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/reports/case-summary${query}`, { token });
}

export function getReportExportUrl(
  reportType: 'inventory-readiness' | 'verification-activity' | 'checklist-compliance' | 'case-summary',
  filters: ReportFilters = {}
): string {
  const params = new URLSearchParams();
  params.set('format', 'csv');
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.readinessState) params.set('readinessState', filters.readinessState);
  if (filters.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.checklistType) params.set('checklistType', filters.checklistType);
  if (filters.status) params.set('status', filters.status);
  return `${API_BASE}/reports/${reportType}?${params.toString()}`;
}

// ============================================================================
// CASE CARD FEEDBACK (from Debrief)
// ============================================================================

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

export async function submitCaseCardFeedback(
  token: string,
  caseCardId: string,
  data: CaseCardFeedbackSubmitRequest
): Promise<{ feedbackId: string; createdAt: string }> {
  return api(`/case-cards/${caseCardId}/feedback`, { method: 'POST', body: data, token });
}

export async function getCaseCardFeedback(
  token: string,
  caseCardId: string,
  status?: 'pending' | 'reviewed'
): Promise<CaseCardFeedbackResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/case-cards/${caseCardId}/feedback${query}`, { token });
}

export async function reviewCaseCardFeedback(
  token: string,
  caseCardId: string,
  feedbackId: string,
  action: 'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED',
  notes?: string
): Promise<{ success: boolean; feedbackId: string; action: string; reviewedAt: string }> {
  return api(`/case-cards/${caseCardId}/feedback/${feedbackId}/review`, {
    method: 'POST',
    body: { action, notes },
    token,
  });
}

// Attestations
export interface CreateAttestationRequest {
  caseId: string;
  type: 'CASE_READINESS' | 'SURGEON_ACKNOWLEDGMENT';
  notes?: string;
}

export interface AttestationResponse {
  id: string;
  caseId: string;
  type: string;
  attestedByUserId: string;
  attestedByName: string;
  readinessStateAtTime: string;
  notes: string | null;
  createdAt: string;
}

export async function createAttestation(
  token: string,
  data: CreateAttestationRequest
): Promise<AttestationResponse> {
  return api('/readiness/attestations', { method: 'POST', body: data, token });
}

export interface VoidAttestationResponse {
  success: boolean;
  attestationId: string;
  voidedAt: string;
  voidedByUserId: string;
  voidedByName: string;
  reason: string | null;
}

export async function voidAttestation(
  token: string,
  attestationId: string,
  reason?: string
): Promise<VoidAttestationResponse> {
  return api(`/readiness/attestations/${attestationId}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

export async function refreshReadiness(token: string, date?: string): Promise<void> {
  await api('/readiness/refresh', { method: 'POST', body: { date }, token });
}

// Device Events (Scanner Input)
export interface DeviceEventRequest {
  deviceId: string;
  deviceType: 'barcode' | 'rfid' | 'nfc' | 'other';
  payloadType: 'scan' | 'presence' | 'input';
  rawValue: string;
  occurredAt?: string;
}

export interface DeviceEventResponse {
  deviceEventId: string;
  processed: boolean;
  processedItemId: string | null;
  error: string | null;
}

export async function sendDeviceEvent(
  token: string,
  data: DeviceEventRequest
): Promise<DeviceEventResponse> {
  return api('/inventory/device-events', { method: 'POST', body: data, token });
}

// Devices
export interface Device {
  id: string;
  name: string;
  deviceType: string;
  locationId: string | null;
  active: boolean;
}

export async function getDevices(token: string): Promise<{ devices: Device[] }> {
  return api('/inventory/devices', { token });
}

// Inventory Items
export interface InventoryItem {
  id: string;
  catalog_id: string;
  catalog_name: string;
  category: string;
  barcode: string | null;
  serial_number: string | null;
  location_id: string | null;
  location_name: string | null;
  sterility_status: string;
  availability_status: string;
  last_verified_at: string | null;
}

export async function getInventoryItems(
  token: string,
  filters?: { catalogId?: string; locationId?: string; status?: string }
): Promise<{ items: InventoryItem[] }> {
  const params = new URLSearchParams();
  if (filters?.catalogId) params.set('catalogId', filters.catalogId);
  if (filters?.locationId) params.set('locationId', filters.locationId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/inventory/items${query}`, { token });
}

// ============================================================================
// CHECKLISTS (OR Time Out & Post-op Debrief)
// ============================================================================

export interface ChecklistItem {
  key: string;
  label: string;
  type: 'checkbox' | 'select' | 'text' | 'readonly';
  required: boolean;
  options?: string[];
  noDefault?: boolean;          // For select inputs with no pre-selected option
  showIf?: { key: string; value: string };  // Conditional visibility
  roleRestricted?: string;      // Only this role can see/edit this field
}

export interface RequiredSignature {
  role: string;
  required: boolean;
  conditional?: boolean;        // If true, requirement depends on conditions
  conditions?: string[];        // e.g., ["counts_status=exception", "equipment_issues=yes"]
}

export interface ChecklistResponse {
  itemKey: string;
  value: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: string;
}

export interface ChecklistSignature {
  role: string;
  signedByUserId: string;
  signedByName: string;
  signedAt: string;
  method: string;
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
  // Pending review fields (for DEBRIEF async signing)
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

export interface FacilitySettings {
  facilityId: string;
  enableTimeoutDebrief: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  name: string;
}

export async function getFacilitySettings(token: string): Promise<FacilitySettings> {
  return api('/facility/settings', { token });
}

export async function updateFacilitySettings(
  token: string,
  settings: { enableTimeoutDebrief?: boolean }
): Promise<FacilitySettings> {
  return api('/facility/settings', { method: 'PATCH', body: settings, token });
}

export async function getRooms(token: string): Promise<{ rooms: Room[] }> {
  return api('/rooms', { token });
}

export async function getCaseChecklists(
  token: string,
  caseId: string
): Promise<CaseChecklistsResponse> {
  return api(`/cases/${caseId}/checklists`, { token });
}

export async function startChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  roomId?: string
): Promise<ChecklistInstance> {
  return api(`/cases/${caseId}/checklists/start`, {
    method: 'POST',
    body: { type, roomId },
    token,
  });
}

export async function respondToChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  itemKey: string,
  value: string
): Promise<ChecklistInstance> {
  return api(`/cases/${caseId}/checklists/${type}/respond`, {
    method: 'POST',
    body: { itemKey, value },
    token,
  });
}

export async function signChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF',
  method: 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP' = 'LOGIN'
): Promise<ChecklistInstance> {
  return api(`/cases/${caseId}/checklists/${type}/sign`, {
    method: 'POST',
    body: { method },
    token,
  });
}

export async function completeChecklist(
  token: string,
  caseId: string,
  type: 'TIMEOUT' | 'DEBRIEF'
): Promise<ChecklistInstance> {
  return api(`/cases/${caseId}/checklists/${type}/complete`, {
    method: 'POST',
    body: {},
    token,
  });
}

// ============================================================================
// ASYNC REVIEWS (SCRUB/SURGEON signing after debrief completion)
// ============================================================================

export interface PendingReview {
  instanceId: string;
  caseId: string;
  caseName: string;
  patientMrn: string;
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

export async function recordAsyncReview(
  token: string,
  caseId: string,
  notes: string | null,
  method: 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP' = 'LOGIN'
): Promise<ChecklistInstance> {
  return api(`/cases/${caseId}/checklists/debrief/async-review`, {
    method: 'POST',
    body: { notes, method },
    token,
  });
}

export async function getPendingReviews(token: string): Promise<PendingReviewsResponse> {
  return api('/pending-reviews', { token });
}

export async function getMyPendingReviews(token: string): Promise<PendingReviewsResponse> {
  return api('/my-pending-reviews', { token });
}

// ============================================================================
// USER MANAGEMENT (ADMIN only)
// ============================================================================

export interface User {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  email?: string;
  name: string;
  role: string;
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string | null;
  name?: string;
  role?: string;
  password?: string;
}

export async function getUsers(token: string, includeInactive = false): Promise<{ users: User[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return api(`/users${query}`, { token });
}

export async function getUser(token: string, userId: string): Promise<{ user: User }> {
  return api(`/users/${userId}`, { token });
}

export async function createUser(token: string, data: CreateUserRequest): Promise<{ user: User }> {
  return api('/users', { method: 'POST', body: data, token });
}

export async function updateUser(token: string, userId: string, data: UpdateUserRequest): Promise<{ user: User }> {
  return api(`/users/${userId}`, { method: 'PATCH', body: data, token });
}

export async function deactivateUser(token: string, userId: string): Promise<{ success: boolean }> {
  return api(`/users/${userId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function activateUser(token: string, userId: string): Promise<{ success: boolean }> {
  return api(`/users/${userId}/activate`, { method: 'POST', body: {}, token });
}

// ============================================================================
// CASE MANAGEMENT (Active/Inactive workflow)
// ============================================================================

export interface Case {
  id: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  surgeonId: string;
  surgeonName: string;
  patientMrn: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface ActivateCaseRequest {
  scheduledDate: string;
  scheduledTime?: string;
}

export async function getCases(token: string, filters?: { date?: string; status?: string; active?: string }): Promise<{ cases: Case[] }> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.active !== undefined) params.set('active', filters.active);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/cases${query}`, { token });
}

export async function getCase(token: string, caseId: string): Promise<{ case: Case }> {
  return api(`/cases/${caseId}`, { token });
}

export async function createCase(token: string, data: Partial<Case>): Promise<{ case: Case }> {
  return api('/cases', { method: 'POST', body: data, token });
}

export async function activateCase(token: string, caseId: string, data: ActivateCaseRequest): Promise<{ case: Case }> {
  return api(`/cases/${caseId}/activate`, { method: 'POST', body: data, token });
}

export async function deactivateCase(token: string, caseId: string): Promise<{ case: Case }> {
  return api(`/cases/${caseId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function cancelCase(token: string, caseId: string, reason?: string): Promise<{ case: Case }> {
  return api(`/cases/${caseId}/cancel`, { method: 'POST', body: { reason }, token });
}

// ============================================================================
// LOCATIONS MANAGEMENT
// ============================================================================

export interface Location {
  id: string;
  name: string;
  description: string | null;
  parentLocationId: string | null;
  parentLocationName: string | null;
  childCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationRequest {
  name: string;
  description?: string;
  parentLocationId?: string;
}

export interface UpdateLocationRequest {
  name?: string;
  description?: string | null;
  parentLocationId?: string | null;
}

export async function getLocations(token: string): Promise<{ locations: Location[] }> {
  return api('/locations', { token });
}

export async function getLocation(token: string, locationId: string): Promise<{ location: Location }> {
  return api(`/locations/${locationId}`, { token });
}

export async function createLocation(token: string, data: CreateLocationRequest): Promise<{ location: Location }> {
  return api('/locations', { method: 'POST', body: data, token });
}

export async function updateLocation(token: string, locationId: string, data: UpdateLocationRequest): Promise<{ location: Location }> {
  return api(`/locations/${locationId}`, { method: 'PATCH', body: data, token });
}

export async function deleteLocation(token: string, locationId: string): Promise<{ success: boolean }> {
  return api(`/locations/${locationId}`, { method: 'DELETE', token });
}

// ============================================================================
// CATALOG MANAGEMENT
// ============================================================================

export type ItemCategory = 'IMPLANT' | 'INSTRUMENT' | 'HIGH_VALUE_SUPPLY' | 'LOANER';

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  manufacturer: string | null;
  catalogNumber: string | null;
  requiresSterility: boolean;
  isLoaner: boolean;
  active: boolean;
  inventoryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCatalogItemRequest {
  name: string;
  description?: string;
  category: ItemCategory;
  manufacturer?: string;
  catalogNumber?: string;
  requiresSterility?: boolean;
  isLoaner?: boolean;
}

export interface UpdateCatalogItemRequest {
  name?: string;
  description?: string | null;
  category?: ItemCategory;
  manufacturer?: string | null;
  catalogNumber?: string | null;
  requiresSterility?: boolean;
  isLoaner?: boolean;
}

export async function getCatalogItems(
  token: string,
  filters?: { category?: ItemCategory; includeInactive?: boolean }
): Promise<{ items: CatalogItem[] }> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.includeInactive) params.set('includeInactive', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/catalog${query}`, { token });
}

export async function getCatalogItem(token: string, catalogId: string): Promise<{ item: CatalogItem }> {
  return api(`/catalog/${catalogId}`, { token });
}

export async function createCatalogItem(token: string, data: CreateCatalogItemRequest): Promise<{ item: CatalogItem }> {
  return api('/catalog', { method: 'POST', body: data, token });
}

export async function updateCatalogItem(token: string, catalogId: string, data: UpdateCatalogItemRequest): Promise<{ item: CatalogItem }> {
  return api(`/catalog/${catalogId}`, { method: 'PATCH', body: data, token });
}

export async function deactivateCatalogItem(token: string, catalogId: string): Promise<{ success: boolean }> {
  return api(`/catalog/${catalogId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function activateCatalogItem(token: string, catalogId: string): Promise<{ success: boolean }> {
  return api(`/catalog/${catalogId}/activate`, { method: 'POST', body: {}, token });
}

// ============================================================================
// PREFERENCE CARDS MANAGEMENT
// ============================================================================

export interface PreferenceCardItem {
  catalogId: string;
  catalogName: string;
  category: ItemCategory;
  quantity: number;
  notes: string | null;
}

export interface PreferenceCardVersion {
  id: string;
  versionNumber: number;
  items: PreferenceCardItem[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface PreferenceCard {
  id: string;
  surgeonId: string;
  surgeonName: string;
  procedureName: string;
  description: string | null;
  active: boolean;
  currentVersion: PreferenceCardVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreferenceCardRequest {
  surgeonId: string;
  procedureName: string;
  description?: string;
  items: Array<{ catalogId: string; quantity: number; notes?: string }>;
}

export interface UpdatePreferenceCardRequest {
  procedureName?: string;
  description?: string | null;
}

export interface CreatePreferenceCardVersionRequest {
  items: Array<{ catalogId: string; quantity: number; notes?: string }>;
}

export async function getPreferenceCards(
  token: string,
  filters?: { surgeonId?: string; includeInactive?: boolean }
): Promise<{ cards: PreferenceCard[] }> {
  const params = new URLSearchParams();
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.includeInactive) params.set('includeInactive', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/preference-cards${query}`, { token });
}

export async function getPreferenceCard(token: string, cardId: string): Promise<{ card: PreferenceCard }> {
  return api(`/preference-cards/${cardId}`, { token });
}

export async function getPreferenceCardVersions(token: string, cardId: string): Promise<{ versions: PreferenceCardVersion[] }> {
  return api(`/preference-cards/${cardId}/versions`, { token });
}

export async function createPreferenceCard(token: string, data: CreatePreferenceCardRequest): Promise<{ card: PreferenceCard }> {
  return api('/preference-cards', { method: 'POST', body: data, token });
}

export async function updatePreferenceCard(token: string, cardId: string, data: UpdatePreferenceCardRequest): Promise<{ card: PreferenceCard }> {
  return api(`/preference-cards/${cardId}`, { method: 'PATCH', body: data, token });
}

export async function createPreferenceCardVersion(
  token: string,
  cardId: string,
  data: CreatePreferenceCardVersionRequest
): Promise<{ version: PreferenceCardVersion }> {
  return api(`/preference-cards/${cardId}/versions`, { method: 'POST', body: data, token });
}

export async function deactivatePreferenceCard(token: string, cardId: string): Promise<{ success: boolean }> {
  return api(`/preference-cards/${cardId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function activatePreferenceCard(token: string, cardId: string): Promise<{ success: boolean }> {
  return api(`/preference-cards/${cardId}/activate`, { method: 'POST', body: {}, token });
}

// ============================================================================
// INVENTORY ITEMS (Extended)
// ============================================================================

export interface InventoryItemDetail {
  id: string;
  catalogId: string;
  catalogName: string;
  category: ItemCategory;
  manufacturer?: string;
  barcode: string | null;
  serialNumber: string | null;
  lotNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  sterilityStatus: string;
  sterilityExpiresAt: string | null;
  availabilityStatus: string;
  lastVerifiedAt: string | null;
  lastVerifiedByUserId: string | null;
  lastVerifiedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryItemRequest {
  catalogId: string;
  serialNumber?: string;
  lotNumber?: string;
  barcode?: string;
  locationId?: string;
  sterilityStatus?: string;
  sterilityExpiresAt?: string;
}

export interface UpdateInventoryItemRequest {
  locationId?: string | null;
  sterilityStatus?: string;
  sterilityExpiresAt?: string | null;
  barcode?: string | null;
  serialNumber?: string | null;
  lotNumber?: string | null;
}

export interface InventoryItemEvent {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  deviceId: string | null;
  deviceName: string | null;
  userId: string | null;
  userName: string | null;
  occurredAt: string;
  createdAt: string;
}

export async function getInventoryItem(token: string, itemId: string): Promise<{ item: InventoryItemDetail }> {
  return api(`/inventory/items/${itemId}`, { token });
}

export async function createInventoryItem(token: string, data: CreateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return api('/inventory/items', { method: 'POST', body: data, token });
}

export async function updateInventoryItem(token: string, itemId: string, data: UpdateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return api(`/inventory/items/${itemId}`, { method: 'PATCH', body: data, token });
}

export async function getInventoryItemHistory(token: string, itemId: string): Promise<{ events: InventoryItemEvent[] }> {
  return api(`/inventory/items/${itemId}/history`, { token });
}

// Create inventory event (manual actions like VERIFY, RECEIVE, LOCATION_CHANGED)
export interface CreateInventoryEventRequest {
  inventoryItemId: string;
  eventType: string;
  caseId?: string;
  locationId?: string;
  sterilityStatus?: string;
  notes?: string;
  occurredAt?: string;
}

export async function createInventoryEvent(
  token: string,
  data: CreateInventoryEventRequest
): Promise<{ success: boolean }> {
  return api('/inventory/events', { method: 'POST', body: data, token });
}

// Alias for sendDeviceEvent (for consistency)
export const createDeviceEvent = sendDeviceEvent;

// ============================================================================
// SETTINGS & ROOMS (Extended)
// ============================================================================

export interface RoomDetail {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomRequest {
  name: string;
}

export interface UpdateRoomRequest {
  name?: string;
}

export async function getSettingsRooms(
  token: string,
  includeInactive = false
): Promise<{ rooms: RoomDetail[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return api(`/settings/rooms${query}`, { token });
}

export async function createRoom(token: string, data: CreateRoomRequest): Promise<{ room: RoomDetail }> {
  return api('/settings/rooms', { method: 'POST', body: data, token });
}

export async function updateRoom(token: string, roomId: string, data: UpdateRoomRequest): Promise<{ room: RoomDetail }> {
  return api(`/settings/rooms/${roomId}`, { method: 'PATCH', body: data, token });
}

export async function deactivateRoom(token: string, roomId: string): Promise<{ success: boolean }> {
  return api(`/settings/rooms/${roomId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function activateRoom(token: string, roomId: string): Promise<{ success: boolean }> {
  return api(`/settings/rooms/${roomId}/activate`, { method: 'POST', body: {}, token });
}

// ============================================================================
// CASE DASHBOARD
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
  facility: string;
  facilityId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  surgeon: string;
  surgeonId: string;
  procedureName: string;
  status: string;
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
  patientFlags: {
    latexAllergy: boolean;
    iodineAllergy: boolean;
    nickelFree: boolean;
    anticoagulation: boolean;
    infectionRisk: boolean;
    neuromonitoringRequired: boolean;
  };
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

export async function getCaseDashboard(
  token: string,
  caseId: string
): Promise<{ dashboard: CaseDashboardData }> {
  return api(`/case-dashboard/${caseId}`, { token });
}

export async function attestCaseReadiness(
  token: string,
  caseId: string
): Promise<{ success: boolean; attestationState: AttestationState }> {
  return api(`/case-dashboard/${caseId}/attest`, { method: 'POST', body: {}, token });
}

export async function voidCaseAttestation(
  token: string,
  caseId: string,
  reason: string
): Promise<{ success: boolean; attestationState: AttestationState }> {
  return api(`/case-dashboard/${caseId}/void`, { method: 'POST', body: { reason }, token });
}

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
  return api(`/case-dashboard/${caseId}/anesthesia`, { method: 'PUT', body: data, token });
}

export async function linkCaseCard(
  token: string,
  caseId: string,
  caseCardVersionId: string
): Promise<{ success: boolean }> {
  return api(`/case-dashboard/${caseId}/link-case-card`, {
    method: 'PUT',
    body: { caseCardVersionId },
    token,
  });
}

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
  return api(`/case-dashboard/${caseId}/overrides`, { method: 'POST', body: data, token });
}

export async function updateCaseOverride(
  token: string,
  caseId: string,
  overrideId: string,
  data: {
    overrideValue?: string;
    reason?: string;
  }
): Promise<{ success: boolean }> {
  return api(`/case-dashboard/${caseId}/overrides/${overrideId}`, { method: 'PUT', body: data, token });
}

export async function removeCaseOverride(
  token: string,
  caseId: string,
  overrideId: string
): Promise<{ success: boolean }> {
  return api(`/case-dashboard/${caseId}/overrides/${overrideId}`, { method: 'DELETE', token });
}

export async function getCaseEventLog(
  token: string,
  caseId: string
): Promise<{ eventLog: CaseDashboardEventLogEntry[] }> {
  return api(`/case-dashboard/${caseId}/event-log`, { token });
}

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
    patientFlags?: {
      latexAllergy: boolean;
      iodineAllergy: boolean;
      nickelFree: boolean;
      anticoagulation: boolean;
      infectionRisk: boolean;
      neuromonitoringRequired: boolean;
    };
  }
): Promise<{ success: boolean }> {
  return api(`/case-dashboard/${caseId}/case-summary`, { method: 'PUT', body: data, token });
}

export async function updateCaseScheduling(
  token: string,
  caseId: string,
  data: {
    scheduledDate?: string;
    scheduledTime?: string | null;
    orRoom?: string | null;
  }
): Promise<{ success: boolean }> {
  return api(`/case-dashboard/${caseId}/scheduling`, { method: 'PUT', body: data, token });
}

// ============================================================================
// READINESS VERIFICATION (Scanner-based workflow)
// ============================================================================

export interface VerificationItem {
  id: string;
  barcode: string | null;
  serialNumber: string | null;
  locationName: string | null;
  sterilityStatus: string;
  sterilityExpiresAt: string | null;
  availabilityStatus: string;
  isReservedForThisCase: boolean;
  lastVerifiedAt: string | null;
  lastVerifiedByName: string | null;
  isVerified: boolean;
}

export interface VerificationRequirement {
  id: string;
  catalogId: string;
  catalogName: string;
  category: string;
  requiredQuantity: number;
  requiresSterility: boolean;
  availableCount: number;
  verifiedCount: number;
  suitableCount: number;
  isSatisfied: boolean;
  items: VerificationItem[];
}

export interface CaseVerificationResponse {
  caseId: string;
  procedureName: string;
  surgeonName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  requirements: VerificationRequirement[];
  summary: {
    totalRequirements: number;
    satisfiedRequirements: number;
    totalRequired: number;
    totalVerified: number;
    allSatisfied: boolean;
    readinessState: 'GREEN' | 'ORANGE' | 'RED';
  };
}

export async function getCaseVerification(
  token: string,
  caseId: string
): Promise<CaseVerificationResponse> {
  return api(`/readiness/cases/${caseId}/verification`, { token });
}

// ============================================================================
// HELPERS
// ============================================================================

export async function getSurgeons(token: string): Promise<{ users: User[] }> {
  const result = await getUsers(token, false);
  return { users: result.users.filter(u => u.role === 'SURGEON') };
}
