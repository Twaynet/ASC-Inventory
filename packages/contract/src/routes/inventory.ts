/**
 * Inventory route contracts.
 */

import { z } from 'zod';
import { InventoryEventType, SterilityStatus } from '@asc/domain';
import { defineRoute } from '../define-route.js';
import { SuccessEnvelope } from '../envelope.js';

// ---------------------------------------------------------------------------
// Body schemas
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

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

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
};
