/**
 * Inventory Routes
 * Inventory events ingestion (including from device adapter)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query, transaction } from '../db/index.js';
import {
  CreateInventoryEventRequestSchema,
  BulkInventoryEventRequestSchema,
  CreateDeviceEventRequestSchema,
} from '../schemas/index.js';
import { requireInventoryTech } from '../plugins/auth.js';

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
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

    // Verify inventory item exists and belongs to facility
    const itemResult = await query<{ id: string; location_id: string | null }>(`
      SELECT id, location_id FROM inventory_item
      WHERE id = $1 AND facility_id = $2
    `, [data.inventoryItemId, facilityId]);

    if (itemResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Inventory item not found' });
    }

    const previousLocationId = itemResult.rows[0].location_id;
    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    await transaction(async (client) => {
      // Insert event (append-only)
      await client.query(`
        INSERT INTO inventory_event (
          facility_id, inventory_item_id, event_type, case_id, location_id,
          previous_location_id, sterility_status, notes, performed_by_user_id,
          device_event_id, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        facilityId,
        data.inventoryItemId,
        data.eventType,
        data.caseId || null,
        data.locationId || null,
        previousLocationId,
        data.sterilityStatus || null,
        data.notes || null,
        userId,
        data.deviceEventId || null,
        occurredAt,
      ]);

      // Update inventory item state based on event type
      await updateInventoryItemState(client, data.inventoryItemId, data, userId);
    });

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
    const itemResult = await query<{ id: string }>(`
      SELECT id FROM inventory_item
      WHERE id = ANY($1) AND facility_id = $2
    `, [itemIds, facilityId]);

    const existingIds = new Set(itemResult.rows.map(r => r.id));
    const missingIds = itemIds.filter(id => !existingIds.has(id));

    if (missingIds.length > 0) {
      return reply.status(400).send({
        error: 'Some inventory items not found',
        missingIds,
      });
    }

    await transaction(async (client) => {
      for (const event of events) {
        const itemInfo = await client.query<{ location_id: string | null }>(`
          SELECT location_id FROM inventory_item WHERE id = $1
        `, [event.inventoryItemId]);

        const previousLocationId = itemInfo.rows[0]?.location_id;
        const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

        await client.query(`
          INSERT INTO inventory_event (
            facility_id, inventory_item_id, event_type, case_id, location_id,
            previous_location_id, sterility_status, notes, performed_by_user_id,
            device_event_id, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          facilityId,
          event.inventoryItemId,
          event.eventType,
          event.caseId || null,
          event.locationId || null,
          previousLocationId,
          event.sterilityStatus || null,
          event.notes || null,
          userId,
          event.deviceEventId || null,
          occurredAt,
        ]);

        await updateInventoryItemState(client, event.inventoryItemId, event, userId);
      }
    });

    return reply.status(201).send({ success: true, count: events.length });
  });

  /**
   * POST /inventory/device-events
   * Receive device event from Device Adapter
   * Processes the event and optionally creates an InventoryEvent
   *
   * Special device ID '00000000-0000-0000-0000-000000000000' is reserved for
   * keyboard wedge input (virtual device, no database record required).
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

    // Special handling for keyboard wedge (virtual device)
    const KEYBOARD_WEDGE_DEVICE_ID = '00000000-0000-0000-0000-000000000000';
    const isKeyboardWedge = data.deviceId === KEYBOARD_WEDGE_DEVICE_ID;

    let deviceLocationId: string | null = null;
    let actualDeviceId = data.deviceId;

    if (isKeyboardWedge) {
      // Keyboard wedge is a virtual device - create or get the facility's keyboard wedge device
      const existingDevice = await query<{ id: string }>(`
        SELECT id FROM device
        WHERE facility_id = $1 AND name = 'Keyboard Wedge (Virtual)'
      `, [facilityId]);

      if (existingDevice.rows.length > 0) {
        actualDeviceId = existingDevice.rows[0].id;
      } else {
        // Create the virtual keyboard wedge device for this facility
        const newDevice = await query<{ id: string }>(`
          INSERT INTO device (facility_id, name, device_type, active)
          VALUES ($1, 'Keyboard Wedge (Virtual)', 'barcode', true)
          RETURNING id
        `, [facilityId]);
        actualDeviceId = newDevice.rows[0].id;
      }
    } else {
      // Verify device exists and belongs to facility
      const deviceResult = await query<{ id: string; location_id: string | null }>(`
        SELECT id, location_id FROM device
        WHERE id = $1 AND facility_id = $2 AND active = true
      `, [data.deviceId, facilityId]);

      if (deviceResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Device not found or inactive' });
      }

      deviceLocationId = deviceResult.rows[0].location_id;
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    // Try to resolve the raw value to an inventory item
    let processedItemId: string | null = null;
    let processingError: string | null = null;

    // Try to match by barcode
    const itemResult = await query<{ id: string }>(`
      SELECT id FROM inventory_item
      WHERE barcode = $1 AND facility_id = $2
    `, [data.rawValue, facilityId]);

    if (itemResult.rows.length > 0) {
      processedItemId = itemResult.rows[0].id;
    } else {
      // Try to match by serial number
      const serialResult = await query<{ id: string }>(`
        SELECT id FROM inventory_item
        WHERE serial_number = $1 AND facility_id = $2
      `, [data.rawValue, facilityId]);

      if (serialResult.rows.length > 0) {
        processedItemId = serialResult.rows[0].id;
      } else {
        processingError = 'No matching inventory item found';
      }
    }

    const result = await transaction(async (client) => {
      // Insert device event (append-only)
      const eventResult = await client.query<{ id: string }>(`
        INSERT INTO device_event (
          facility_id, device_id, device_type, payload_type, raw_value,
          processed_item_id, processed, processing_error, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        facilityId,
        actualDeviceId, // Use resolved device ID (handles keyboard wedge)
        data.deviceType,
        data.payloadType,
        data.rawValue,
        processedItemId,
        processedItemId !== null,
        processingError,
        occurredAt,
      ]);

      const deviceEventId = eventResult.rows[0].id;

      // If we found a matching item, create a VERIFIED inventory event
      if (processedItemId && data.payloadType === 'scan') {
        const itemInfo = await client.query<{ location_id: string | null }>(`
          SELECT location_id FROM inventory_item WHERE id = $1
        `, [processedItemId]);

        await client.query(`
          INSERT INTO inventory_event (
            facility_id, inventory_item_id, event_type, location_id,
            previous_location_id, performed_by_user_id, device_event_id, occurred_at
          ) VALUES ($1, $2, 'VERIFIED', $3, $4, $5, $6, $7)
        `, [
          facilityId,
          processedItemId,
          deviceLocationId || itemInfo.rows[0]?.location_id,
          itemInfo.rows[0]?.location_id,
          userId,
          deviceEventId,
          occurredAt,
        ]);

        // Update item's last verified timestamp
        await client.query(`
          UPDATE inventory_item
          SET last_verified_at = $1, last_verified_by_user_id = $2
          WHERE id = $3
        `, [occurredAt, userId, processedItemId]);
      }

      return { deviceEventId, processedItemId, processingError };
    });

    return reply.status(201).send({
      deviceEventId: result.deviceEventId,
      processed: result.processedItemId !== null,
      processedItemId: result.processedItemId,
      error: result.processingError,
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

    interface DeviceRow {
      id: string;
      name: string;
      device_type: string;
      location_id: string | null;
      location_name: string | null;
      active: boolean;
    }
    const result = await query<DeviceRow>(`
      SELECT d.*, l.name as location_name
      FROM device d
      LEFT JOIN location l ON d.location_id = l.id
      WHERE d.facility_id = $1 AND d.active = true
      ORDER BY d.name
    `, [facilityId]);

    return reply.send({
      devices: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        deviceType: row.device_type,
        locationId: row.location_id,
        locationName: row.location_name,
        active: row.active,
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

    let sql = `
      SELECT i.*, c.name as catalog_name, c.category, l.name as location_name
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      LEFT JOIN location l ON i.location_id = l.id
      WHERE i.facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (catalogId) {
      sql += ` AND i.catalog_id = $${params.length + 1}`;
      params.push(catalogId);
    }
    if (locationId) {
      sql += ` AND i.location_id = $${params.length + 1}`;
      params.push(locationId);
    }
    if (status) {
      sql += ` AND i.availability_status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY c.name, i.created_at`;

    const result = await query(sql, params);

    return reply.send({ items: result.rows });
  });
}

// Helper function to update inventory item state based on event
async function updateInventoryItemState(
  client: any,
  itemId: string,
  event: {
    eventType: string;
    locationId?: string;
    sterilityStatus?: string;
    caseId?: string;
  },
  userId: string
): Promise<void> {
  switch (event.eventType) {
    case 'VERIFIED':
      await client.query(`
        UPDATE inventory_item
        SET last_verified_at = NOW(), last_verified_by_user_id = $1
        WHERE id = $2
      `, [userId, itemId]);
      break;

    case 'LOCATION_CHANGED':
      if (event.locationId) {
        await client.query(`
          UPDATE inventory_item SET location_id = $1 WHERE id = $2
        `, [event.locationId, itemId]);
      }
      break;

    case 'RESERVED':
      await client.query(`
        UPDATE inventory_item
        SET availability_status = 'RESERVED', reserved_for_case_id = $1
        WHERE id = $2
      `, [event.caseId, itemId]);
      break;

    case 'RELEASED':
      await client.query(`
        UPDATE inventory_item
        SET availability_status = 'AVAILABLE', reserved_for_case_id = NULL
        WHERE id = $1
      `, [itemId]);
      break;

    case 'CONSUMED':
      await client.query(`
        UPDATE inventory_item
        SET availability_status = 'UNAVAILABLE', reserved_for_case_id = NULL
        WHERE id = $1
      `, [itemId]);
      break;

    case 'EXPIRED':
      await client.query(`
        UPDATE inventory_item SET sterility_status = 'EXPIRED' WHERE id = $1
      `, [itemId]);
      break;

    case 'RECEIVED':
      if (event.sterilityStatus) {
        await client.query(`
          UPDATE inventory_item
          SET sterility_status = $1, availability_status = 'AVAILABLE'
          WHERE id = $2
        `, [event.sterilityStatus, itemId]);
      }
      break;
  }
}
