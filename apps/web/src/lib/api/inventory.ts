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

export interface CaseLink {
  caseId?: string;
  hasCase: boolean;
  redacted: boolean;
}

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
  sterilityExpiresAt: string | null;
  availabilityStatus: string;
  lastVerifiedAt: string | null;
  caseLink: CaseLink;
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
  caseLink: CaseLink;
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
  caseLink: CaseLink;
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
  adjustment?: { availabilityStatus: 'MISSING' | 'AVAILABLE' };
  reason?: string;
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

// ============================================================================
// Missing Analytics
// ============================================================================

export type MissingAnalyticsGroupBy = 'day' | 'location' | 'catalog' | 'surgeon' | 'staff';
export type MissingAnalyticsResolution = 'MISSING' | 'FOUND' | 'BOTH';

export interface MissingAnalyticsGroup {
  key: string;
  label: string;
  missingCount: number;
  foundCount: number;
}

export interface MissingAnalyticsResponse {
  summary: {
    totalMissing: number;
    totalFound: number;
    netOpen: number;
    resolutionRate: number | null;
  };
  groups: MissingAnalyticsGroup[];
  topDrivers: MissingAnalyticsGroup[] | null;
}

export async function getMissingAnalytics(
  token: string,
  params: {
    start: string;
    end: string;
    groupBy: MissingAnalyticsGroupBy;
    resolution?: MissingAnalyticsResolution;
  }
): Promise<MissingAnalyticsResponse> {
  return callContract(contract.inventory.missingAnalytics, {
    query: { resolution: 'BOTH', ...params },
    token,
  }) as Promise<MissingAnalyticsResponse>;
}

// ============================================================================
// Missing Events Drill-Down
// ============================================================================

export interface MissingEventItem {
  id: string;
  occurredAt: string;
  type: 'MISSING' | 'FOUND';
  inventoryItemId: string;
  catalogName: string;
  lotNumber: string | null;
  serialNumber: string | null;
  locationName: string | null;
  surgeonName: string | null;
  staffName: string | null;
  notes: string;
}

export interface MissingEventsResponse {
  total: number;
  events: MissingEventItem[];
}

export async function getMissingEvents(
  token: string,
  params: {
    start: string;
    end: string;
    groupBy: MissingAnalyticsGroupBy;
    resolution?: MissingAnalyticsResolution;
    groupKey?: string;
    date?: string;
    limit?: number;
    offset?: number;
  }
): Promise<MissingEventsResponse> {
  return callContract(contract.inventory.missingEvents, {
    query: {
      resolution: 'BOTH',
      ...params,
      limit: String(params.limit ?? 100),
      offset: String(params.offset ?? 0),
    },
    token,
  }) as Promise<MissingEventsResponse>;
}

// ============================================================================
// Open Missing Aging
// ============================================================================

export interface OpenMissingAgingItem {
  inventoryItemId: string;
  catalogName: string;
  lotNumber: string | null;
  serialNumber: string | null;
  locationName: string | null;
  missingSince: string;
  daysMissing: number;
  lastStaffName: string | null;
}

export interface OpenMissingAgingResponse {
  total: number;
  items: OpenMissingAgingItem[];
}

export async function getOpenMissingAging(
  token: string,
): Promise<OpenMissingAgingResponse> {
  return callContract(contract.inventory.openMissingAging, {
    token,
  }) as Promise<OpenMissingAgingResponse>;
}

// ============================================================================
// Barcode / identifier lookup
// ============================================================================

export interface LookupItemSummary {
  inventoryItemId: string;
  catalogId: string;
  catalogName: string;
  barcode: string | null;
  serialNumber: string | null;
  lotNumber: string | null;
  availabilityStatus: string;
  sterilityStatus: string;
  sterilityExpiresAt: string | null;
  locationId: string | null;
  locationName: string | null;
  caseLink: CaseLink;
}

export type LookupSource = 'BARCODE' | 'SERIAL' | 'GS1' | 'LOT';

export type LookupResult =
  | { match: 'SINGLE'; source: LookupSource; item: LookupItemSummary }
  | { match: 'MULTIPLE'; source: LookupSource; capped: boolean; items: LookupItemSummary[] }
  | { match: 'NONE' };

export async function lookupInventoryItem(
  token: string,
  code: string,
): Promise<LookupResult> {
  const encoded = encodeURIComponent(code);
  return request(`/inventory/items/lookup?code=${encoded}`, { token });
}

// ============================================================================
// Device Events (read-only)
// ============================================================================

export interface DeviceEventListItem {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  payloadType: string;
  rawValue: string;
  processed: boolean;
  processedItemId: string | null;
  processingError: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface DeviceEventListResponse {
  events: DeviceEventListItem[];
  nextCursor: string | null;
}

export async function getDeviceEvents(
  token: string,
  options?: {
    deviceId?: string;
    processed?: boolean;
    hasError?: boolean;
    start?: string;
    end?: string;
    q?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<DeviceEventListResponse> {
  const params = new URLSearchParams();
  if (options?.deviceId) params.set('deviceId', options.deviceId);
  if (options?.processed !== undefined) params.set('processed', String(options.processed));
  if (options?.hasError !== undefined) params.set('hasError', String(options.hasError));
  if (options?.start) params.set('start', options.start);
  if (options?.end) params.set('end', options.end);
  if (options?.q) params.set('q', options.q);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const query = params.toString();
  return request(`/inventory/device-events${query ? `?${query}` : ''}`, { token });
}

// ============================================================================
// Inventory Events (read-only, with financial filter)
// ============================================================================

export interface InventoryEventListItem {
  id: string;
  eventType: string;
  inventoryItemId: string;
  catalogName: string;
  caseId: string | null;
  locationName: string | null;
  previousLocationName: string | null;
  sterilityStatus: string | null;
  notes: string | null;
  performedByName: string | null;
  occurredAt: string;
  createdAt: string;
  costSnapshotCents: number | null;
  costOverrideCents: number | null;
  costOverrideReason: string | null;
  costOverrideNote: string | null;
  vendorId: string | null;
  vendorName: string | null;
  repName: string | null;
  isGratis: boolean;
  gratisReason: string | null;
}

export interface InventoryEventListResponse {
  events: InventoryEventListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function getInventoryEvents(
  token: string,
  options?: {
    financial?: boolean;
    eventType?: string;
    caseId?: string;
    vendorId?: string;
    gratis?: boolean;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  }
): Promise<InventoryEventListResponse> {
  const params = new URLSearchParams();
  if (options?.financial !== undefined) params.set('financial', String(options.financial));
  if (options?.eventType) params.set('eventType', options.eventType);
  if (options?.caseId) params.set('caseId', options.caseId);
  if (options?.vendorId) params.set('vendorId', options.vendorId);
  if (options?.gratis !== undefined) params.set('gratis', String(options.gratis));
  if (options?.start) params.set('start', options.start);
  if (options?.end) params.set('end', options.end);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const query = params.toString();
  return request(`/inventory/events${query ? `?${query}` : ''}`, { token });
}
