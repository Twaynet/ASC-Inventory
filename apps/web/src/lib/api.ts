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
    email: string;
    name: string;
    role: string;
    facilityId: string;
    facilityName: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return api('/auth/login', { method: 'POST', body: { email, password } });
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
  scheduledDate: string;
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
