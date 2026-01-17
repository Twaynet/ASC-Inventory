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

export async function login(username: string, password: string): Promise<LoginResponse> {
  return api('/auth/login', { method: 'POST', body: { username, password } });
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
