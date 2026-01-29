/**
 * General Settings Routes
 * Facility-specific configuration items (Patient Flags, Anesthesia Modalities, etc.)
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateConfigItemRequestSchema,
  UpdateConfigItemRequestSchema,
  ReorderConfigItemsRequestSchema,
} from '../schemas/index.js';
import { requireAdmin } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';

interface ConfigItemRow {
  id: string;
  facility_id: string;
  item_type: string;
  item_key: string;
  display_label: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToResponse(row: ConfigItemRow) {
  return {
    id: row.id,
    itemType: row.item_type,
    itemKey: row.item_key,
    displayLabel: row.display_label,
    description: row.description,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function generalSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /general-settings/config-items
   * List all config items (optionally filtered by type)
   */
  fastify.get<{ Querystring: { itemType?: string; includeInactive?: string } }>('/config-items', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { itemType, includeInactive } = request.query;

    let sql = `
      SELECT id, facility_id, item_type, item_key, display_label, description, sort_order, active, created_at, updated_at
      FROM facility_config_item
      WHERE facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (itemType) {
      sql += ` AND item_type = $2`;
      params.push(itemType);
    }

    if (includeInactive !== 'true') {
      sql += ` AND active = true`;
    }

    sql += ` ORDER BY item_type, sort_order ASC`;

    const result = await query<ConfigItemRow>(sql, params);

    return ok(reply, {
      items: result.rows.map(mapRowToResponse),
    });
  });

  /**
   * POST /general-settings/config-items
   * Create new config item (ADMIN only)
   */
  fastify.post('/config-items', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateConfigItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Check key uniqueness within type
    const keyCheck = await query(`
      SELECT id FROM facility_config_item
      WHERE facility_id = $1 AND item_type = $2 AND LOWER(item_key) = LOWER($3)
    `, [facilityId, data.itemType, data.itemKey]);

    if (keyCheck.rows.length > 0) {
      return fail(reply, 'DUPLICATE', 'Item key already exists for this type', 400);
    }

    // Get next sort order
    const sortResult = await query<{ max_sort: number | null }>(`
      SELECT MAX(sort_order) as max_sort FROM facility_config_item
      WHERE facility_id = $1 AND item_type = $2
    `, [facilityId, data.itemType]);
    const nextSortOrder = (sortResult.rows[0]?.max_sort ?? 0) + 1;

    const result = await query<ConfigItemRow>(`
      INSERT INTO facility_config_item (facility_id, item_type, item_key, display_label, description, sort_order, active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [facilityId, data.itemType, data.itemKey, data.displayLabel, data.description || null, nextSortOrder]);

    const row = result.rows[0];
    return ok(reply, {
      item: mapRowToResponse(row),
    }, 201);
  });

  /**
   * PATCH /general-settings/config-items/:id
   * Update config item (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/config-items/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateConfigItemRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Check item exists
    const existingResult = await query(`
      SELECT id FROM facility_config_item WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Config item not found', 404);
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.displayLabel !== undefined) {
      updates.push(`display_label = $${paramIndex++}`);
      values.push(data.displayLabel);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }

    if (updates.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'No updates provided', 400);
    }

    values.push(id, facilityId);

    const result = await query<ConfigItemRow>(`
      UPDATE facility_config_item
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING *
    `, values);

    const row = result.rows[0];
    return ok(reply, {
      item: mapRowToResponse(row),
    });
  });

  /**
   * POST /general-settings/config-items/:id/deactivate
   * Deactivate config item (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/config-items/:id/deactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM facility_config_item WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Config item not found', 404);
    }

    if (!result.rows[0].active) {
      return fail(reply, 'INVALID_STATE', 'Item is already inactive', 400);
    }

    await query(`
      UPDATE facility_config_item SET active = false, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return ok(reply, { success: true });
  });

  /**
   * POST /general-settings/config-items/:id/activate
   * Activate config item (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/config-items/:id/activate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM facility_config_item WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Config item not found', 404);
    }

    if (result.rows[0].active) {
      return fail(reply, 'INVALID_STATE', 'Item is already active', 400);
    }

    await query(`
      UPDATE facility_config_item SET active = true, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return ok(reply, { success: true });
  });

  /**
   * PUT /general-settings/config-items/reorder (legacy — prefer PATCH)
   * PATCH /general-settings/config-items/reorder
   * Bulk reorder config items (ADMIN only)
   */
  const reorderHandler = async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const parseResult = ReorderConfigItemsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const { facilityId } = request.user;
    const { itemType, orderedIds } = parseResult.data;

    // Verify all IDs belong to this facility and type
    const verifyResult = await query<{ id: string }>(`
      SELECT id FROM facility_config_item
      WHERE facility_id = $1 AND item_type = $2 AND id = ANY($3)
    `, [facilityId, itemType, orderedIds]);

    if (verifyResult.rows.length !== orderedIds.length) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid item IDs provided', 400);
    }

    // Update sort orders
    for (let i = 0; i < orderedIds.length; i++) {
      await query(`
        UPDATE facility_config_item
        SET sort_order = $1, updated_at = NOW()
        WHERE id = $2 AND facility_id = $3
      `, [i + 1, orderedIds[i], facilityId]);
    }

    return ok(reply, { success: true });
  };
  fastify.put('/config-items/reorder', { preHandler: [requireAdmin] }, reorderHandler);
  fastify.patch('/config-items/reorder', { preHandler: [requireAdmin] }, reorderHandler);
}
