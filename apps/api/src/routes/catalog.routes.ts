/**
 * Item Catalog Management Routes
 * CRUD endpoints for item catalog (master item definitions)
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateCatalogItemRequestSchema,
  UpdateCatalogItemRequestSchema,
} from '../schemas/index.js';
import { requireAdmin } from '../plugins/auth.js';

interface CatalogRow {
  id: string;
  facility_id: string;
  name: string;
  description: string | null;
  category: string;
  manufacturer: string | null;
  catalog_number: string | null;
  requires_sterility: boolean;
  is_loaner: boolean;
  active: boolean;
  // v1.1 Risk-Intent Extensions
  requires_lot_tracking: boolean;
  requires_serial_tracking: boolean;
  requires_expiration_tracking: boolean;
  criticality: string;
  readiness_required: boolean;
  expiration_warning_days: number | null;
  substitutable: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CatalogWithCount extends CatalogRow {
  inventory_count: string;
}

export async function catalogRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /catalog
   * List all catalog items in facility
   */
  fastify.get<{ Querystring: { category?: string; includeInactive?: string } }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { category, includeInactive } = request.query;

    let sql = `
      SELECT
        c.id, c.facility_id, c.name, c.description, c.category,
        c.manufacturer, c.catalog_number, c.requires_sterility, c.is_loaner,
        c.active,
        c.requires_lot_tracking, c.requires_serial_tracking, c.requires_expiration_tracking,
        c.criticality, c.readiness_required, c.expiration_warning_days, c.substitutable,
        c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.catalog_id = c.id) as inventory_count
      FROM item_catalog c
      WHERE c.facility_id = $1
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    if (category) {
      sql += ` AND c.category = $${paramIndex++}`;
      params.push(category);
    }

    if (includeInactive !== 'true') {
      sql += ` AND c.active = true`;
    }

    sql += ` ORDER BY c.category ASC, c.name ASC`;

    const result = await query<CatalogWithCount>(sql, params);

    return reply.send({
      items: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        requiresSterility: row.requires_sterility,
        isLoaner: row.is_loaner,
        active: row.active,
        // v1.1 Risk-Intent Extensions
        requiresLotTracking: row.requires_lot_tracking,
        requiresSerialTracking: row.requires_serial_tracking,
        requiresExpirationTracking: row.requires_expiration_tracking,
        criticality: row.criticality,
        readinessRequired: row.readiness_required,
        expirationWarningDays: row.expiration_warning_days,
        substitutable: row.substitutable,
        inventoryCount: parseInt(row.inventory_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * GET /catalog/:id
   * Get single catalog item details
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<CatalogWithCount>(`
      SELECT
        c.id, c.facility_id, c.name, c.description, c.category,
        c.manufacturer, c.catalog_number, c.requires_sterility, c.is_loaner,
        c.active,
        c.requires_lot_tracking, c.requires_serial_tracking, c.requires_expiration_tracking,
        c.criticality, c.readiness_required, c.expiration_warning_days, c.substitutable,
        c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.catalog_id = c.id) as inventory_count
      FROM item_catalog c
      WHERE c.id = $1 AND c.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    const row = result.rows[0];
    return reply.send({
      item: {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        requiresSterility: row.requires_sterility,
        isLoaner: row.is_loaner,
        active: row.active,
        // v1.1 Risk-Intent Extensions
        requiresLotTracking: row.requires_lot_tracking,
        requiresSerialTracking: row.requires_serial_tracking,
        requiresExpirationTracking: row.requires_expiration_tracking,
        criticality: row.criticality,
        readinessRequired: row.readiness_required,
        expirationWarningDays: row.expiration_warning_days,
        substitutable: row.substitutable,
        inventoryCount: parseInt(row.inventory_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /catalog
   * Create new catalog item (ADMIN only)
   */
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateCatalogItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Check name uniqueness within facility
    const nameCheck = await query(`
      SELECT id FROM item_catalog WHERE facility_id = $1 AND LOWER(name) = LOWER($2)
    `, [facilityId, data.name]);

    if (nameCheck.rows.length > 0) {
      return reply.status(400).send({ error: 'Catalog item name already exists' });
    }

    const result = await query<CatalogRow>(`
      INSERT INTO item_catalog (
        facility_id, name, description, category, manufacturer,
        catalog_number, requires_sterility, is_loaner, active,
        requires_lot_tracking, requires_serial_tracking, requires_expiration_tracking,
        criticality, readiness_required, expiration_warning_days, substitutable
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      facilityId,
      data.name,
      data.description || null,
      data.category,
      data.manufacturer || null,
      data.catalogNumber || null,
      data.requiresSterility ?? true,
      data.isLoaner ?? false,
      // v1.1 fields with defaults
      data.requiresLotTracking ?? false,
      data.requiresSerialTracking ?? false,
      data.requiresExpirationTracking ?? false,
      data.criticality ?? 'ROUTINE',
      data.readinessRequired ?? true,
      data.expirationWarningDays ?? null,
      data.substitutable ?? false,
    ]);

    const row = result.rows[0];
    return reply.status(201).send({
      item: {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        requiresSterility: row.requires_sterility,
        isLoaner: row.is_loaner,
        active: row.active,
        // v1.1 Risk-Intent Extensions
        requiresLotTracking: row.requires_lot_tracking,
        requiresSerialTracking: row.requires_serial_tracking,
        requiresExpirationTracking: row.requires_expiration_tracking,
        criticality: row.criticality,
        readinessRequired: row.readiness_required,
        expirationWarningDays: row.expiration_warning_days,
        substitutable: row.substitutable,
        inventoryCount: 0,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * PATCH /catalog/:id
   * Update catalog item (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateCatalogItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check item exists
    const existingResult = await query(`
      SELECT id FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    // Check name uniqueness if changing
    if (data.name) {
      const nameCheck = await query(`
        SELECT id FROM item_catalog WHERE facility_id = $1 AND LOWER(name) = LOWER($2) AND id != $3
      `, [facilityId, data.name, id]);

      if (nameCheck.rows.length > 0) {
        return reply.status(400).send({ error: 'Catalog item name already exists' });
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(data.category);
    }
    if (data.manufacturer !== undefined) {
      updates.push(`manufacturer = $${paramIndex++}`);
      values.push(data.manufacturer);
    }
    if (data.catalogNumber !== undefined) {
      updates.push(`catalog_number = $${paramIndex++}`);
      values.push(data.catalogNumber);
    }
    if (data.requiresSterility !== undefined) {
      updates.push(`requires_sterility = $${paramIndex++}`);
      values.push(data.requiresSterility);
    }
    if (data.isLoaner !== undefined) {
      updates.push(`is_loaner = $${paramIndex++}`);
      values.push(data.isLoaner);
    }
    // v1.1 Risk-Intent Extensions
    if (data.requiresLotTracking !== undefined) {
      updates.push(`requires_lot_tracking = $${paramIndex++}`);
      values.push(data.requiresLotTracking);
    }
    if (data.requiresSerialTracking !== undefined) {
      updates.push(`requires_serial_tracking = $${paramIndex++}`);
      values.push(data.requiresSerialTracking);
    }
    if (data.requiresExpirationTracking !== undefined) {
      updates.push(`requires_expiration_tracking = $${paramIndex++}`);
      values.push(data.requiresExpirationTracking);
    }
    if (data.criticality !== undefined) {
      updates.push(`criticality = $${paramIndex++}`);
      values.push(data.criticality);
    }
    if (data.readinessRequired !== undefined) {
      updates.push(`readiness_required = $${paramIndex++}`);
      values.push(data.readinessRequired);
    }
    if (data.expirationWarningDays !== undefined) {
      updates.push(`expiration_warning_days = $${paramIndex++}`);
      values.push(data.expirationWarningDays);
    }
    if (data.substitutable !== undefined) {
      updates.push(`substitutable = $${paramIndex++}`);
      values.push(data.substitutable);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    values.push(id, facilityId);

    await query(`
      UPDATE item_catalog
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
    `, values);

    // Get updated item with count
    const result = await query<CatalogWithCount>(`
      SELECT
        c.id, c.facility_id, c.name, c.description, c.category,
        c.manufacturer, c.catalog_number, c.requires_sterility, c.is_loaner,
        c.active,
        c.requires_lot_tracking, c.requires_serial_tracking, c.requires_expiration_tracking,
        c.criticality, c.readiness_required, c.expiration_warning_days, c.substitutable,
        c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.catalog_id = c.id) as inventory_count
      FROM item_catalog c
      WHERE c.id = $1
    `, [id]);

    const row = result.rows[0];
    return reply.send({
      item: {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        requiresSterility: row.requires_sterility,
        isLoaner: row.is_loaner,
        active: row.active,
        // v1.1 Risk-Intent Extensions
        requiresLotTracking: row.requires_lot_tracking,
        requiresSerialTracking: row.requires_serial_tracking,
        requiresExpirationTracking: row.requires_expiration_tracking,
        criticality: row.criticality,
        readinessRequired: row.readiness_required,
        expirationWarningDays: row.expiration_warning_days,
        substitutable: row.substitutable,
        inventoryCount: parseInt(row.inventory_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /catalog/:id/deactivate
   * Deactivate catalog item (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/:id/deactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    if (!result.rows[0].active) {
      return reply.status(400).send({ error: 'Catalog item is already inactive' });
    }

    await query(`
      UPDATE item_catalog SET active = false, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });

  /**
   * POST /catalog/:id/activate
   * Activate catalog item (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    if (result.rows[0].active) {
      return reply.status(400).send({ error: 'Catalog item is already active' });
    }

    await query(`
      UPDATE item_catalog SET active = true, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });
}
