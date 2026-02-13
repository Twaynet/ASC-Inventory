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

export const AdjustmentPayloadSchema = z.object({
  availabilityStatus: z.enum(['MISSING', 'AVAILABLE']),
}).strict();

export const CreateInventoryEventBodySchema = z.object({
  inventoryItemId: z.string().uuid(),
  eventType: InventoryEventType,
  caseId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  notes: z.string().optional(),
  deviceEventId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  adjustment: AdjustmentPayloadSchema.optional(),
  reason: z.string().max(2000).optional(),
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
// Missing Analytics schemas
// ---------------------------------------------------------------------------

export const MissingAnalyticsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  groupBy: z.enum(['day', 'location', 'catalog', 'surgeon', 'staff']),
  resolution: z.enum(['MISSING', 'FOUND', 'BOTH']).default('BOTH'),
});

const MissingAnalyticsGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  missingCount: z.number(),
  foundCount: z.number(),
});

const MissingAnalyticsResponsePayload = z.object({
  summary: z.object({
    totalMissing: z.number(),
    totalFound: z.number(),
    netOpen: z.number(),
    resolutionRate: z.number().nullable(),
  }),
  groups: z.array(MissingAnalyticsGroupSchema),
  topDrivers: z.array(MissingAnalyticsGroupSchema).nullable(),
});

// ---------------------------------------------------------------------------
// Missing Events drill-down schemas
// ---------------------------------------------------------------------------

export const MissingEventsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  resolution: z.enum(['MISSING', 'FOUND', 'BOTH']).default('BOTH'),
  groupBy: z.enum(['day', 'location', 'catalog', 'surgeon', 'staff']),
  groupKey: z.string().optional(),
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const MissingEventItemSchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string(),
  type: z.enum(['MISSING', 'FOUND']),
  inventoryItemId: z.string().uuid(),
  catalogName: z.string(),
  lotNumber: nullableString,
  serialNumber: nullableString,
  locationName: nullableString,
  surgeonName: nullableString,
  staffName: nullableString,
  notes: z.string(),
});

const MissingEventsResponsePayload = z.object({
  total: z.number(),
  events: z.array(MissingEventItemSchema),
});

// ---------------------------------------------------------------------------
// Open Missing Aging schemas
// ---------------------------------------------------------------------------

const OpenMissingAgingItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  catalogName: z.string(),
  lotNumber: nullableString,
  serialNumber: nullableString,
  locationName: nullableString,
  missingSince: z.string(),
  daysMissing: z.number(),
  lastStaffName: nullableString,
});

const OpenMissingAgingResponsePayload = z.object({
  total: z.number(),
  items: z.array(OpenMissingAgingItemSchema),
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

  missingAnalytics: defineRoute({
    method: 'GET' as const,
    path: '/inventory/missing-analytics',
    summary: 'Analytics over missing/found inventory events',
    query: MissingAnalyticsQuerySchema,
    response: MissingAnalyticsResponsePayload,
  }),

  missingEvents: defineRoute({
    method: 'GET' as const,
    path: '/inventory/missing-events',
    summary: 'Drill-down list of individual missing/found events',
    query: MissingEventsQuerySchema,
    response: MissingEventsResponsePayload,
  }),

  openMissingAging: defineRoute({
    method: 'GET' as const,
    path: '/inventory/open-missing-aging',
    summary: 'Currently missing items with aging metrics',
    response: OpenMissingAgingResponsePayload,
  }),
};
