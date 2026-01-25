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

  /**
   * GET /inventory/risk-queue
   * Returns computed inventory risk items based on Catalog v1.1 intent flags.
   *
   * ALARM RULES (all derived, not stored):
   * A1: MISSING_LOT - catalog.requires_lot_tracking=true but lot_number missing
   * A2: MISSING_SERIAL - catalog.requires_serial_tracking=true but serial_number missing
   * A3: MISSING_EXPIRATION - expiration required but sterility_expires_at missing
   * B1: EXPIRING_SOON - within warning horizon (catalog or criticality fallback)
   * B2: EXPIRED - sterility_expires_at <= today OR sterility_status='EXPIRED'
   *
   * Expiration required if:
   *   - catalog.requires_expiration_tracking = true, OR
   *   - catalog.requires_sterility = true (policy default), OR
   *   - catalog.category = 'IMPLANT' (policy default)
   *
   * Warning horizon:
   *   - catalog.expiration_warning_days if set, else fallback by criticality:
   *     CRITICAL=90, IMPORTANT=60, ROUTINE=30
   *
   * Severity mapping:
   *   - CRITICAL → RED
   *   - IMPORTANT → ORANGE
   *   - ROUTINE → YELLOW
   *   - EXPIRED is always RED
   *
   * LAW COMPLIANCE:
   *   - Read-only (no mutations)
   *   - Facility-scoped
   *   - No DeviceEvent used as truth
   */
  fastify.get('/risk-queue', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    // Single query to compute all risk items
    // Joins inventory_item with item_catalog to get v1.1 intent fields
    const result = await query<{
      inventory_item_id: string;
      catalog_id: string;
      catalog_name: string;
      category: string;
      serial_number: string | null;
      lot_number: string | null;
      barcode: string | null;
      sterility_expires_at: Date | null;
      sterility_status: string;
      availability_status: string;
      requires_lot_tracking: boolean;
      requires_serial_tracking: boolean;
      requires_expiration_tracking: boolean;
      requires_sterility: boolean;
      criticality: string;
      expiration_warning_days: number | null;
    }>(`
      SELECT
        i.id AS inventory_item_id,
        c.id AS catalog_id,
        c.name AS catalog_name,
        c.category,
        i.serial_number,
        i.lot_number,
        i.barcode,
        i.sterility_expires_at,
        i.sterility_status,
        i.availability_status,
        c.requires_lot_tracking,
        c.requires_serial_tracking,
        c.requires_expiration_tracking,
        c.requires_sterility,
        c.criticality,
        c.expiration_warning_days
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      WHERE i.facility_id = $1
        AND c.active = true
        AND i.availability_status NOT IN ('UNAVAILABLE', 'MISSING')
      ORDER BY c.name ASC
    `, [facilityId]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const riskItems: Array<{
      rule: string;
      severity: string;
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
    }> = [];

    // Criticality to severity mapping
    const severityMap: Record<string, string> = {
      CRITICAL: 'RED',
      IMPORTANT: 'ORANGE',
      ROUTINE: 'YELLOW',
    };

    // Warning horizon fallbacks by criticality
    const warningFallback: Record<string, number> = {
      CRITICAL: 90,
      IMPORTANT: 60,
      ROUTINE: 30,
    };

    for (const row of result.rows) {
      const expirationRequired =
        row.requires_expiration_tracking === true ||
        row.requires_sterility === true ||
        row.category === 'IMPLANT';

      const effectiveWarningDays =
        row.expiration_warning_days ?? warningFallback[row.criticality] ?? 30;

      const severity = severityMap[row.criticality] || 'YELLOW';

      const identifier = row.barcode || row.serial_number || row.lot_number || null;

      const debugInfo = {
        criticality: row.criticality,
        requiresSterility: row.requires_sterility,
        expirationRequired,
        effectiveWarningDays,
      };

      // A1: Missing lot number
      if (row.requires_lot_tracking && !row.lot_number) {
        riskItems.push({
          rule: 'MISSING_LOT',
          severity,
          facilityId,
          catalogId: row.catalog_id,
          catalogName: row.catalog_name,
          inventoryItemId: row.inventory_item_id,
          identifier,
          daysToExpire: null,
          expiresAt: null,
          missingFields: ['lotNumber'],
          explain: `${row.catalog_name} requires lot tracking but lot number is missing.`,
          debug: debugInfo,
        });
      }

      // A2: Missing serial number
      if (row.requires_serial_tracking && !row.serial_number) {
        riskItems.push({
          rule: 'MISSING_SERIAL',
          severity,
          facilityId,
          catalogId: row.catalog_id,
          catalogName: row.catalog_name,
          inventoryItemId: row.inventory_item_id,
          identifier,
          daysToExpire: null,
          expiresAt: null,
          missingFields: ['serialNumber'],
          explain: `${row.catalog_name} requires serial tracking but serial number is missing.`,
          debug: debugInfo,
        });
      }

      // A3: Missing expiration date
      if (expirationRequired && !row.sterility_expires_at) {
        riskItems.push({
          rule: 'MISSING_EXPIRATION',
          severity,
          facilityId,
          catalogId: row.catalog_id,
          catalogName: row.catalog_name,
          inventoryItemId: row.inventory_item_id,
          identifier,
          daysToExpire: null,
          expiresAt: null,
          missingFields: ['sterilityExpiresAt'],
          explain: `${row.catalog_name} requires expiration tracking but expiration date is missing.`,
          debug: debugInfo,
        });
      }

      // B2: Expired (check first - takes precedence over "expiring soon")
      if (row.sterility_status === 'EXPIRED') {
        riskItems.push({
          rule: 'EXPIRED',
          severity: 'RED', // Always RED
          facilityId,
          catalogId: row.catalog_id,
          catalogName: row.catalog_name,
          inventoryItemId: row.inventory_item_id,
          identifier,
          daysToExpire: null,
          expiresAt: row.sterility_expires_at?.toISOString() || null,
          missingFields: [],
          explain: `${row.catalog_name} sterility has expired.`,
          debug: debugInfo,
        });
      } else if (row.sterility_expires_at) {
        const expiresAt = new Date(row.sterility_expires_at);
        expiresAt.setHours(0, 0, 0, 0);
        const daysToExpire = Math.floor((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // B2: Expired by date
        if (daysToExpire <= 0) {
          riskItems.push({
            rule: 'EXPIRED',
            severity: 'RED', // Always RED
            facilityId,
            catalogId: row.catalog_id,
            catalogName: row.catalog_name,
            inventoryItemId: row.inventory_item_id,
            identifier,
            daysToExpire,
            expiresAt: row.sterility_expires_at.toISOString(),
            missingFields: [],
            explain: `${row.catalog_name} sterility expired ${Math.abs(daysToExpire)} day(s) ago.`,
            debug: debugInfo,
          });
        }
        // B1: Expiring soon (within warning horizon)
        else if (expirationRequired && daysToExpire <= effectiveWarningDays) {
          riskItems.push({
            rule: 'EXPIRING_SOON',
            severity,
            facilityId,
            catalogId: row.catalog_id,
            catalogName: row.catalog_name,
            inventoryItemId: row.inventory_item_id,
            identifier,
            daysToExpire,
            expiresAt: row.sterility_expires_at.toISOString(),
            missingFields: [],
            explain: `${row.catalog_name} sterility expires in ${daysToExpire} day(s).`,
            debug: debugInfo,
          });
        }
      }
    }

    // Sort: severity DESC (RED > ORANGE > YELLOW), then rule, then daysToExpire ASC, then catalogName ASC
    const severityOrder: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2 };
    riskItems.sort((a, b) => {
      // Severity DESC
      const sevA = severityOrder[a.severity] ?? 3;
      const sevB = severityOrder[b.severity] ?? 3;
      if (sevA !== sevB) return sevA - sevB;

      // Rule ASC
      if (a.rule !== b.rule) return a.rule.localeCompare(b.rule);

      // daysToExpire ASC (null last)
      if (a.daysToExpire !== null && b.daysToExpire !== null) {
        if (a.daysToExpire !== b.daysToExpire) return a.daysToExpire - b.daysToExpire;
      } else if (a.daysToExpire !== null) {
        return -1;
      } else if (b.daysToExpire !== null) {
        return 1;
      }

      // catalogName ASC
      return a.catalogName.localeCompare(b.catalogName);
    });

    return reply.send({ riskItems });
  });
}
