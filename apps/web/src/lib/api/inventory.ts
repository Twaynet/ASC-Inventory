/**
 * Inventory API module
 */

import { request, API_BASE } from './client';
import { callContract } from './contract-client';
import { contract } from '@asc/contract';
import type { ItemCategory } from './catalog';
import {
  InventoryDevicesResponseSchema,
  DeviceEventResponseSchema,
  DeviceEventRequestSchema,
} from './schemas';

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
  caseId: string | null;
  caseName?: string | null;
  locationId: string | null;
  locationName?: string | null;
  previousLocationId: string | null;
  previousLocationName?: string | null;
  sterilityStatus: string | null;
  notes: string | null;
  performedByUserId: string;
  performedByName?: string | null;
  deviceEventId: string | null;
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

export async function getInventoryItems(
  token: string,
  filters?: { catalogId?: string; locationId?: string; status?: string }
): Promise<{ items: InventoryItem[] }> {
  return callContract(contract.inventory.listItems, {
    query: filters,
    token,
  }) as Promise<{ items: InventoryItem[] }>;
}

export async function getInventoryItem(token: string, itemId: string): Promise<{ item: InventoryItemDetail }> {
  return callContract(contract.inventory.getItem, {
    params: { itemId },
    token,
  }) as Promise<{ item: InventoryItemDetail }>;
}

export async function createInventoryItem(token: string, data: CreateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return callContract(contract.inventory.createItem, {
    body: data,
    token,
  }) as Promise<{ item: InventoryItemDetail }>;
}

export async function updateInventoryItem(token: string, itemId: string, data: UpdateInventoryItemRequest): Promise<{ item: InventoryItemDetail }> {
  return callContract(contract.inventory.updateItem, {
    params: { itemId },
    body: data,
    token,
  }) as Promise<{ item: InventoryItemDetail }>;
}

export async function getInventoryItemHistory(token: string, itemId: string): Promise<{ events: InventoryItemEvent[] }> {
  return callContract(contract.inventory.itemHistory, {
    params: { itemId },
    token,
  }) as Promise<{ events: InventoryItemEvent[] }>;
}

export async function createInventoryEvent(
  token: string,
  data: CreateInventoryEventRequest
): Promise<{ success: boolean }> {
  return callContract(contract.inventory.createEvent, {
    body: data,
    token,
  }) as Promise<{ success: boolean }>;
}

export async function sendDeviceEvent(
  token: string,
  data: DeviceEventRequest
): Promise<DeviceEventResponse> {
  return request('/inventory/device-events', { method: 'POST', body: data, token, requestSchema: DeviceEventRequestSchema, responseSchema: DeviceEventResponseSchema });
}

// Alias for sendDeviceEvent (for consistency)
export const createDeviceEvent = sendDeviceEvent;

export async function getDevices(token: string): Promise<{ devices: Device[] }> {
  return request('/inventory/devices', { token, responseSchema: InventoryDevicesResponseSchema });
}

export async function getInventoryRiskQueue(token: string): Promise<{ riskItems: RiskQueueItem[] }> {
  return callContract(contract.inventory.riskQueue, {
    token,
  }) as Promise<{ riskItems: RiskQueueItem[] }>;
}
