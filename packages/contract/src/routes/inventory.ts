/**
 * Inventory route contracts.
 */

import { z } from 'zod';
import { InventoryEventType, SterilityStatus } from '@asc/domain';
import { defineRoute } from '../define-route.js';
import { SuccessEnvelope } from '../envelope.js';

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();

const CaseLinkSchema = z.object({
  caseId: z.string().uuid().optional(),
  hasCase: z.boolean(),
  redacted: z.boolean(),
});

export const InventoryItemApiSchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  catalogName: z.string().optional(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  serialNumber: nullableString,
  lotNumber: nullableString,
  barcode: nullableString,
  locationId: nullableString,
  locationName: nullableString.optional(),
  sterilityStatus: z.string(),
  sterilityExpiresAt: nullableString,
  availabilityStatus: z.string(),
  caseLink: CaseLinkSchema,
  lastVerifiedAt: nullableString,
  lastVerifiedByUserId: nullableString,
  lastVerifiedByName: nullableString.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InventoryEventApiSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  caseLink: CaseLinkSchema,
  locationId: nullableString,
  locationName: nullableString.optional(),
  previousLocationId: nullableString,
  previousLocationName: nullableString.optional(),
  sterilityStatus: nullableString,
  notes: nullableString,
  performedByUserId: z.string().uuid(),
  performedByName: nullableString.optional(),
  deviceEventId: nullableString,
  occurredAt: z.string(),
  createdAt: z.string(),
});

export const RiskQueueItemApiSchema = z.object({
  rule: z.string(),
  severity: z.string(),
  facilityId: z.string().uuid(),
  catalogId: z.string().uuid(),
  catalogName: z.string(),
  inventoryItemId: z.string().uuid(),
  identifier: nullableString,
  daysToExpire: z.number().nullable(),
  expiresAt: nullableString,
  missingFields: z.array(z.string()).optional(),
  explain: z.string(),
  debug: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Body / query schemas
// ---------------------------------------------------------------------------

export const CreateInventoryEventBodySchema = z.object({
  inventoryItemId: z.string().uuid(),
  eventType: InventoryEventType,
  caseId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  notes: z.string().optional(),
  deviceEventId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
});

export const BulkInventoryEventBodySchema = z.object({
  events: z.array(CreateInventoryEventBodySchema).min(1).max(100),
});

export const InventoryItemListQuerySchema = z.object({
  catalogId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.string().optional(),
});

export const CreateInventoryItemBodySchema = z.object({
  catalogId: z.string().uuid(),
  serialNumber: z.string().max(100).optional(),
  lotNumber: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  sterilityExpiresAt: z.string().datetime().optional(),
  barcodeGtin: z.string().max(14).optional(),
  barcodeParsedLot: z.string().max(255).optional(),
  barcodeParsedSerial: z.string().max(255).optional(),
  barcodeParsedExpiration: z.string().optional(),
  barcodeClassification: z.string().optional(),
  attestationReason: z.string().max(500).optional(),
});

export const UpdateInventoryItemBodySchema = z.object({
  serialNumber: z.string().max(100).nullable().optional(),
  lotNumber: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  sterilityStatus: SterilityStatus.optional(),
  sterilityExpiresAt: z.string().datetime().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

const ItemResponsePayload = z.object({ item: InventoryItemApiSchema });
const ItemListResponsePayload = z.object({ items: z.array(InventoryItemApiSchema) });
const EventListResponsePayload = z.object({ events: z.array(InventoryEventApiSchema) });
const RiskQueueResponsePayload = z.object({ riskItems: z.array(RiskQueueItemApiSchema) });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const itemIdParams = z.object({ itemId: z.string().uuid() });

export const inventoryRoutes = {
  createEvent: defineRoute({
    method: 'POST' as const,
    path: '/inventory/events',
    summary: 'Record a single inventory event',
    body: CreateInventoryEventBodySchema,
    response: SuccessEnvelope,
  }),

  bulkEvents: defineRoute({
    method: 'POST' as const,
    path: '/inventory/events/bulk',
    summary: 'Record multiple inventory events in one request',
    body: BulkInventoryEventBodySchema,
    response: SuccessEnvelope,
  }),

  listItems: defineRoute({
    method: 'GET' as const,
    path: '/inventory/items',
    summary: 'List inventory items with optional filters',
    query: InventoryItemListQuerySchema,
    response: ItemListResponsePayload,
  }),

  getItem: defineRoute({
    method: 'GET' as const,
    path: '/inventory/items/:itemId',
    summary: 'Get a single inventory item',
    params: itemIdParams,
    response: ItemResponsePayload,
  }),

  createItem: defineRoute({
    method: 'POST' as const,
    path: '/inventory/items',
    summary: 'Create (check in) an inventory item',
    body: CreateInventoryItemBodySchema,
    response: ItemResponsePayload,
  }),

  updateItem: defineRoute({
    method: 'PATCH' as const,
    path: '/inventory/items/:itemId',
    summary: 'Update an inventory item',
    params: itemIdParams,
    body: UpdateInventoryItemBodySchema,
    response: ItemResponsePayload,
  }),

  itemHistory: defineRoute({
    method: 'GET' as const,
    path: '/inventory/items/:itemId/history',
    summary: 'Get event history for an inventory item',
    params: itemIdParams,
    response: EventListResponsePayload,
  }),

  riskQueue: defineRoute({
    method: 'GET' as const,
    path: '/inventory/risk-queue',
    summary: 'Computed inventory risk items',
    response: RiskQueueResponsePayload,
  }),
};
