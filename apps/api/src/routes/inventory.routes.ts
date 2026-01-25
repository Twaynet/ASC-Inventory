/**
 * Inventory Routes
 * Inventory events ingestion (including from device adapter)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateInventoryEventRequestSchema,
  BulkInventoryEventRequestSchema,
  CreateDeviceEventRequestSchema,
  CreateInventoryItemRequestSchema,
  UpdateInventoryItemRequestSchema,
} from '../schemas/index.js';
import { requireInventoryTech, requireAdmin } from '../plugins/auth.js';
import {
  getInventoryRepository,
  getDeviceRepository,
  KEYBOARD_WEDGE_DEVICE_ID,
} from '../repositories/index.js';

// Helper to format inventory item for API response
function formatInventoryItem(item: {
  id: string;
  catalogId: string;
  catalogName?: string;
  category?: string;
  manufacturer?: string;
  serialNumber: string | null;
  lotNumber: string | null;
  barcode: string | null;
  locationId: string | null;
  locationName?: string | null;
  sterilityStatus: string;
  sterilityExpiresAt: Date | null;
  availabilityStatus: string;
  reservedForCaseId?: string | null;
  lastVerifiedAt: Date | null;
  lastVerifiedByUserId: string | null;
  lastVerifiedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    catalogId: item.catalogId,
    catalogName: item.catalogName,
    category: item.category,
    manufacturer: item.manufacturer,
    serialNumber: item.serialNumber,
    lotNumber: item.lotNumber,
    barcode: item.barcode,
    locationId: item.locationId,
    locationName: item.locationName,
    sterilityStatus: item.sterilityStatus,
    sterilityExpiresAt: item.sterilityExpiresAt?.toISOString() || null,
    availabilityStatus: item.availabilityStatus,
    reservedForCaseId: item.reservedForCaseId,
    lastVerifiedAt: item.lastVerifiedAt?.toISOString() || null,
    lastVerifiedByUserId: item.lastVerifiedByUserId,
    lastVerifiedByName: item.lastVerifiedByName,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// Helper to format inventory event for API response
function formatInventoryEvent(event: {
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
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    caseId: event.caseId,
    caseName: event.caseName,
    locationId: event.locationId,
    locationName: event.locationName,
    previousLocationId: event.previousLocationId,
    previousLocationName: event.previousLocationName,
    sterilityStatus: event.sterilityStatus,
    notes: event.notes,
    performedByUserId: event.performedByUserId,
    performedByName: event.performedByName,
    deviceEventId: event.deviceEventId,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

// Compute item state update based on event type
function computeItemUpdate(eventType: string, eventData: {
  locationId?: string;
  sterilityStatus?: string;
  caseId?: string;
}, userId: string): Record<string, unknown> {
  const now = new Date();

  switch (eventType) {
    case 'VERIFIED':
      return {
        lastVerifiedAt: now,
        lastVerifiedByUserId: userId,
      };

    case 'LOCATION_CHANGED':
      return eventData.locationId ? { locationId: eventData.locationId } : {};

    case 'RESERVED':
      return {
        availabilityStatus: 'RESERVED',
        reservedForCaseId: eventData.caseId,
      };

    case 'RELEASED':
      return {
        availabilityStatus: 'AVAILABLE',
        reservedForCaseId: null,
      };

    case 'CONSUMED':
      return {
        availabilityStatus: 'UNAVAILABLE',
        reservedForCaseId: null,
      };

    case 'EXPIRED':
      return { sterilityStatus: 'EXPIRED' };

    case 'RECEIVED':
      return eventData.sterilityStatus
        ? { sterilityStatus: eventData.sterilityStatus, availabilityStatus: 'AVAILABLE' }
        : {};

    default:
      return {};
  }
}

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  const inventoryRepo = getInventoryRepository();
  const deviceRepo = getDeviceRepository();

  /**
   * POST /inventory/events
   * Record a single inventory event
   */
  fastify.post('/events', {
    preHandler: [requireInventoryTech],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreateInventoryEventRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;
    const { facilityId, userId } = request.user;

    // Verify inventory item exists
    const item = await inventoryRepo.findById(data.inventoryItemId, facilityId);
    if (!item) {
      return reply.status(404).send({ error: 'Inventory item not found' });
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    const itemUpdate = computeItemUpdate(data.eventType, data, userId);

    await inventoryRepo.createEventWithItemUpdate(
      {
        facilityId,
        inventoryItemId: data.inventoryItemId,
        eventType: data.eventType as any,
        caseId: data.caseId,
        locationId: data.locationId,
        previousLocationId: item.locationId,
        sterilityStatus: data.sterilityStatus,
        notes: data.notes,
        performedByUserId: userId,
        deviceEventId: data.deviceEventId,
        occurredAt,
      },
      itemUpdate as any
    );

    return reply.status(201).send({ success: true });
  });

  /**
   * POST /inventory/events/bulk
   * Record multiple inventory events (for batch operations)
   */
  fastify.post('/events/bulk', {
    preHandler: [requireInventoryTech],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = BulkInventoryEventRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { events } = parseResult.data;
    const { facilityId, userId } = request.user;

    // Verify all items exist
    const itemIds = [...new Set(events.map(e => e.inventoryItemId))];
    const existingItems = await Promise.all(
      itemIds.map(id => inventoryRepo.findById(id, facilityId))
    );
    const existingIds = new Set(
      existingItems.filter(Boolean).map(item => item!.id)
    );
    const missingIds = itemIds.filter(id => !existingIds.has(id));

    if (missingIds.length > 0) {
      return reply.status(400).send({
        error: 'Some inventory items not found',
        missingIds,
      });
    }

    // Process each event
    for (const event of events) {
      const item = await inventoryRepo.findById(event.inventoryItemId, facilityId);
      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
      const itemUpdate = computeItemUpdate(event.eventType, event, userId);

      await inventoryRepo.createEventWithItemUpdate(
        {
          facilityId,
          inventoryItemId: event.inventoryItemId,
          eventType: event.eventType as any,
          caseId: event.caseId,
          locationId: event.locationId,
          previousLocationId: item?.locationId ?? null,
          sterilityStatus: event.sterilityStatus,
          notes: event.notes,
          performedByUserId: userId,
          deviceEventId: event.deviceEventId,
          occurredAt,
        },
        itemUpdate as any
      );
    }

    return reply.status(201).send({ success: true, count: events.length });
  });

  /**
   * POST /inventory/device-events
   * Receive device event from Device Adapter
   * Resolves the scan to a candidate inventory item but does NOT auto-create events.
   *
   * LAW COMPLIANCE (device-events.md §6, physical-devices.md):
   * - DeviceEvents may trigger lookup and populate candidates
   * - DeviceEvents may NEVER directly create inventory events or mutate truth
   * - Human confirmation is required before creating VERIFIED events
   *
   * Special device ID '00000000-0000-0000-0000-000000000000' is reserved for
   * keyboard wedge input (virtual device, no database record required).
   *
   * Returns candidate item details for UI to display. User must explicitly
   * call POST /inventory/events to create a VERIFIED event after confirmation.
   */
  fastify.post('/device-events', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreateDeviceEventRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;
    const { facilityId, userId } = request.user;

    const isKeyboardWedge = data.deviceId === KEYBOARD_WEDGE_DEVICE_ID;
    let actualDeviceId = data.deviceId;

    if (isKeyboardWedge) {
      // Get or create virtual keyboard wedge device
      const device = await deviceRepo.findOrCreateKeyboardWedge(facilityId);
      actualDeviceId = device.id;
    } else {
      // Verify device exists and get location
      const device = await deviceRepo.findById(data.deviceId, facilityId);
      if (!device || !device.active) {
        return reply.status(404).send({ error: 'Device not found or inactive' });
      }
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    // Try to resolve the raw value to an inventory item (candidate lookup only)
    let processedItemId: string | null = null;
    let processingError: string | null = null;
    let candidateItem: ReturnType<typeof formatInventoryItem> | null = null;

    // Try by barcode first, then serial number
    let item = await inventoryRepo.findByBarcode(data.rawValue, facilityId);
    if (!item) {
      item = await inventoryRepo.findBySerialNumber(data.rawValue, facilityId);
    }

    if (item) {
      processedItemId = item.id;
      // Get full item details for candidate display
      const itemDetails = await inventoryRepo.findByIdWithDetails(item.id, facilityId);
      if (itemDetails) {
        candidateItem = formatInventoryItem(itemDetails);
      }
    } else {
      processingError = 'No matching inventory item found';
    }

    // Create device event (audit record of the scan)
    const deviceEvent = await deviceRepo.createEvent({
      facilityId,
      deviceId: actualDeviceId,
      deviceType: data.deviceType,
      payloadType: data.payloadType,
      rawValue: data.rawValue,
      processedItemId,
      processed: processedItemId !== null,
      processingError,
      occurredAt,
    });

    // LAW COMPLIANCE: No automatic VERIFIED event creation.
    // The UI must call POST /inventory/events with deviceEventId to create
    // a VERIFIED event after human confirmation.

    return reply.status(201).send({
      deviceEventId: deviceEvent.id,
      processed: processedItemId !== null,
      processedItemId,
      candidate: candidateItem,
      error: processingError,
    });
  });

  /**
   * GET /inventory/devices
   * List registered devices for the facility
   */
  fastify.get('/devices', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const devices = await deviceRepo.findMany(facilityId, true);

    return reply.send({
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        deviceType: d.deviceType,
        locationId: d.locationId,
        locationName: d.locationName,
        active: d.active,
      })),
    });
  });

  /**
   * GET /inventory/items
   * List inventory items
   */
  fastify.get('/items', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { catalogId?: string; locationId?: string; status?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { catalogId, locationId, status } = request.query;

    const items = await inventoryRepo.findMany(facilityId, {
      catalogId,
      locationId,
      status,
    });

    return reply.send({ items: items.map(formatInventoryItem) });
  });

  /**
   * GET /inventory/items/:id
   * Get single inventory item details
   */
  fastify.get<{ Params: { id: string } }>('/items/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const item = await inventoryRepo.findByIdWithDetails(id, facilityId);
    if (!item) {
      return reply.status(404).send({ error: 'Inventory item not found' });
    }

    return reply.send({ item: formatInventoryItem(item) });
  });

  /**
   * POST /inventory/items
   * Create new inventory item (Check-in / Receiving)
   *
   * W1 VALIDATION RULES (Governance 2026-01-25):
   * Required field capture is enforced based on Catalog v1.1 intent flags:
   *   - requires_lot_tracking=true => lot_number REQUIRED
   *   - requires_serial_tracking=true => serial_number REQUIRED
   *   - requires_expiration_tracking=true => sterility_expires_at REQUIRED
   *
   * POLICY DEFAULT (expiration):
   *   If catalog.requires_sterility=true OR catalog.category='IMPLANT',
   *   then sterility_expires_at is REQUIRED unless catalog.requires_expiration_tracking
   *   is explicitly set to false (override).
   *
   * Validation occurs BEFORE item creation. Returns 400 with field-specific errors.
   */
  fastify.post('/items', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateInventoryItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Verify catalog item exists and fetch v1.1 intent fields for W1 validation
    const catalogCheck = await query<{
      id: string;
      category: string;
      requires_sterility: boolean;
      requires_lot_tracking: boolean;
      requires_serial_tracking: boolean;
      requires_expiration_tracking: boolean;
    }>(`
      SELECT id, category, requires_sterility,
             requires_lot_tracking, requires_serial_tracking, requires_expiration_tracking
      FROM item_catalog
      WHERE id = $1 AND facility_id = $2 AND active = true
    `, [data.catalogId, facilityId]);

    if (catalogCheck.rows.length === 0) {
      return reply.status(400).send({ error: 'Catalog item not found or inactive' });
    }

    const catalog = catalogCheck.rows[0];

    // =========================================================================
    // W1 CHECK-IN VALIDATION: Enforce required capture based on Catalog intent
    // =========================================================================
    const missingFields: string[] = [];

    // Lot tracking: required if catalog flag is true
    if (catalog.requires_lot_tracking && !data.lotNumber) {
      missingFields.push('lotNumber');
    }

    // Serial tracking: required if catalog flag is true
    if (catalog.requires_serial_tracking && !data.serialNumber) {
      missingFields.push('serialNumber');
    }

    // Expiration tracking: required if ANY of the following are true:
    //   - catalog.requires_expiration_tracking = true (explicit flag)
    //   - catalog.requires_sterility = true (sterile items need expiration dates)
    //   - catalog.category = 'IMPLANT' (implants always need expiration tracking)
    // POLICY DEFAULT: Sterile items and implants inherently require expiration
    // tracking for patient safety — this is non-negotiable.
    const expirationRequired =
      catalog.requires_expiration_tracking === true ||
      catalog.requires_sterility === true ||
      catalog.category === 'IMPLANT';

    if (expirationRequired && !data.sterilityExpiresAt) {
      missingFields.push('sterilityExpiresAt');
    }

    if (missingFields.length > 0) {
      return reply.status(400).send({
        error: 'Required fields missing based on catalog tracking requirements',
        missingFields,
        catalogRules: {
          requiresLotTracking: catalog.requires_lot_tracking,
          requiresSerialTracking: catalog.requires_serial_tracking,
          requiresExpirationTracking: catalog.requires_expiration_tracking,
          requiresSterility: catalog.requires_sterility,
          category: catalog.category,
          expirationRequired,
        },
      });
    }
    // =========================================================================

    // Verify location if specified (cross-domain check)
    if (data.locationId) {
      const locationCheck = await query(`
        SELECT id FROM location WHERE id = $1 AND facility_id = $2
      `, [data.locationId, facilityId]);

      if (locationCheck.rows.length === 0) {
        return reply.status(400).send({ error: 'Location not found' });
      }
    }

    // Check barcode uniqueness
    if (data.barcode) {
      const exists = await inventoryRepo.barcodeExists(data.barcode, facilityId);
      if (exists) {
        return reply.status(400).send({ error: 'Barcode already exists' });
      }
    }

    const sterilityStatus = data.sterilityStatus ||
      (catalog.requires_sterility ? 'STERILE' : 'NON_STERILE');

    const item = await inventoryRepo.create({
      facilityId,
      catalogId: data.catalogId,
      serialNumber: data.serialNumber,
      lotNumber: data.lotNumber,
      barcode: data.barcode,
      locationId: data.locationId,
      sterilityStatus: sterilityStatus as any,
      sterilityExpiresAt: data.sterilityExpiresAt ? new Date(data.sterilityExpiresAt) : null,
    });

    return reply.status(201).send({ item: formatInventoryItem(item) });
  });

  /**
   * PATCH /inventory/items/:id
   * Update inventory item (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateInventoryItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check item exists
    const existing = await inventoryRepo.findById(id, facilityId);
    if (!existing) {
      return reply.status(404).send({ error: 'Inventory item not found' });
    }

    // Verify location if changing (cross-domain check)
    if (data.locationId) {
      const locationCheck = await query(`
        SELECT id FROM location WHERE id = $1 AND facility_id = $2
      `, [data.locationId, facilityId]);

      if (locationCheck.rows.length === 0) {
        return reply.status(400).send({ error: 'Location not found' });
      }
    }

    // Check barcode uniqueness if changing
    if (data.barcode) {
      const exists = await inventoryRepo.barcodeExists(data.barcode, facilityId, id);
      if (exists) {
        return reply.status(400).send({ error: 'Barcode already exists' });
      }
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    const updated = await inventoryRepo.update(id, facilityId, {
      serialNumber: data.serialNumber,
      lotNumber: data.lotNumber,
      barcode: data.barcode,
      locationId: data.locationId,
      sterilityStatus: data.sterilityStatus as any,
      sterilityExpiresAt: data.sterilityExpiresAt ? new Date(data.sterilityExpiresAt) : undefined,
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Inventory item not found' });
    }

    return reply.send({ item: formatInventoryItem(updated) });
  });

  /**
   * GET /inventory/items/:id/history
   * Get event history for an inventory item
   */
  fastify.get<{ Params: { id: string } }>('/items/:id/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const events = await inventoryRepo.getItemHistory(id, facilityId);

    if (events.length === 0) {
      // Check if item exists
      const item = await inventoryRepo.findById(id, facilityId);
      if (!item) {
        return reply.status(404).send({ error: 'Inventory item not found' });
      }
    }

    return reply.send({ events: events.map(formatInventoryEvent) });
  });
}
