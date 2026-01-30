/**
 * Catalog route contracts.
 */

import { z } from 'zod';
import { ItemCategory, Criticality } from '@asc/domain';
import { defineRoute } from '../define-route.js';

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

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

const CatalogListResponsePayload = z.object({ items: z.array(CatalogItemApiSchema) });
const AddIdentifierResponsePayload = z.object({
  identifier: CatalogIdentifierApiSchema,
  gs1Data: GS1DataSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const catalogRoutes = {
  list: defineRoute({
    method: 'GET' as const,
    path: '/catalog',
    summary: 'List all catalog items',
    query: CatalogListQuerySchema,
    response: CatalogListResponsePayload,
  }),

  addIdentifier: defineRoute({
    method: 'POST' as const,
    path: '/catalog/:catalogId/identifiers',
    summary: 'Add a barcode/identifier to a catalog item',
    params: z.object({ catalogId: z.string().uuid() }),
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
