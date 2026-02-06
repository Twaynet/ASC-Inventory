/**
 * Inventory Routes
 * Inventory events ingestion (including from device adapter)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateDeviceEventRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { getVendorRepository } from '../repositories/index.js';
import { ok, fail, validated } from '../utils/reply.js';
import { idempotent } from '../plugins/idempotency.js';
import {
  getInventoryRepository,
  getDeviceRepository,
  KEYBOARD_WEDGE_DEVICE_ID,
} from '../repositories/index.js';
import { classifyBarcode, parseGS1 } from '../lib/gs1-parser.js';
import { contract } from '@asc/contract';
import { registerContractRoute } from '../lib/contract-route.js';

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
  const PREFIX = '/inventory';

  // ── [CONTRACT] POST /inventory/events — Record single event ────────
  registerContractRoute(fastify, contract.inventory.createEvent, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_CHECKIN', 'INVENTORY_MANAGE'), idempotent()],
    handler: async (request, reply) => {
      const data = request.contractData.body as {
        inventoryItemId: string;
        eventType: string;
        caseId?: string;
        locationId?: string;
        sterilityStatus?: string;
        notes?: string;
        deviceEventId?: string;
        occurredAt?: string;
      };

      const { facilityId, userId } = request.user;

      const item = await inventoryRepo.findById(data.inventoryItemId, facilityId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
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

      return ok(reply, { success: true }, 201);
    },
  });

  // ── [CONTRACT] POST /inventory/events/bulk — Bulk events ───────────
  registerContractRoute(fastify, contract.inventory.bulkEvents, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_CHECKIN', 'INVENTORY_MANAGE'), idempotent()],
    handler: async (request, reply) => {
      const body = request.contractData.body as {
        events: Array<{
          inventoryItemId: string;
          eventType: string;
          caseId?: string;
          locationId?: string;
          sterilityStatus?: string;
          notes?: string;
          deviceEventId?: string;
          occurredAt?: string;
        }>;
      };

      const { events } = body;
      const { facilityId, userId } = request.user;

      const itemIds = [...new Set(events.map(e => e.inventoryItemId))];
      const existingItems = await Promise.all(
        itemIds.map(id => inventoryRepo.findById(id, facilityId))
      );
      const existingIds = new Set(
        existingItems.filter(Boolean).map(item => item!.id)
      );
      const missingIds = itemIds.filter(id => !existingIds.has(id));

      if (missingIds.length > 0) {
        return fail(reply, 'ITEMS_NOT_FOUND', 'Some inventory items not found', 400, { missingIds });
      }

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

      return ok(reply, { success: true, count: events.length }, 201);
    },
  });

  // ============================================================================
  // Wave 1: Financial Attribution Event Endpoint
  // ============================================================================

  /**
   * POST /inventory/events/financial
   * Create inventory event with financial attribution (ADMIN only)
   *
   * This endpoint allows ADMIN users to:
   * - Override catalog cost with a different actual cost
   * - Mark items as gratis (free)
   * - Attribute items to vendors/reps
   *
   * VALIDATION RULES (enforced at API level per Phase 1 constraints):
   * - cost_override_cents requires cost_override_reason (cannot be null)
   * - is_gratis=true requires gratis_reason (cannot be null)
   * - provided_by_vendor_id must reference a valid active vendor
   *
   * LAW COMPLIANCE:
   * - Only ADMIN role can create financial events
   * - cost_snapshot_cents is auto-populated from catalog
   * - All financial events are append-only
   */
  fastify.post<{
    Body: {
      inventoryItemId: string;
      eventType: string;
      caseId?: string;
      locationId?: string;
      sterilityStatus?: string;
      notes?: string;
      occurredAt?: string;
      // Financial fields
      costOverrideCents?: number;
      costOverrideReason?: string;
      costOverrideNote?: string;
      providedByVendorId?: string;
      providedByRepName?: string;
      isGratis?: boolean;
      gratisReason?: string;
    };
  }>('/events/financial', {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
  }, async (request: FastifyRequest<{
    Body: {
      inventoryItemId: string;
      eventType: string;
      caseId?: string;
      locationId?: string;
      sterilityStatus?: string;
      notes?: string;
      occurredAt?: string;
      costOverrideCents?: number;
      costOverrideReason?: string;
      costOverrideNote?: string;
      providedByVendorId?: string;
      providedByRepName?: string;
      isGratis?: boolean;
      gratisReason?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;
    const data = request.body;

    // Validate required fields
    if (!data.inventoryItemId) {
      return fail(reply, 'VALIDATION_ERROR', 'inventoryItemId is required');
    }
    if (!data.eventType) {
      return fail(reply, 'VALIDATION_ERROR', 'eventType is required');
    }

    // Verify item exists
    const item = await inventoryRepo.findById(data.inventoryItemId, facilityId);
    if (!item) {
      return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
    }

    // =========================================================================
    // WAVE 1 FINANCIAL VALIDATION (enforced at API level)
    // These constraints match Phase 1 DB constraints but are enforced here
    // to provide clear error messages and reject bad requests early.
    // =========================================================================

    const VALID_OVERRIDE_REASONS = [
      'CATALOG_ERROR', 'NEGOTIATED_DISCOUNT', 'VENDOR_CONCESSION',
      'DAMAGE_CREDIT', 'EXPIRED_CREDIT', 'CONTRACT_ADJUSTMENT',
      'GRATIS_CONVERSION', 'OTHER',
    ];

    const VALID_GRATIS_REASONS = [
      'VENDOR_SAMPLE', 'VENDOR_SUPPORT', 'CLINICAL_TRIAL',
      'GOODWILL', 'WARRANTY_REPLACEMENT', 'OTHER',
    ];

    // Constraint: cost_override_cents requires cost_override_reason
    if (data.costOverrideCents !== undefined && data.costOverrideCents !== null) {
      if (!data.costOverrideReason) {
        return fail(reply, 'VALIDATION_ERROR',
          'cost_override_cents requires cost_override_reason. Cannot override cost without a reason.',
          400, { constraint: 'chk_event_override_requires_reason' });
      }
      if (!VALID_OVERRIDE_REASONS.includes(data.costOverrideReason)) {
        return fail(reply, 'VALIDATION_ERROR',
          `Invalid cost_override_reason. Must be one of: ${VALID_OVERRIDE_REASONS.join(', ')}`,
          400, { validReasons: VALID_OVERRIDE_REASONS });
      }
      if (data.costOverrideCents < 0) {
        return fail(reply, 'VALIDATION_ERROR',
          'cost_override_cents cannot be negative');
      }
    }

    // Constraint: is_gratis=true requires gratis_reason
    if (data.isGratis === true) {
      if (!data.gratisReason) {
        return fail(reply, 'VALIDATION_ERROR',
          'is_gratis=true requires gratis_reason. Cannot mark item as gratis without a reason.',
          400, { constraint: 'chk_event_gratis_requires_reason' });
      }
      if (!VALID_GRATIS_REASONS.includes(data.gratisReason)) {
        return fail(reply, 'VALIDATION_ERROR',
          `Invalid gratis_reason. Must be one of: ${VALID_GRATIS_REASONS.join(', ')}`,
          400, { validReasons: VALID_GRATIS_REASONS });
      }
    }

    // Validate vendor if provided
    if (data.providedByVendorId) {
      const vendorRepo = getVendorRepository();
      const vendor = await vendorRepo.findById(data.providedByVendorId, facilityId);
      if (!vendor) {
        return fail(reply, 'NOT_FOUND', 'Vendor not found', 404);
      }
      if (!vendor.isActive) {
        return fail(reply, 'VALIDATION_ERROR', 'Vendor is inactive');
      }
    }

    // =========================================================================

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
        occurredAt,
        // Financial fields
        costOverrideCents: data.costOverrideCents ?? null,
        costOverrideReason: data.costOverrideReason as any ?? null,
        costOverrideNote: data.costOverrideNote ?? null,
        providedByVendorId: data.providedByVendorId ?? null,
        providedByRepName: data.providedByRepName ?? null,
        isGratis: data.isGratis ?? false,
        gratisReason: data.gratisReason as any ?? null,
        financialAttestationUserId: userId, // ADMIN who made the financial decision
      },
      itemUpdate as any
    );

    return ok(reply, { success: true }, 201);
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
    const data = validated(reply, CreateDeviceEventRequestSchema, request.body);
    if (!data) return;
    const { facilityId } = request.user;

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
        return fail(reply, 'NOT_FOUND', 'Device not found or inactive', 404);
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

    // GS1 parsing — always attempt regardless of inventory match
    const barcodeClassification = classifyBarcode(data.rawValue);
    const gs1Result = parseGS1(data.rawValue);
    const gs1Data = gs1Result.success ? {
      gtin: gs1Result.gtin || null,
      lot: gs1Result.lot || null,
      expiration: gs1Result.expiration?.toISOString() || null,
      serial: gs1Result.serial || null,
    } : null;

    // Catalog lookup by GTIN if GS1 parsed and no inventory match
    let catalogMatch: { catalogId: string; catalogName: string } | null = null;
    if (!item && gs1Data?.gtin) {
      const catalogResult = await query<{ catalog_id: string; name: string }>(`
        SELECT ci.catalog_id, ic.name
        FROM catalog_identifier ci
        JOIN item_catalog ic ON ic.id = ci.catalog_id
        WHERE ci.facility_id = $1 AND ci.raw_value = $2 AND ci.identifier_type = 'GTIN'
        LIMIT 1
      `, [facilityId, gs1Data.gtin]);
      if (catalogResult.rows.length > 0) {
        catalogMatch = {
          catalogId: catalogResult.rows[0].catalog_id,
          catalogName: catalogResult.rows[0].name,
        };
      }
    }

    // Guidance messages for non-GS1 scans
    if (!item && !gs1Data) {
      if (barcodeClassification === 'upc-a') {
        processingError = 'This barcode does not include lot or expiration. Scan the square UDI barcode to add inventory.';
      } else if (barcodeClassification === 'unknown' || barcodeClassification === 'code128') {
        processingError = 'Barcode not recognized as UDI. Scan the square UDI barcode or use Manual Override.';
      }
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

    return ok(reply, {
      deviceEventId: deviceEvent.id,
      processed: processedItemId !== null,
      processedItemId,
      candidate: candidateItem,
      gs1Data,
      catalogMatch,
      barcodeClassification,
      error: processingError,
    }, 201);
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

    return ok(reply, {
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

  // ── [CONTRACT] GET /inventory/items — List inventory items ───────────
  registerContractRoute(fastify, contract.inventory.listItems, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { facilityId } = request.user;
      const { catalogId, locationId, status } = request.contractData.query as {
        catalogId?: string; locationId?: string; status?: string;
      };

      const items = await inventoryRepo.findMany(facilityId, {
        catalogId,
        locationId,
        status,
      });

      return ok(reply, { items: items.map(formatInventoryItem) });
    },
  });

  // ── [CONTRACT] GET /inventory/items/:itemId — Get single item ────────
  registerContractRoute(fastify, contract.inventory.getItem, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { itemId } = request.contractData.params as { itemId: string };
      const { facilityId } = request.user;

      const item = await inventoryRepo.findByIdWithDetails(itemId, facilityId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
      }

      return ok(reply, { item: formatInventoryItem(item) });
    },
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
  registerContractRoute(fastify, contract.inventory.createItem, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
    const data = request.contractData.body as {
      catalogId: string;
      serialNumber?: string;
      lotNumber?: string;
      barcode?: string;
      locationId?: string;
      sterilityStatus?: string;
      sterilityExpiresAt?: string;
      barcodeClassification?: string;
      barcodeGtin?: string;
      barcodeParsedLot?: string;
      barcodeParsedSerial?: string;
      barcodeParsedExpiration?: string;
      attestationReason?: string;
    };

    const { facilityId } = request.user;

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
      return fail(reply, 'VALIDATION_ERROR', 'Catalog item not found or inactive');
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
      return fail(reply, 'VALIDATION_ERROR', 'Required fields missing based on catalog tracking requirements', 400, {
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
        return fail(reply, 'VALIDATION_ERROR', 'Location not found');
      }
    }

    // Check barcode uniqueness
    if (data.barcode) {
      const exists = await inventoryRepo.barcodeExists(data.barcode, facilityId);
      if (exists) {
        return fail(reply, 'DUPLICATE', 'Barcode already exists');
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
      barcodeClassification: data.barcodeClassification,
      barcodeGtin: data.barcodeGtin,
      barcodeParsedLot: data.barcodeParsedLot,
      barcodeParsedSerial: data.barcodeParsedSerial,
      barcodeParsedExpiration: data.barcodeParsedExpiration ? new Date(data.barcodeParsedExpiration) : null,
      attestationReason: data.attestationReason,
      attestedByUserId: data.attestationReason ? request.user.userId : null,
    });

    return ok(reply, { item: formatInventoryItem(item) }, 201);
    },
  });

  // ── [CONTRACT] PATCH /inventory/items/:itemId — Update item ─────────
  registerContractRoute(fastify, contract.inventory.updateItem, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
    const { itemId } = request.contractData.params as { itemId: string };
    const { facilityId } = request.user;

    const data = request.contractData.body as {
      serialNumber?: string;
      lotNumber?: string;
      barcode?: string;
      locationId?: string;
      sterilityStatus?: string;
      sterilityExpiresAt?: string;
    };

    // Check item exists
    const existing = await inventoryRepo.findById(itemId, facilityId);
    if (!existing) {
      return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
    }

    // Verify location if changing (cross-domain check)
    if (data.locationId) {
      const locationCheck = await query(`
        SELECT id FROM location WHERE id = $1 AND facility_id = $2
      `, [data.locationId, facilityId]);

      if (locationCheck.rows.length === 0) {
        return fail(reply, 'VALIDATION_ERROR', 'Location not found');
      }
    }

    // Check barcode uniqueness if changing
    if (data.barcode) {
      const exists = await inventoryRepo.barcodeExists(data.barcode, facilityId, itemId);
      if (exists) {
        return fail(reply, 'DUPLICATE', 'Barcode already exists');
      }
    }

    if (Object.keys(data).length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'No updates provided');
    }

    const updated = await inventoryRepo.update(itemId, facilityId, {
      serialNumber: data.serialNumber,
      lotNumber: data.lotNumber,
      barcode: data.barcode,
      locationId: data.locationId,
      sterilityStatus: data.sterilityStatus as any,
      sterilityExpiresAt: data.sterilityExpiresAt ? new Date(data.sterilityExpiresAt) : undefined,
    });

    if (!updated) {
      return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
    }

    return ok(reply, { item: formatInventoryItem(updated) });
    },
  });

  // ── [CONTRACT] GET /inventory/items/:itemId/history — Item history ──
  registerContractRoute(fastify, contract.inventory.itemHistory, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { itemId } = request.contractData.params as { itemId: string };
      const { facilityId } = request.user;

      const events = await inventoryRepo.getItemHistory(itemId, facilityId);

      if (events.length === 0) {
        // Check if item exists
        const item = await inventoryRepo.findById(itemId, facilityId);
        if (!item) {
          return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
        }
      }

      return ok(reply, { events: events.map(formatInventoryEvent) });
    },
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
  registerContractRoute(fastify, contract.inventory.riskQueue, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
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

    return ok(reply, { riskItems });
    },
  });
}
