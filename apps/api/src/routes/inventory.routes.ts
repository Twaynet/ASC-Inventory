/**
 * Inventory Routes
 * Inventory events ingestion (including from device adapter)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateDeviceEventRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities, getUserRoles } from '../plugins/auth.js';
import { getVendorRepository } from '../repositories/index.js';
import { ok, fail, validated } from '../utils/reply.js';
import { idempotent } from '../plugins/idempotency.js';
import { requirePhiAccess } from '../plugins/phi-guard.js';
import { deriveCapabilities } from '@asc/domain';
import { redactCaseLink, type CaseLink } from '../utils/case-link.redaction.js';
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
}, caseLink: CaseLink) {
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
    caseLink,
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
}, caseLink: CaseLink) {
  return {
    id: event.id,
    eventType: event.eventType,
    caseLink,
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
  notes?: string;
  adjustment?: { availabilityStatus: string };
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

    case 'ADJUSTED': {
      // Primary path: structured adjustment field
      if (eventData.adjustment?.availabilityStatus) {
        const status = eventData.adjustment.availabilityStatus;
        if (status === 'MISSING') {
          return { availabilityStatus: 'MISSING' };
        }
        if (status === 'AVAILABLE') {
          const update: Record<string, unknown> = { availabilityStatus: 'AVAILABLE' };
          if (eventData.locationId) update.locationId = eventData.locationId;
          return update;
        }
        return {};
      }

      // Legacy compatibility — scheduled for removal after UI migration.
      // Only triggers when structured adjustment is absent.
      const notes = eventData.notes || '';
      if (notes.startsWith('[MARK_MISSING]')) {
        console.warn('[inventory] Legacy [MARK_MISSING] prefix used — migrate to structured adjustment field');
        return { availabilityStatus: 'MISSING' };
      }
      if (notes.startsWith('[MARK_FOUND]')) {
        console.warn('[inventory] Legacy [MARK_FOUND] prefix used — migrate to structured adjustment field');
        const update: Record<string, unknown> = { availabilityStatus: 'AVAILABLE' };
        if (eventData.locationId) update.locationId = eventData.locationId;
        return update;
      }
      return {};
    }

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
    preHandler: [requireCapabilities('INVENTORY_CHECKIN', 'INVENTORY_MANAGE'), requirePhiAccess('PHI_CLINICAL', { evaluateCase: true }), idempotent()],
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
        adjustment?: { availabilityStatus: string };
        reason?: string;
      };

      const { facilityId, userId } = request.user;

      // Validate structured adjustment fields
      if (data.eventType === 'ADJUSTED' && data.adjustment?.availabilityStatus) {
        if (data.adjustment.availabilityStatus === 'MISSING' && !data.reason?.trim()) {
          return fail(reply, 'VALIDATION_ERROR', 'reason is required when setting availabilityStatus to MISSING', 400);
        }
      }

      const item = await inventoryRepo.findById(data.inventoryItemId, facilityId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', 'Inventory item not found', 404);
      }

      // Compose notes deterministically from structured fields when adjustment is present
      let composedNotes = data.notes;
      if (data.eventType === 'ADJUSTED' && data.adjustment?.availabilityStatus) {
        const status = data.adjustment.availabilityStatus;
        if (status === 'MISSING') {
          const base = `[MISSING] ${(data.reason ?? '').trim()}`;
          composedNotes = data.notes?.trim() ? `${base} | ${data.notes.trim()}` : base;
        } else if (status === 'AVAILABLE') {
          composedNotes = data.notes?.trim() ? `[FOUND] ${data.notes.trim()}` : '[FOUND]';
        }
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
          notes: composedNotes,
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
    preHandler: [requireCapabilities('INVENTORY_CHECKIN', 'INVENTORY_MANAGE'), requirePhiAccess('PHI_CLINICAL'), idempotent()],
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
          adjustment?: { availabilityStatus: string };
          reason?: string;
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
    preHandler: [requireCapabilities('INVENTORY_MANAGE'), requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
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

  // ── GET /inventory/items/lookup — Resolve barcode/serial/lot to item(s) ──
  fastify.get('/items/lookup', {
    preHandler: [requireCapabilities('INVENTORY_CHECKIN', 'INVENTORY_MANAGE')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.query as { code?: string };
    if (!code || !code.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'code query parameter is required', 400);
    }
    const raw = code.trim();
    const { facilityId } = request.user;
    const userCaps = deriveCapabilities(getUserRoles(request.user));

    // Format a repository InventoryItem into a lookup summary
    type RepoItem = NonNullable<Awaited<ReturnType<typeof inventoryRepo.findById>>>;
    const formatRepoItem = (item: RepoItem) => ({
      inventoryItemId: item.id,
      catalogId: item.catalogId,
      catalogName: item.catalogName || '',
      barcode: item.barcode,
      serialNumber: item.serialNumber,
      lotNumber: item.lotNumber,
      availabilityStatus: item.availabilityStatus,
      sterilityStatus: item.sterilityStatus,
      sterilityExpiresAt: item.sterilityExpiresAt?.toISOString() || null,
      locationId: item.locationId,
      locationName: item.locationName || null,
      caseLink: redactCaseLink(item.reservedForCaseId, userCaps),
    });

    // Format a raw SQL row into the same shape
    interface LookupRow {
      id: string; catalog_id: string; catalog_name: string; barcode: string | null;
      serial_number: string | null; lot_number: string | null;
      availability_status: string; sterility_status: string;
      sterility_expires_at: Date | null; location_id: string | null;
      location_name: string | null; reserved_for_case_id: string | null;
    }
    const formatRow = (r: LookupRow) => ({
      inventoryItemId: r.id,
      catalogId: r.catalog_id,
      catalogName: r.catalog_name || '',
      barcode: r.barcode,
      serialNumber: r.serial_number,
      lotNumber: r.lot_number,
      availabilityStatus: r.availability_status,
      sterilityStatus: r.sterility_status,
      sterilityExpiresAt: r.sterility_expires_at?.toISOString() || null,
      locationId: r.location_id,
      locationName: r.location_name || null,
      caseLink: redactCaseLink(r.reserved_for_case_id, userCaps),
    });

    const CAP = 20;

    // 1) Exact barcode match
    const byBarcode = await inventoryRepo.findByBarcode(raw, facilityId);
    if (byBarcode) {
      return ok(reply, { match: 'SINGLE', source: 'BARCODE', item: formatRepoItem(byBarcode) });
    }

    // 2) Exact serial number match
    const bySerial = await inventoryRepo.findBySerialNumber(raw, facilityId);
    if (bySerial) {
      return ok(reply, { match: 'SINGLE', source: 'SERIAL', item: formatRepoItem(bySerial) });
    }

    // 3) GS1 parse → GTIN catalog lookup → inventory items under that catalog
    const gs1 = parseGS1(raw);
    if (gs1.success && gs1.gtin) {
      const catResult = await query<{ catalog_id: string }>(`
        SELECT ci.catalog_id
        FROM catalog_identifier ci
        WHERE ci.facility_id = $1 AND ci.raw_value = $2 AND ci.identifier_type = 'GTIN'
        LIMIT 1
      `, [facilityId, gs1.gtin]);

      if (catResult.rows.length > 0) {
        const catalogId = catResult.rows[0].catalog_id;
        // Narrow by parsed lot/serial if available
        const conditions = ['i.facility_id = $1', 'i.catalog_id = $2'];
        const params: unknown[] = [facilityId, catalogId];
        if (gs1.lot) {
          conditions.push(`i.lot_number = $${params.length + 1}`);
          params.push(gs1.lot);
        }
        if (gs1.serial) {
          conditions.push(`i.serial_number = $${params.length + 1}`);
          params.push(gs1.serial);
        }
        const itemResult = await query<LookupRow>(`
          SELECT i.id, i.catalog_id, c.name as catalog_name, i.barcode,
                 i.serial_number, i.lot_number, i.availability_status,
                 i.sterility_status, i.sterility_expires_at, i.location_id,
                 l.name as location_name, i.reserved_for_case_id
          FROM inventory_item i
          JOIN item_catalog c ON i.catalog_id = c.id
          LEFT JOIN location l ON i.location_id = l.id
          WHERE ${conditions.join(' AND ')}
          ORDER BY i.created_at DESC
          LIMIT ${CAP + 1}
        `, params);

        if (itemResult.rows.length === 1) {
          return ok(reply, { match: 'SINGLE', source: 'GS1', item: formatRow(itemResult.rows[0]) });
        }
        if (itemResult.rows.length > 1) {
          const capped = itemResult.rows.length > CAP;
          const rows = capped ? itemResult.rows.slice(0, CAP) : itemResult.rows;
          return ok(reply, { match: 'MULTIPLE', source: 'GS1', capped, items: rows.map(formatRow) });
        }
      }
    }

    // 4) Lot number match (broad — may return multiple)
    const lotResult = await query<LookupRow>(`
      SELECT i.id, i.catalog_id, c.name as catalog_name, i.barcode,
             i.serial_number, i.lot_number, i.availability_status,
             i.sterility_status, i.sterility_expires_at, i.location_id,
             l.name as location_name, i.reserved_for_case_id
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      LEFT JOIN location l ON i.location_id = l.id
      WHERE i.lot_number = $1 AND i.facility_id = $2
      ORDER BY i.created_at DESC
      LIMIT ${CAP + 1}
    `, [raw, facilityId]);

    if (lotResult.rows.length === 1) {
      return ok(reply, { match: 'SINGLE', source: 'LOT', item: formatRow(lotResult.rows[0]) });
    }
    if (lotResult.rows.length > 1) {
      const capped = lotResult.rows.length > CAP;
      const rows = capped ? lotResult.rows.slice(0, CAP) : lotResult.rows;
      return ok(reply, { match: 'MULTIPLE', source: 'LOT', capped, items: rows.map(formatRow) });
    }

    return ok(reply, { match: 'NONE' });
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

    const userCaps = deriveCapabilities(getUserRoles(request.user));
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
        candidateItem = formatInventoryItem(itemDetails, redactCaseLink(itemDetails.reservedForCaseId, userCaps));
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

  /**
   * GET /inventory/device-events
   * Read-only paginated list of device events for the facility.
   * Auth: CASE_VIEW (scrubs, circulators, inventory techs, admins).
   * Default range: last 7 days.  Max 30 days (admins exempt).
   * Cursor pagination (newest first, tiebreak on id DESC for deterministic order).
   * Cursor-based: high-volume append-only table; offset would degrade at depth.
   */
  fastify.get<{
    Querystring: {
      deviceId?: string;
      processed?: string;
      hasError?: string;
      start?: string;
      end?: string;
      q?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/device-events', {
    preHandler: [requireCapabilities('CASE_VIEW')],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const {
      deviceId,
      processed,
      hasError,
      start,
      end,
      q,
      limit: limitStr,
      cursor,
    } = request.query;

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);

    // Date range defaults & enforcement
    const now = new Date();
    const defaultEnd = now.toISOString();
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rangeStart = start || defaultStart;
    const rangeEnd = end || defaultEnd;

    const startDate = new Date(rangeStart);
    const endDate = new Date(rangeEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid date format for start/end', 400);
    }

    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const userRoles = getUserRoles(request.user);
    const isAdmin = userRoles.includes('ADMIN');
    if (diffDays > 30 && !isAdmin) {
      return fail(reply, 'VALIDATION_ERROR', 'Date range cannot exceed 30 days (admin override available)', 400);
    }

    const conditions: string[] = ['de.facility_id = $1', 'de.created_at >= $2', 'de.created_at <= $3'];
    const values: unknown[] = [facilityId, rangeStart, rangeEnd];
    let paramIdx = 4;

    if (deviceId) {
      conditions.push(`de.device_id = $${paramIdx++}`);
      values.push(deviceId);
    }
    if (processed === 'true' || processed === 'false') {
      conditions.push(`de.processed = $${paramIdx++}`);
      values.push(processed === 'true');
    }
    if (hasError === 'true') {
      conditions.push('de.processing_error IS NOT NULL');
    } else if (hasError === 'false') {
      conditions.push('de.processing_error IS NULL');
    }
    if (q?.trim()) {
      conditions.push(`(de.raw_value ILIKE $${paramIdx} OR de.processing_error ILIKE $${paramIdx})`);
      paramIdx++;
      values.push(`%${q.trim()}%`);
    }
    if (cursor) {
      conditions.push(`de.created_at < $${paramIdx++}`);
      values.push(cursor);
    }

    const whereClause = conditions.join(' AND ');

    const result = await query<{
      id: string;
      device_id: string;
      device_name: string;
      device_type: string;
      payload_type: string;
      raw_value: string;
      processed: boolean;
      processed_item_id: string | null;
      processing_error: string | null;
      occurred_at: Date;
      created_at: Date;
    }>(`
      SELECT de.id, de.device_id, d.name AS device_name, de.device_type,
             de.payload_type, de.raw_value, de.processed,
             de.processed_item_id, de.processing_error,
             de.occurred_at, de.created_at
      FROM device_event de
      JOIN device d ON d.id = de.device_id
      WHERE ${whereClause}
      ORDER BY de.created_at DESC, de.id DESC
      LIMIT $${paramIdx}
    `, [...values, limit + 1]);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasMore ? rows[rows.length - 1].created_at.toISOString() : null;

    return ok(reply, {
      events: rows.map(r => ({
        id: r.id,
        deviceId: r.device_id,
        deviceName: r.device_name,
        deviceType: r.device_type,
        payloadType: r.payload_type,
        rawValue: r.raw_value,
        processed: r.processed,
        processedItemId: r.processed_item_id,
        processingError: r.processing_error,
        occurredAt: r.occurred_at.toISOString(),
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor,
    });
  });

  /**
   * GET /inventory/events
   * Read-only paginated list of inventory events with optional financial filter.
   * Auth: INVENTORY_MANAGE (admin only).
   * financial=true narrows to events with financial columns populated
   * (includes financial_attestation_user_id IS NOT NULL).
   * Offset pagination (acceptable — admin-only, append-only table, tiebreak on id DESC).
   */
  fastify.get<{
    Querystring: {
      financial?: string;
      eventType?: string;
      caseId?: string;
      vendorId?: string;
      gratis?: string;
      start?: string;
      end?: string;
      limit?: string;
      offset?: string;
    };
  }>('/events', {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const {
      financial,
      eventType,
      caseId,
      vendorId,
      gratis,
      start,
      end,
      limit: limitStr,
      offset: offsetStr,
    } = request.query;

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    const conditions: string[] = ['ie.facility_id = $1'];
    const values: unknown[] = [facilityId];
    let paramIdx = 2;

    // Financial filter: events that have any financial column populated
    if (financial === 'true') {
      conditions.push(`(ie.cost_snapshot_cents IS NOT NULL OR ie.cost_override_cents IS NOT NULL
        OR ie.provided_by_vendor_id IS NOT NULL OR ie.is_gratis = true
        OR ie.financial_attestation_user_id IS NOT NULL)`);
    }
    if (eventType) {
      conditions.push(`ie.event_type = $${paramIdx++}`);
      values.push(eventType);
    }
    if (caseId) {
      conditions.push(`ie.case_id = $${paramIdx++}`);
      values.push(caseId);
    }
    if (vendorId) {
      conditions.push(`ie.provided_by_vendor_id = $${paramIdx++}`);
      values.push(vendorId);
    }
    if (gratis === 'true') {
      conditions.push('ie.is_gratis = true');
    } else if (gratis === 'false') {
      conditions.push('(ie.is_gratis = false OR ie.is_gratis IS NULL)');
    }
    if (start) {
      conditions.push(`ie.occurred_at >= $${paramIdx++}`);
      values.push(start);
    }
    if (end) {
      conditions.push(`ie.occurred_at <= $${paramIdx++}`);
      values.push(end);
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM inventory_event ie WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    const result = await query<{
      id: string;
      event_type: string;
      inventory_item_id: string;
      catalog_name: string;
      case_id: string | null;
      location_name: string | null;
      previous_location_name: string | null;
      sterility_status: string | null;
      notes: string | null;
      performed_by_name: string | null;
      occurred_at: Date;
      created_at: Date;
      cost_snapshot_cents: number | null;
      cost_override_cents: number | null;
      cost_override_reason: string | null;
      cost_override_note: string | null;
      provided_by_vendor_id: string | null;
      vendor_name: string | null;
      provided_by_rep_name: string | null;
      is_gratis: boolean;
      gratis_reason: string | null;
    }>(`
      SELECT ie.id, ie.event_type, ie.inventory_item_id,
             ic.name AS catalog_name,
             ie.case_id,
             l.name AS location_name,
             pl.name AS previous_location_name,
             ie.sterility_status, ie.notes,
             u.name AS performed_by_name,
             ie.occurred_at, ie.created_at,
             ie.cost_snapshot_cents, ie.cost_override_cents,
             ie.cost_override_reason, ie.cost_override_note,
             ie.provided_by_vendor_id,
             v.name AS vendor_name,
             ie.provided_by_rep_name,
             ie.is_gratis, ie.gratis_reason
      FROM inventory_event ie
      JOIN inventory_item ii ON ii.id = ie.inventory_item_id
      JOIN item_catalog ic ON ic.id = ii.catalog_id
      LEFT JOIN location l ON l.id = ie.location_id
      LEFT JOIN location pl ON pl.id = ie.previous_location_id
      LEFT JOIN app_user u ON u.id = ie.performed_by_user_id
      LEFT JOIN vendor v ON v.id = ie.provided_by_vendor_id
      WHERE ${whereClause}
      ORDER BY ie.occurred_at DESC, ie.id DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, [...values, limit, offset]);

    return ok(reply, {
      events: result.rows.map(r => ({
        id: r.id,
        eventType: r.event_type,
        inventoryItemId: r.inventory_item_id,
        catalogName: r.catalog_name,
        caseId: r.case_id,
        locationName: r.location_name,
        previousLocationName: r.previous_location_name,
        sterilityStatus: r.sterility_status,
        notes: r.notes,
        performedByName: r.performed_by_name,
        occurredAt: r.occurred_at.toISOString(),
        createdAt: r.created_at.toISOString(),
        costSnapshotCents: r.cost_snapshot_cents,
        costOverrideCents: r.cost_override_cents,
        costOverrideReason: r.cost_override_reason,
        costOverrideNote: r.cost_override_note,
        vendorId: r.provided_by_vendor_id,
        vendorName: r.vendor_name,
        repName: r.provided_by_rep_name,
        isGratis: r.is_gratis,
        gratisReason: r.gratis_reason,
      })),
      total,
      limit,
      offset,
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

      const userCaps = deriveCapabilities(getUserRoles(request.user));
      return ok(reply, { items: items.map(i => formatInventoryItem(i, redactCaseLink(i.reservedForCaseId, userCaps))) });
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

      const userCaps = deriveCapabilities(getUserRoles(request.user));
      return ok(reply, { item: formatInventoryItem(item, redactCaseLink(item.reservedForCaseId, userCaps)) });
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

    const userCaps = deriveCapabilities(getUserRoles(request.user));
    return ok(reply, { item: formatInventoryItem(item, redactCaseLink(item.reservedForCaseId, userCaps)) }, 201);
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

    const userCaps = deriveCapabilities(getUserRoles(request.user));
    return ok(reply, { item: formatInventoryItem(updated, redactCaseLink(updated.reservedForCaseId, userCaps)) });
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

      const userCaps = deriveCapabilities(getUserRoles(request.user));
      return ok(reply, { events: events.map(e => formatInventoryEvent(e, redactCaseLink(e.caseId, userCaps))) });
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

  // ── [CONTRACT] GET /inventory/missing-analytics — Missing/Found analytics ──
  registerContractRoute(fastify, contract.inventory.missingAnalytics, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
      const { facilityId } = request.user;
      const { start, end, groupBy, resolution } = request.contractData.query as {
        start: string;
        end: string;
        groupBy: 'day' | 'location' | 'catalog' | 'surgeon' | 'staff';
        resolution: 'MISSING' | 'FOUND' | 'BOTH';
      };

      // Build resolution filter
      const resolutionConditions: string[] = [];
      if (resolution === 'MISSING' || resolution === 'BOTH') {
        resolutionConditions.push("ie.notes LIKE '[MISSING]%'");
      }
      if (resolution === 'FOUND' || resolution === 'BOTH') {
        resolutionConditions.push("ie.notes LIKE '[FOUND]%'");
      }
      const resolutionFilter = `(${resolutionConditions.join(' OR ')})`;

      // Build group-by SQL fragment
      let groupSelect: string;
      let groupByClause: string;
      let groupJoins = '';
      let orderClause: string;

      switch (groupBy) {
        case 'day':
          groupSelect = "ie.occurred_at::date::text AS group_key, ie.occurred_at::date::text AS group_label";
          groupByClause = 'ie.occurred_at::date';
          orderClause = 'group_key ASC';
          break;
        case 'location':
          groupSelect = `COALESCE(COALESCE(ie.location_id, ii.location_id)::text, 'UNKNOWN') AS group_key,
            COALESCE(l.name, 'Unknown Location') AS group_label`;
          groupByClause = `COALESCE(COALESCE(ie.location_id, ii.location_id)::text, 'UNKNOWN'), COALESCE(l.name, 'Unknown Location')`;
          groupJoins = 'LEFT JOIN location l ON l.id = COALESCE(ie.location_id, ii.location_id)';
          orderClause = 'missing_count DESC';
          break;
        case 'catalog':
          groupSelect = "ii.catalog_id::text AS group_key, COALESCE(ic.name, 'Unknown Catalog') AS group_label";
          groupByClause = "ii.catalog_id::text, COALESCE(ic.name, 'Unknown Catalog')";
          groupJoins = 'JOIN item_catalog ic ON ic.id = ii.catalog_id';
          orderClause = 'missing_count DESC';
          break;
        case 'surgeon':
          groupSelect = `CASE WHEN ie.case_id IS NULL OR sc.surgeon_id IS NULL THEN 'NO_CASE' ELSE sc.surgeon_id::text END AS group_key,
            CASE WHEN ie.case_id IS NULL OR sc.surgeon_id IS NULL THEN 'No case linked' ELSE surgeon.name END AS group_label`;
          groupByClause = `CASE WHEN ie.case_id IS NULL OR sc.surgeon_id IS NULL THEN 'NO_CASE' ELSE sc.surgeon_id::text END,
            CASE WHEN ie.case_id IS NULL OR sc.surgeon_id IS NULL THEN 'No case linked' ELSE surgeon.name END`;
          groupJoins = `
            LEFT JOIN surgical_case sc ON sc.id = ie.case_id
            LEFT JOIN app_user surgeon ON surgeon.id = sc.surgeon_id`;
          orderClause = 'missing_count DESC';
          break;
        case 'staff':
          groupSelect = "ie.performed_by_user_id::text AS group_key, COALESCE(staff.name, 'Unknown Staff') AS group_label";
          groupByClause = "ie.performed_by_user_id::text, COALESCE(staff.name, 'Unknown Staff')";
          groupJoins = 'LEFT JOIN app_user staff ON staff.id = ie.performed_by_user_id';
          orderClause = 'missing_count DESC';
          break;
      }

      const sql = `
        SELECT
          ${groupSelect},
          COUNT(*) FILTER (WHERE ie.notes LIKE '[MISSING]%') AS missing_count,
          COUNT(*) FILTER (WHERE ie.notes LIKE '[FOUND]%') AS found_count
        FROM inventory_event ie
        JOIN inventory_item ii ON ii.id = ie.inventory_item_id
        ${groupJoins}
        WHERE ie.facility_id = $1
          AND ie.event_type = 'ADJUSTED'
          AND ${resolutionFilter}
          AND ie.occurred_at >= $2
          AND ie.occurred_at <= $3
        GROUP BY ${groupByClause}
        ORDER BY ${orderClause}
      `;

      const result = await query<{
        group_key: string;
        group_label: string;
        missing_count: string;
        found_count: string;
      }>(sql, [facilityId, start, end]);

      const groups = result.rows.map(r => ({
        key: r.group_key,
        label: r.group_label,
        missingCount: parseInt(r.missing_count, 10),
        foundCount: parseInt(r.found_count, 10),
      }));

      const totalMissing = groups.reduce((sum, g) => sum + g.missingCount, 0);
      const totalFound = groups.reduce((sum, g) => sum + g.foundCount, 0);
      const netOpen = totalMissing - totalFound;
      const resolutionRate = totalMissing > 0 ? Math.round((totalFound / totalMissing) * 100) / 100 : null;

      // Top 3 drivers (for non-day groupings)
      let topDrivers: typeof groups | null = null;
      if (groupBy !== 'day' && groups.length > 0) {
        topDrivers = [...groups]
          .sort((a, b) => b.missingCount - a.missingCount)
          .slice(0, 3);
      }

      return ok(reply, {
        summary: { totalMissing, totalFound, netOpen, resolutionRate },
        groups,
        topDrivers,
      });
    },
  });

  // ── [CONTRACT] GET /inventory/missing-events — Drill-down event list ───
  registerContractRoute(fastify, contract.inventory.missingEvents, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
      const { facilityId } = request.user;
      const { start, end, resolution, groupBy, groupKey, date, limit, offset } = request.contractData.query as {
        start: string;
        end: string;
        resolution: 'MISSING' | 'FOUND' | 'BOTH';
        groupBy: 'day' | 'location' | 'catalog' | 'surgeon' | 'staff';
        groupKey?: string;
        date?: string;
        limit: number;
        offset: number;
      };

      // Validate required params per groupBy
      if (groupBy === 'day' && !date) {
        return fail(reply, 'VALIDATION_ERROR', 'date is required when groupBy=day', 400);
      }
      if (groupBy !== 'day' && !groupKey) {
        return fail(reply, 'VALIDATION_ERROR', 'groupKey is required when groupBy is not day', 400);
      }

      const conditions: string[] = [
        'ie.facility_id = $1',
        "ie.event_type = 'ADJUSTED'",
        'ie.occurred_at >= $2',
        'ie.occurred_at <= $3',
      ];
      const values: unknown[] = [facilityId, start, end];
      let paramIdx = 4;

      // Resolution filter
      if (resolution === 'MISSING') {
        conditions.push("ie.notes LIKE '[MISSING]%'");
      } else if (resolution === 'FOUND') {
        conditions.push("ie.notes LIKE '[FOUND]%'");
      } else {
        conditions.push("(ie.notes LIKE '[MISSING]%' OR ie.notes LIKE '[FOUND]%')");
      }

      // Group filter
      let extraJoins = '';
      switch (groupBy) {
        case 'day':
          conditions.push(`ie.occurred_at::date = $${paramIdx++}`);
          values.push(date!);
          break;
        case 'location':
          if (groupKey === 'UNKNOWN') {
            conditions.push('COALESCE(ie.location_id, ii.location_id) IS NULL');
          } else {
            conditions.push(`COALESCE(ie.location_id, ii.location_id) = $${paramIdx++}`);
            values.push(groupKey!);
          }
          break;
        case 'catalog':
          conditions.push(`ii.catalog_id = $${paramIdx++}`);
          values.push(groupKey!);
          break;
        case 'surgeon':
          extraJoins += ' LEFT JOIN surgical_case sc_f ON sc_f.id = ie.case_id';
          if (groupKey === 'NO_CASE') {
            conditions.push('(ie.case_id IS NULL OR sc_f.surgeon_id IS NULL)');
          } else {
            conditions.push(`sc_f.surgeon_id = $${paramIdx++}`);
            values.push(groupKey!);
          }
          break;
        case 'staff':
          conditions.push(`ie.performed_by_user_id = $${paramIdx++}`);
          values.push(groupKey!);
          break;
      }

      const whereClause = conditions.join(' AND ');

      // Count
      const countSql = `
        SELECT COUNT(*) AS count
        FROM inventory_event ie
        JOIN inventory_item ii ON ii.id = ie.inventory_item_id
        ${extraJoins}
        WHERE ${whereClause}
      `;
      const countResult = await query<{ count: string }>(countSql, values);
      const total = parseInt(countResult.rows[0].count, 10);

      // Fetch — use effective location via COALESCE
      const fetchSql = `
        SELECT
          ie.id,
          ie.occurred_at,
          ie.notes,
          ie.inventory_item_id,
          ic.name AS catalog_name,
          ii.lot_number,
          ii.serial_number,
          l.name AS location_name,
          surgeon_u.name AS surgeon_name,
          staff_u.name AS staff_name
        FROM inventory_event ie
        JOIN inventory_item ii ON ii.id = ie.inventory_item_id
        JOIN item_catalog ic ON ic.id = ii.catalog_id
        LEFT JOIN location l ON l.id = COALESCE(ie.location_id, ii.location_id)
        LEFT JOIN surgical_case sc ON sc.id = ie.case_id
        LEFT JOIN app_user surgeon_u ON surgeon_u.id = sc.surgeon_id
        LEFT JOIN app_user staff_u ON staff_u.id = ie.performed_by_user_id
        ${extraJoins}
        WHERE ${whereClause}
        ORDER BY ie.occurred_at DESC, ie.id DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
      `;

      const result = await query<{
        id: string;
        occurred_at: Date;
        notes: string;
        inventory_item_id: string;
        catalog_name: string;
        lot_number: string | null;
        serial_number: string | null;
        location_name: string | null;
        surgeon_name: string | null;
        staff_name: string | null;
      }>(fetchSql, [...values, limit, offset]);

      return ok(reply, {
        total,
        events: result.rows.map(r => ({
          id: r.id,
          occurredAt: r.occurred_at.toISOString(),
          type: (r.notes?.startsWith('[MISSING]') ? 'MISSING' : 'FOUND') as 'MISSING' | 'FOUND',
          inventoryItemId: r.inventory_item_id,
          catalogName: r.catalog_name,
          lotNumber: r.lot_number,
          serialNumber: r.serial_number,
          locationName: r.location_name,
          surgeonName: r.surgeon_name,
          staffName: r.staff_name,
          notes: r.notes || '',
        })),
      });
    },
  });

  // ── [CONTRACT] GET /inventory/open-missing-aging — Aging report ────────
  registerContractRoute(fastify, contract.inventory.openMissingAging, PREFIX, {
    preHandler: [requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
      const { facilityId } = request.user;

      const sql = `
        SELECT
          ii.id AS inventory_item_id,
          ic.name AS catalog_name,
          ii.lot_number,
          ii.serial_number,
          l.name AS location_name,
          missing_evt.occurred_at AS missing_since,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - missing_evt.occurred_at)) / 86400) AS days_missing,
          staff_u.name AS last_staff_name
        FROM inventory_item ii
        JOIN item_catalog ic ON ic.id = ii.catalog_id
        LEFT JOIN location l ON l.id = ii.location_id
        LEFT JOIN LATERAL (
          SELECT ie.occurred_at, ie.performed_by_user_id
          FROM inventory_event ie
          WHERE ie.inventory_item_id = ii.id
            AND ie.event_type = 'ADJUSTED'
            AND ie.notes LIKE '[MISSING]%'
          ORDER BY ie.occurred_at DESC
          LIMIT 1
        ) missing_evt ON true
        LEFT JOIN app_user staff_u ON staff_u.id = missing_evt.performed_by_user_id
        WHERE ii.facility_id = $1
          AND ii.availability_status = 'MISSING'
        ORDER BY missing_evt.occurred_at ASC NULLS LAST
      `;

      const result = await query<{
        inventory_item_id: string;
        catalog_name: string;
        lot_number: string | null;
        serial_number: string | null;
        location_name: string | null;
        missing_since: Date | null;
        days_missing: string | null;
        last_staff_name: string | null;
      }>(sql, [facilityId]);

      const items = result.rows.map(r => ({
        inventoryItemId: r.inventory_item_id,
        catalogName: r.catalog_name,
        lotNumber: r.lot_number,
        serialNumber: r.serial_number,
        locationName: r.location_name,
        missingSince: r.missing_since?.toISOString() ?? new Date().toISOString(),
        daysMissing: r.days_missing ? parseInt(r.days_missing, 10) : 0,
        lastStaffName: r.last_staff_name,
      }));

      return ok(reply, { total: items.length, items });
    },
  });
}
