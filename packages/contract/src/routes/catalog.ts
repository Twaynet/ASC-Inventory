/**
 * Catalog route contracts.
 */

import { z } from 'zod';
import { ItemCategory, Criticality } from '@asc/domain';
import { defineRoute } from '../define-route.js';
import { SuccessEnvelope } from '../envelope.js';

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const CatalogItemApiSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: nullableString,
  category: ItemCategory,
  manufacturer: nullableString,
  catalogNumber: nullableString,
  requiresSterility: z.boolean(),
  isLoaner: z.boolean(),
  active: z.boolean(),
  requiresLotTracking: z.boolean(),
  requiresSerialTracking: z.boolean(),
  requiresExpirationTracking: z.boolean(),
  criticality: Criticality,
  readinessRequired: z.boolean(),
  expirationWarningDays: nullableNumber,
  substitutable: z.boolean(),
  inventoryCount: z.number(),
  imageCount: z.number(),
  identifierCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CatalogItemApi = z.infer<typeof CatalogItemApiSchema>;

export const GS1DataSchema = z.object({
  gtin: nullableString,
  lot: nullableString,
  expiration: nullableString,
  serial: nullableString,
});

export const CatalogIdentifierApiSchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  identifierType: z.string(),
  rawValue: z.string(),
  source: z.string(),
  classification: z.string(),
  createdAt: z.string(),
  createdByUserId: nullableString,
  creatorName: nullableString.optional(),
});

export const CatalogImageApiSchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  kind: z.string(),
  caption: nullableString,
  sortOrder: z.number(),
  assetUrl: z.string(),
  source: z.string(),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// Query / body schemas
// ---------------------------------------------------------------------------

export const CatalogListQuerySchema = z.object({
  category: z.string().optional(),
  includeInactive: z.string().optional(),
});

export const AddIdentifierBodySchema = z.object({
  rawValue: z.string(),
  source: z.string().optional(),
});

export const CreateCatalogItemBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  category: ItemCategory,
  manufacturer: z.string().max(255).optional(),
  catalogNumber: z.string().max(100).optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: Criticality.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().int().positive().nullable().optional(),
  substitutable: z.boolean().optional(),
});

export const UpdateCatalogItemBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  category: ItemCategory.optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  catalogNumber: z.string().max(100).nullable().optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: Criticality.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().int().positive().nullable().optional(),
  substitutable: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

const CatalogListResponsePayload = z.object({ items: z.array(CatalogItemApiSchema) });
const CatalogItemResponsePayload = z.object({ item: CatalogItemApiSchema });
const AddIdentifierResponsePayload = z.object({
  identifier: CatalogIdentifierApiSchema,
  gs1Data: GS1DataSchema.nullable(),
});
const IdentifierListResponsePayload = z.object({ identifiers: z.array(CatalogIdentifierApiSchema) });
const ImageListResponsePayload = z.object({ images: z.array(CatalogImageApiSchema) });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const catalogIdParams = z.object({ catalogId: z.string().uuid() });

export const catalogRoutes = {
  list: defineRoute({
    method: 'GET' as const,
    path: '/catalog',
    summary: 'List all catalog items',
    query: CatalogListQuerySchema,
    response: CatalogListResponsePayload,
  }),

  get: defineRoute({
    method: 'GET' as const,
    path: '/catalog/:catalogId',
    summary: 'Get a single catalog item',
    params: catalogIdParams,
    response: CatalogItemResponsePayload,
  }),

  create: defineRoute({
    method: 'POST' as const,
    path: '/catalog',
    summary: 'Create a new catalog item',
    body: CreateCatalogItemBodySchema,
    response: CatalogItemResponsePayload,
  }),

  update: defineRoute({
    method: 'PATCH' as const,
    path: '/catalog/:catalogId',
    summary: 'Update a catalog item',
    params: catalogIdParams,
    body: UpdateCatalogItemBodySchema,
    response: CatalogItemResponsePayload,
  }),

  deactivate: defineRoute({
    method: 'POST' as const,
    path: '/catalog/:catalogId/deactivate',
    summary: 'Deactivate a catalog item',
    params: catalogIdParams,
    response: SuccessEnvelope,
  }),

  activate: defineRoute({
    method: 'POST' as const,
    path: '/catalog/:catalogId/activate',
    summary: 'Activate a catalog item',
    params: catalogIdParams,
    response: SuccessEnvelope,
  }),

  listIdentifiers: defineRoute({
    method: 'GET' as const,
    path: '/catalog/:catalogId/identifiers',
    summary: 'List identifiers for a catalog item',
    params: catalogIdParams,
    response: IdentifierListResponsePayload,
  }),

  addIdentifier: defineRoute({
    method: 'POST' as const,
    path: '/catalog/:catalogId/identifiers',
    summary: 'Add a barcode/identifier to a catalog item',
    params: catalogIdParams,
    body: AddIdentifierBodySchema,
    response: AddIdentifierResponsePayload,
  }),

  deleteIdentifier: defineRoute({
    method: 'DELETE' as const,
    path: '/catalog/:catalogId/identifiers/:identifierId',
    summary: 'Delete a catalog identifier',
    params: z.object({
      catalogId: z.string().uuid(),
      identifierId: z.string().uuid(),
    }),
    response: 'void' as const,
  }),

  listImages: defineRoute({
    method: 'GET' as const,
    path: '/catalog/:catalogId/images',
    summary: 'List images for a catalog item',
    params: catalogIdParams,
    response: ImageListResponsePayload,
  }),

  deleteImage: defineRoute({
    method: 'DELETE' as const,
    path: '/catalog/:catalogId/images/:imageId',
    summary: 'Delete a catalog image',
    params: z.object({
      catalogId: z.string().uuid(),
      imageId: z.string().uuid(),
    }),
    response: 'void' as const,
  }),
};
