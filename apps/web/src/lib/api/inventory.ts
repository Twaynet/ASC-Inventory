/**
 * Inventory API module
 */

import { request, API_BASE } from './client';
import type { ItemCategory } from './catalog';

// ============================================================================
// Types
// ============================================================================

export interface InventoryItem {
  id: string;
  catalogId: string;
  catalogName: string;
  category: string;
  barcode: string | null;
  serialNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  sterilityStatus: string;
  availabilityStatus: string;
  lastVerifiedAt: string | null;
}

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
  barcodeGtin?: string;
  barcodeParsedLot?: string;
  barcodeParsedSerial?: string;
  barcodeParsedExpiration?: string;
  barcodeClassification?: string;
  attestationReason?: string;
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

export interface CreateInventoryEventRequest {
  inventoryItemId: string;
  eventType: string;
  caseId?: string;
  locationId?: string;
  sterilityStatus?: string;
  notes?: string;
  occurredAt?: string;
}

export interface GS1Data {
  gtin: string | null;
  lot: string | null;
  expiration: string | null;
  serial: string | null;
}

export interface CatalogMatch {
  catalogId: string;
  catalogName: string;
}

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
  candidate: InventoryItemDetail | null;
  gs1Data: GS1Data | null;
  catalogMatch: CatalogMatch | null;
  barcodeClassification: string;
  error: string | null;
}

export interface Device {
  id: string;
  name: string;
  deviceType: string;
  locationId: string | null;
  active: boolean;
}

export interface RiskQueueItem {
  rule: 'MISSING_LOT' | 'MISSING_SERIAL' | 'MISSING_EXPIRATION' | 'EXPIRED' | 'EXPIRING_SOON';
  severity: 'RED' | 'ORANGE' | 'YELLOW';
  facilityId: string;
  catalogId: string;
  catalogName: string;
  inventoryItemId: string;
  identifier: string | null;
  daysToExpire: number | null;
  expiresAt: string | null;
  missingFields: string[];
  explain: string;
  debug: {
    criticality: string;
    requiresSterility: boolean;
    expirationRequired: boolean;
    effectiveWarningDays: number;
  };
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getInventoryItems(
  token: string,
  filters?: { catalogId?: string; locationId?: string; status?: string }
): Promise<{ items: InventoryItem[] }> {
  const params = new URLSearchParams();
  if (filters?.catalogId) params.set('catalogId', filters.catalogId);
  if (filters?.locationId) params.set('locationId', filters.locationId);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/inventory/items${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getInventoryItem(token: string, itemId: string): Promise<{ item: InventoryItemDetail }> {
  return request(`/inventory/items/${itemId}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createInventoryItem(token: string, data: CreateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return request('/inventory/items', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateInventoryItem(token: string, itemId: string, data: UpdateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return request(`/inventory/items/${itemId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function getInventoryItemHistory(token: string, itemId: string): Promise<{ events: InventoryItemEvent[] }> {
  return request(`/inventory/items/${itemId}/history`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createInventoryEvent(
  token: string,
  data: CreateInventoryEventRequest
): Promise<{ success: boolean }> {
  return request('/inventory/events', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function sendDeviceEvent(
  token: string,
  data: DeviceEventRequest
): Promise<DeviceEventResponse> {
  return request('/inventory/device-events', { method: 'POST', body: data, token });
}

// Alias for sendDeviceEvent (for consistency)
export const createDeviceEvent = sendDeviceEvent;

// TODO(api-schema): needs Zod response schema
export async function getDevices(token: string): Promise<{ devices: Device[] }> {
  return request('/inventory/devices', { token });
}

// TODO(api-schema): needs Zod response schema
export async function getInventoryRiskQueue(token: string): Promise<{ riskItems: RiskQueueItem[] }> {
  return request('/inventory/risk-queue', { token });
}
