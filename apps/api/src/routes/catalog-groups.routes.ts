/**
 * Catalog Groups Management Routes
 * LAW Reference: docs/LAW/catalog.md Section 4D (Facility Groups)
 *
 * ADMIN-only endpoints for managing facility-defined catalog groups.
 * Groups are for human organization, UI, reporting, and purchasing only.
 * Groups MUST NOT drive alarms, readiness, or enforcement logic.
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateCatalogGroupRequestSchema,
  UpdateCatalogGroupRequestSchema,
  AddGroupItemsRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';

interface GroupRow {
  id: string;
  facility_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface GroupWithCount extends GroupRow {
  item_count: string;
}

interface CatalogItemRow {
  id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  catalog_number: string | null;
  active: boolean;
}

export async function catalogGroupsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /catalog/groups
   * List all catalog groups in facility
   */
  fastify.get<{ Querystring: { includeInactive?: string } }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { includeInactive } = request.query;

    let sql = `
      SELECT
        g.id, g.facility_id, g.name, g.description, g.active,
        g.created_at, g.updated_at,
        (SELECT COUNT(*) FROM catalog_group_item cgi WHERE cgi.group_id = g.id) as item_count
      FROM catalog_group g
      WHERE g.facility_id = $1
    `;

    if (includeInactive !== 'true') {
      sql += ` AND g.active = true`;
    }

    sql += ` ORDER BY g.name ASC`;

    const result = await query<GroupWithCount>(sql, [facilityId]);

    return ok(reply, {
      groups: result.rows.map(row => ({
        id: row.id,
        facilityId: row.facility_id,
        name: row.name,
        description: row.description,
        active: row.active,
        itemCount: parseInt(row.item_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * POST /catalog/groups
   * Create new catalog group (ADMIN only)
   */
  fastify.post('/', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const parseResult = CreateCatalogGroupRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Check name uniqueness within facility (case-insensitive)
    const nameCheck = await query(`
      SELECT id FROM catalog_group WHERE facility_id = $1 AND LOWER(name) = LOWER($2)
    `, [facilityId, data.name]);

    if (nameCheck.rows.length > 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Group name already exists');
    }

    const result = await query<GroupRow>(`
      INSERT INTO catalog_group (facility_id, name, description, active)
      VALUES ($1, $2, $3, true)
      RETURNING *
    `, [facilityId, data.name, data.description || null]);

    const row = result.rows[0];
    return ok(reply, {
      group: {
        id: row.id,
        facilityId: row.facility_id,
        name: row.name,
        description: row.description,
        active: row.active,
        itemCount: 0,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    }, 201);
  });

  /**
   * PATCH /catalog/groups/:groupId
   * Update catalog group (ADMIN only)
   */
  fastify.patch<{ Params: { groupId: string } }>('/:groupId', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { groupId } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateCatalogGroupRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Check group exists
    const existingResult = await query(`
      SELECT id FROM catalog_group WHERE id = $1 AND facility_id = $2
    `, [groupId, facilityId]);

    if (existingResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Group not found', 404);
    }

    // Check name uniqueness if changing name
    if (data.name) {
      const nameCheck = await query(`
        SELECT id FROM catalog_group WHERE facility_id = $1 AND LOWER(name) = LOWER($2) AND id != $3
      `, [facilityId, data.name, groupId]);

      if (nameCheck.rows.length > 0) {
        return fail(reply, 'VALIDATION_ERROR', 'Group name already exists');
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
    if (data.active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(data.active);
    }

    if (updates.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'No updates provided');
    }

    values.push(groupId, facilityId);

    await query(`
      UPDATE catalog_group
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
    `, values);

    // Get updated group with count
    const result = await query<GroupWithCount>(`
      SELECT
        g.id, g.facility_id, g.name, g.description, g.active,
        g.created_at, g.updated_at,
        (SELECT COUNT(*) FROM catalog_group_item cgi WHERE cgi.group_id = g.id) as item_count
      FROM catalog_group g
      WHERE g.id = $1
    `, [groupId]);

    const row = result.rows[0];
    return ok(reply, {
      group: {
        id: row.id,
        facilityId: row.facility_id,
        name: row.name,
        description: row.description,
        active: row.active,
        itemCount: parseInt(row.item_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * GET /catalog/groups/:groupId/items
   * List catalog items in a group
   */
  fastify.get<{ Params: { groupId: string }; Querystring: { includeInactive?: string } }>('/:groupId/items', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { groupId } = request.params;
    const { facilityId } = request.user;
    const { includeInactive } = request.query;

    // Verify group exists and belongs to facility
    const groupCheck = await query(`
      SELECT id FROM catalog_group WHERE id = $1 AND facility_id = $2
    `, [groupId, facilityId]);

    if (groupCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Group not found', 404);
    }

    let sql = `
      SELECT
        c.id, c.name, c.category, c.manufacturer, c.catalog_number, c.active
      FROM item_catalog c
      INNER JOIN catalog_group_item cgi ON cgi.catalog_id = c.id
      WHERE cgi.group_id = $1 AND cgi.facility_id = $2
    `;

    if (includeInactive !== 'true') {
      sql += ` AND c.active = true`;
    }

    sql += ` ORDER BY c.name ASC`;

    const result = await query<CatalogItemRow>(sql, [groupId, facilityId]);

    return ok(reply, {
      items: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        active: row.active,
      })),
    });
  });

  /**
   * POST /catalog/groups/:groupId/items
   * Add catalog items to group (ADMIN only)
   */
  fastify.post<{ Params: { groupId: string } }>('/:groupId/items', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { groupId } = request.params;
    const { facilityId } = request.user;

    const parseResult = AddGroupItemsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const { catalogIds } = parseResult.data;

    // Verify group exists and belongs to facility
    const groupCheck = await query(`
      SELECT id FROM catalog_group WHERE id = $1 AND facility_id = $2
    `, [groupId, facilityId]);

    if (groupCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Group not found', 404);
    }

    // Verify all catalog items exist and belong to same facility
    const catalogCheck = await query<{ id: string }>(`
      SELECT id FROM item_catalog WHERE id = ANY($1) AND facility_id = $2
    `, [catalogIds, facilityId]);

    if (catalogCheck.rows.length !== catalogIds.length) {
      const validIds = new Set(catalogCheck.rows.map(r => r.id));
      const invalidIds = catalogIds.filter(id => !validIds.has(id));
      return fail(reply, 'VALIDATION_ERROR', 'Some catalog items not found', 400, { invalidIds });
    }

    // Insert memberships (ignore duplicates)
    let addedCount = 0;
    for (const catalogId of catalogIds) {
      try {
        await query(`
          INSERT INTO catalog_group_item (facility_id, group_id, catalog_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (group_id, catalog_id) DO NOTHING
        `, [facilityId, groupId, catalogId]);
        addedCount++;
      } catch {
        // Ignore constraint violations
      }
    }

    return ok(reply, {
      success: true,
      addedCount,
    }, 201);
  });

  /**
   * DELETE /catalog/groups/:groupId/items/:catalogId
   * Remove catalog item from group (ADMIN only)
   */
  fastify.delete<{ Params: { groupId: string; catalogId: string } }>('/:groupId/items/:catalogId', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { groupId, catalogId } = request.params;
    const { facilityId } = request.user;

    // Verify group exists and belongs to facility
    const groupCheck = await query(`
      SELECT id FROM catalog_group WHERE id = $1 AND facility_id = $2
    `, [groupId, facilityId]);

    if (groupCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Group not found', 404);
    }

    // Delete membership (facility_id check ensures tenant safety)
    const deleteResult = await query(`
      DELETE FROM catalog_group_item
      WHERE group_id = $1 AND catalog_id = $2 AND facility_id = $3
    `, [groupId, catalogId, facilityId]);

    if (deleteResult.rowCount === 0) {
      return fail(reply, 'NOT_FOUND', 'Item not in group', 404);
    }

    return ok(reply, { success: true });
  });
}
