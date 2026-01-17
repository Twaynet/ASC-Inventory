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
  barcode: string | null;
  serialNumber: string | null;
  lotNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  sterilityStatus: string;
  sterilityExpiresAt: string | null;
  availabilityStatus: string;
  lastVerifiedAt: string | null;
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
// HELPERS
// ============================================================================

export async function getSurgeons(token: string): Promise<{ users: User[] }> {
  const result = await getUsers(token, false);
  return { users: result.users.filter(u => u.role === 'SURGEON') };
}
