/**
 * Zod schemas for API response validation.
 *
 * These match the JSON wire format (strings for dates/UUIDs, not Date objects).
 * Domain schemas in @asc/domain use z.date() and z.string().uuid() which don't
 * match raw JSON, so we define web-local schemas here.
 *
 * Naming convention: <Entity>ApiSchema for response shapes.
 */

import { z } from 'zod';

// ============================================================================
// Shared primitives
// ============================================================================

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const CaseLinkSchema = z.object({
  caseId: z.string().optional(),
  hasCase: z.boolean(),
  redacted: z.boolean(),
});

// ============================================================================
// Cases
// ============================================================================

export const CaseApiSchema = z.object({
  id: z.string(),
  caseNumber: z.string(),
  facilityId: z.string(),
  scheduledDate: nullableString,
  scheduledTime: nullableString,
  requestedDate: nullableString,
  requestedTime: nullableString,
  surgeonId: z.string(),
  surgeonName: z.string(),
  procedureName: z.string(),
  preferenceCardVersionId: nullableString,
  status: z.string(),
  notes: nullableString,
  isActive: z.boolean(),
  activatedAt: nullableString,
  activatedByUserId: nullableString,
  isCancelled: z.boolean(),
  cancelledAt: nullableString,
  cancelledByUserId: nullableString,
  rejectedAt: nullableString,
  rejectedByUserId: nullableString,
  rejectionReason: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CaseListResponseSchema = z.object({ cases: z.array(CaseApiSchema) });
export const CaseResponseSchema = z.object({ case: CaseApiSchema });
export const DeleteCaseResponseSchema = z.object({ success: z.boolean(), message: z.string() });

// Request schemas
export const ActivateCaseRequestSchema = z.object({
  scheduledDate: z.string(),
  scheduledTime: z.string().optional(),
});

export const ApproveCaseRequestSchema = z.object({
  scheduledDate: z.string(),
  scheduledTime: z.string().optional(),
  roomId: z.string().optional(),
});

export const RejectCaseRequestSchema = z.object({ reason: z.string() });
export const CancelCaseRequestSchema = z.object({ reason: z.string().optional() });

export const UpdateCaseRequestSchema = z.object({
  procedureName: z.string().optional(),
  surgeonId: z.string().optional(),
});

export const AssignRoomRequestSchema = z.object({
  roomId: z.string().nullable(),
  sortOrder: z.number().optional(),
  estimatedDurationMinutes: z.number().optional(),
});

// ============================================================================
// Inventory
// ============================================================================

export const InventoryItemApiSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  catalogName: z.string(),
  category: z.string(),
  barcode: nullableString,
  serialNumber: nullableString,
  locationId: nullableString,
  locationName: nullableString,
  sterilityStatus: z.string(),
  availabilityStatus: z.string(),
  caseLink: CaseLinkSchema,
  lastVerifiedAt: nullableString,
});

export const InventoryItemDetailApiSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  catalogName: z.string(),
  category: z.string(),
  manufacturer: z.string().optional(),
  barcode: nullableString,
  serialNumber: nullableString,
  lotNumber: nullableString,
  locationId: nullableString,
  locationName: nullableString,
  sterilityStatus: z.string(),
  sterilityExpiresAt: nullableString,
  availabilityStatus: z.string(),
  caseLink: CaseLinkSchema,
  lastVerifiedAt: nullableString,
  lastVerifiedByUserId: nullableString,
  lastVerifiedByName: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InventoryItemEventApiSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  eventData: z.record(z.unknown()),
  deviceId: nullableString,
  deviceName: nullableString,
  userId: nullableString,
  userName: nullableString,
  occurredAt: z.string(),
  createdAt: z.string(),
});

export const DeviceApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceType: z.string(),
  locationId: nullableString,
  active: z.boolean(),
});

export const RiskQueueItemApiSchema = z.object({
  rule: z.enum(['MISSING_LOT', 'MISSING_SERIAL', 'MISSING_EXPIRATION', 'EXPIRED', 'EXPIRING_SOON']),
  severity: z.enum(['RED', 'ORANGE', 'YELLOW']),
  facilityId: z.string(),
  catalogId: z.string(),
  catalogName: z.string(),
  inventoryItemId: z.string(),
  identifier: nullableString,
  daysToExpire: nullableNumber,
  expiresAt: nullableString,
  missingFields: z.array(z.string()),
  explain: z.string(),
  debug: z.object({
    criticality: z.string(),
    requiresSterility: z.boolean(),
    expirationRequired: z.boolean(),
    effectiveWarningDays: z.number(),
  }),
});

export const GS1DataApiSchema = z.object({
  gtin: nullableString,
  lot: nullableString,
  expiration: nullableString,
  serial: nullableString,
});

export const CatalogMatchApiSchema = z.object({
  catalogId: z.string(),
  catalogName: z.string(),
});

export const DeviceEventResponseSchema = z.object({
  deviceEventId: z.string(),
  processed: z.boolean(),
  processedItemId: nullableString,
  candidate: InventoryItemDetailApiSchema.nullable(),
  gs1Data: GS1DataApiSchema.nullable(),
  catalogMatch: CatalogMatchApiSchema.nullable(),
  barcodeClassification: z.string(),
  error: nullableString,
});

export const InventoryItemListResponseSchema = z.object({ items: z.array(InventoryItemApiSchema) });
export const InventoryItemResponseSchema = z.object({ item: InventoryItemDetailApiSchema });
export const InventoryItemHistoryResponseSchema = z.object({ events: z.array(InventoryItemEventApiSchema) });
export const InventoryDevicesResponseSchema = z.object({ devices: z.array(DeviceApiSchema) });
export const InventoryRiskQueueResponseSchema = z.object({ riskItems: z.array(RiskQueueItemApiSchema) });
export const SuccessResponseSchema = z.object({ success: z.boolean() });

// Inventory request schemas
export const CreateInventoryEventRequestSchema = z.object({
  inventoryItemId: z.string(),
  eventType: z.string(),
  caseId: z.string().optional(),
  locationId: z.string().optional(),
  sterilityStatus: z.string().optional(),
  notes: z.string().optional(),
  occurredAt: z.string().optional(),
});

export const DeviceEventRequestSchema = z.object({
  deviceId: z.string(),
  deviceType: z.enum(['barcode', 'rfid', 'nfc', 'other']),
  payloadType: z.enum(['scan', 'presence', 'input']),
  rawValue: z.string(),
  occurredAt: z.string().optional(),
});

export const CreateInventoryItemRequestSchema = z.object({
  catalogId: z.string(),
  serialNumber: z.string().optional(),
  lotNumber: z.string().optional(),
  barcode: z.string().optional(),
  locationId: z.string().optional(),
  sterilityStatus: z.string().optional(),
  sterilityExpiresAt: z.string().optional(),
  barcodeGtin: z.string().optional(),
  barcodeParsedLot: z.string().optional(),
  barcodeParsedSerial: z.string().optional(),
  barcodeParsedExpiration: z.string().optional(),
  barcodeClassification: z.string().optional(),
  attestationReason: z.string().optional(),
});

export const UpdateInventoryItemRequestSchema = z.object({
  locationId: z.string().nullable().optional(),
  sterilityStatus: z.string().optional(),
  sterilityExpiresAt: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
});

// ============================================================================
// Catalog
// ============================================================================

const ItemCategorySchema = z.enum(['IMPLANT', 'INSTRUMENT', 'EQUIPMENT', 'MEDICATION', 'CONSUMABLE', 'PPE']);
const CriticalitySchema = z.enum(['CRITICAL', 'IMPORTANT', 'ROUTINE']);

export const CatalogItemApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: nullableString,
  category: ItemCategorySchema,
  manufacturer: nullableString,
  catalogNumber: nullableString,
  requiresSterility: z.boolean(),
  isLoaner: z.boolean(),
  active: z.boolean(),
  requiresLotTracking: z.boolean(),
  requiresSerialTracking: z.boolean(),
  requiresExpirationTracking: z.boolean(),
  criticality: CriticalitySchema,
  readinessRequired: z.boolean(),
  expirationWarningDays: nullableNumber,
  substitutable: z.boolean(),
  inventoryCount: z.number(),
  imageCount: z.number(),
  identifierCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CatalogImageApiSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  kind: z.enum(['PRIMARY', 'REFERENCE']),
  caption: nullableString,
  sortOrder: z.number(),
  assetUrl: z.string(),
  source: z.enum(['URL', 'UPLOAD']),
  createdAt: z.string(),
});

export const CatalogIdentifierApiSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  identifierType: z.string(),
  rawValue: z.string(),
  source: z.string(),
  classification: z.string(),
  createdAt: z.string(),
  createdByUserId: nullableString,
  creatorName: nullableString.optional(),
});

export const CatalogItemListResponseSchema = z.object({ items: z.array(CatalogItemApiSchema) });
export const CatalogItemResponseSchema = z.object({ item: CatalogItemApiSchema });
export const CatalogImagesResponseSchema = z.object({ images: z.array(CatalogImageApiSchema) });
export const CatalogImageResponseSchema = z.object({ image: CatalogImageApiSchema });
export const CatalogIdentifiersResponseSchema = z.object({ identifiers: z.array(CatalogIdentifierApiSchema) });
export const CatalogIdentifierResponseSchema = z.object({
  identifier: CatalogIdentifierApiSchema,
  gs1Data: GS1DataApiSchema.nullable(),
});

// Catalog request schemas
export const CreateCatalogItemRequestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: ItemCategorySchema,
  manufacturer: z.string().optional(),
  catalogNumber: z.string().optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: CriticalitySchema.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().nullable().optional(),
  substitutable: z.boolean().optional(),
});

export const UpdateCatalogItemRequestSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  category: ItemCategorySchema.optional(),
  manufacturer: z.string().nullable().optional(),
  catalogNumber: z.string().nullable().optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: CriticalitySchema.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().nullable().optional(),
  substitutable: z.boolean().optional(),
});

export const AddCatalogImageByUrlRequestSchema = z.object({
  assetUrl: z.string(),
  kind: z.enum(['PRIMARY', 'REFERENCE']).optional(),
  caption: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const UpdateCatalogImageRequestSchema = z.object({
  kind: z.enum(['PRIMARY', 'REFERENCE']).optional(),
  caption: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const AddCatalogIdentifierRequestSchema = z.object({
  rawValue: z.string(),
  source: z.string().optional(),
});
