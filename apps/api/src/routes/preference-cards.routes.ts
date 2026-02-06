/**
 * Preference Card Management Routes
 * CRUD endpoints for surgeon preference cards
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreatePreferenceCardRequestSchema,
  UpdatePreferenceCardRequestSchema,
  CreatePreferenceCardVersionRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';

interface PreferenceCardRow {
  id: string;
  facility_id: string;
  surgeon_id: string;
  surgeon_name: string;
  procedure_name: string;
  description: string | null;
  active: boolean;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PreferenceCardVersionRow {
  id: string;
  preference_card_id: string;
  version_number: number;
  items: any;
  created_at: Date;
  created_by_user_id: string;
  created_by_name: string;
}

export async function preferenceCardsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /preference-cards
   * List all preference cards in facility
   */
  fastify.get<{ Querystring: { surgeonId?: string; includeInactive?: string } }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { surgeonId, includeInactive } = request.query;

    let sql = `
      SELECT
        pc.id, pc.facility_id, pc.surgeon_id, u.name as surgeon_name,
        pc.procedure_name, pc.description, pc.active, pc.current_version_id,
        pc.created_at, pc.updated_at,
        (SELECT COUNT(*) FROM preference_card_version pcv WHERE pcv.preference_card_id = pc.id) as version_count,
        (SELECT COALESCE(jsonb_array_length(pcv.items), 0) FROM preference_card_version pcv WHERE pcv.id = pc.current_version_id) as item_count
      FROM preference_card pc
      JOIN app_user u ON pc.surgeon_id = u.id
      WHERE pc.facility_id = $1
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    if (surgeonId) {
      sql += ` AND pc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    if (includeInactive !== 'true') {
      sql += ` AND pc.active = true`;
    }

    sql += ` ORDER BY u.name ASC, pc.procedure_name ASC`;

    const result = await query<PreferenceCardRow & { version_count: string; item_count: string }>(sql, params);

    return ok(reply, {
      cards: result.rows.map(row => ({
        id: row.id,
        surgeonId: row.surgeon_id,
        surgeonName: row.surgeon_name,
        procedureName: row.procedure_name,
        description: row.description,
        active: row.active,
        currentVersionId: row.current_version_id,
        versionCount: parseInt(row.version_count || '0'),
        itemCount: parseInt(row.item_count || '0'),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * GET /preference-cards/:id
   * Get preference card with current version items
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const cardResult = await query<PreferenceCardRow>(`
      SELECT
        pc.id, pc.facility_id, pc.surgeon_id, u.name as surgeon_name,
        pc.procedure_name, pc.description, pc.active, pc.current_version_id,
        pc.created_at, pc.updated_at
      FROM preference_card pc
      JOIN app_user u ON pc.surgeon_id = u.id
      WHERE pc.id = $1 AND pc.facility_id = $2
    `, [id, facilityId]);

    if (cardResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found', 404);
    }

    const card = cardResult.rows[0];
    let currentVersion = null;

    if (card.current_version_id) {
      const versionResult = await query<PreferenceCardVersionRow>(`
        SELECT
          pcv.id, pcv.preference_card_id, pcv.version_number, pcv.items,
          pcv.created_at, pcv.created_by_user_id, u.name as created_by_name
        FROM preference_card_version pcv
        JOIN app_user u ON pcv.created_by_user_id = u.id
        WHERE pcv.id = $1
      `, [card.current_version_id]);

      if (versionResult.rows.length > 0) {
        const v = versionResult.rows[0];
        // Enrich items with catalog names
        const items = v.items || [];
        const catalogIds = items.map((i: any) => i.catalogId);

        let enrichedItems = items;
        if (catalogIds.length > 0) {
          const catalogResult = await query<{ id: string; name: string }>(`
            SELECT id, name FROM item_catalog WHERE id = ANY($1)
          `, [catalogIds]);

          const catalogMap = new Map(catalogResult.rows.map(c => [c.id, c.name]));
          enrichedItems = items.map((i: any) => ({
            ...i,
            catalogName: catalogMap.get(i.catalogId) || 'Unknown',
          }));
        }

        currentVersion = {
          id: v.id,
          versionNumber: v.version_number,
          items: enrichedItems,
          createdAt: v.created_at.toISOString(),
          createdByUserId: v.created_by_user_id,
          createdByName: v.created_by_name,
        };
      }
    }

    return ok(reply, {
      card: {
        id: card.id,
        surgeonId: card.surgeon_id,
        surgeonName: card.surgeon_name,
        procedureName: card.procedure_name,
        description: card.description,
        active: card.active,
        currentVersionId: card.current_version_id,
        createdAt: card.created_at.toISOString(),
        updatedAt: card.updated_at.toISOString(),
      },
      currentVersion,
    });
  });

  /**
   * GET /preference-cards/:id/versions
   * Get all versions of a preference card
   */
  fastify.get<{ Params: { id: string } }>('/:id/versions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Verify card exists
    const cardCheck = await query(`
      SELECT id FROM preference_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (cardCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found', 404);
    }

    const result = await query<PreferenceCardVersionRow>(`
      SELECT
        pcv.id, pcv.preference_card_id, pcv.version_number, pcv.items,
        pcv.created_at, pcv.created_by_user_id, u.name as created_by_name
      FROM preference_card_version pcv
      JOIN app_user u ON pcv.created_by_user_id = u.id
      WHERE pcv.preference_card_id = $1
      ORDER BY pcv.version_number DESC
    `, [id]);

    return ok(reply, {
      versions: result.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        itemCount: (v.items || []).length,
        createdAt: v.created_at.toISOString(),
        createdByUserId: v.created_by_user_id,
        createdByName: v.created_by_name,
      })),
    });
  });

  /**
   * POST /preference-cards
   * Create new preference card with initial version (ADMIN only)
   */
  fastify.post('/', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const parseResult = CreatePreferenceCardRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const { facilityId, userId } = request.user;
    const data = parseResult.data;

    // Verify surgeon exists and has SURGEON role
    const surgeonCheck = await query<{ role: string }>(`
      SELECT role FROM app_user WHERE id = $1 AND facility_id = $2 AND active = true
    `, [data.surgeonId, facilityId]);

    if (surgeonCheck.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Surgeon not found');
    }

    if (surgeonCheck.rows[0].role !== 'SURGEON') {
      return fail(reply, 'VALIDATION_ERROR', 'Selected user is not a surgeon');
    }

    // Verify all catalog items exist
    const catalogIds = data.items.map(i => i.catalogId);
    const catalogCheck = await query<{ id: string }>(`
      SELECT id FROM item_catalog WHERE id = ANY($1) AND facility_id = $2 AND active = true
    `, [catalogIds, facilityId]);

    if (catalogCheck.rows.length !== catalogIds.length) {
      return fail(reply, 'VALIDATION_ERROR', 'One or more catalog items not found or inactive');
    }

    // Check for duplicate procedure name for same surgeon
    const nameCheck = await query(`
      SELECT id FROM preference_card
      WHERE surgeon_id = $1 AND LOWER(procedure_name) = LOWER($2) AND facility_id = $3
    `, [data.surgeonId, data.procedureName, facilityId]);

    if (nameCheck.rows.length > 0) {
      return fail(reply, 'DUPLICATE', 'Preference card with this procedure name already exists for this surgeon');
    }

    // Create card
    const cardResult = await query<{ id: string }>(`
      INSERT INTO preference_card (facility_id, surgeon_id, procedure_name, description, active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id
    `, [facilityId, data.surgeonId, data.procedureName, data.description || null]);

    const cardId = cardResult.rows[0].id;

    // Create initial version
    const versionResult = await query<{ id: string }>(`
      INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
      VALUES ($1, 1, $2, $3)
      RETURNING id
    `, [cardId, JSON.stringify(data.items), userId]);

    const versionId = versionResult.rows[0].id;

    // Update card with current version
    await query(`
      UPDATE preference_card SET current_version_id = $1 WHERE id = $2
    `, [versionId, cardId]);

    // Get surgeon name for response
    const surgeonResult = await query<{ name: string }>(`
      SELECT name FROM app_user WHERE id = $1
    `, [data.surgeonId]);

    return ok(reply, {
      card: {
        id: cardId,
        surgeonId: data.surgeonId,
        surgeonName: surgeonResult.rows[0].name,
        procedureName: data.procedureName,
        description: data.description || null,
        active: true,
        currentVersionId: versionId,
        itemCount: data.items.length,
      },
    }, 201);
  });

  /**
   * PATCH /preference-cards/:id
   * Update preference card metadata (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdatePreferenceCardRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Check card exists
    const existingResult = await query<{ surgeon_id: string }>(`
      SELECT surgeon_id FROM preference_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found', 404);
    }

    // Check name uniqueness if changing
    if (data.procedureName) {
      const nameCheck = await query(`
        SELECT id FROM preference_card
        WHERE surgeon_id = $1 AND LOWER(procedure_name) = LOWER($2) AND facility_id = $3 AND id != $4
      `, [existingResult.rows[0].surgeon_id, data.procedureName, facilityId, id]);

      if (nameCheck.rows.length > 0) {
        return fail(reply, 'DUPLICATE', 'Preference card with this procedure name already exists for this surgeon');
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.procedureName !== undefined) {
      updates.push(`procedure_name = $${paramIndex++}`);
      values.push(data.procedureName);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }

    if (updates.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'No updates provided');
    }

    values.push(id, facilityId);

    await query(`
      UPDATE preference_card
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
    `, values);

    return ok(reply, { success: true });
  });

  /**
   * POST /preference-cards/:id/versions
   * Create new version with updated items (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/:id/versions', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = CreatePreferenceCardVersionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Check card exists
    const cardCheck = await query<{ id: string }>(`
      SELECT id FROM preference_card WHERE id = $1 AND facility_id = $2 AND active = true
    `, [id, facilityId]);

    if (cardCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found or inactive', 404);
    }

    // Verify all catalog items exist
    const catalogIds = data.items.map(i => i.catalogId);
    const catalogCheck = await query<{ id: string }>(`
      SELECT id FROM item_catalog WHERE id = ANY($1) AND facility_id = $2 AND active = true
    `, [catalogIds, facilityId]);

    if (catalogCheck.rows.length !== catalogIds.length) {
      return fail(reply, 'VALIDATION_ERROR', 'One or more catalog items not found or inactive');
    }

    // Get next version number
    const versionResult = await query<{ max_version: number }>(`
      SELECT COALESCE(MAX(version_number), 0) as max_version
      FROM preference_card_version
      WHERE preference_card_id = $1
    `, [id]);

    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

    // Create new version
    const newVersionResult = await query<{ id: string }>(`
      INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [id, nextVersion, JSON.stringify(data.items), userId]);

    const newVersionId = newVersionResult.rows[0].id;

    // Update card with current version
    await query(`
      UPDATE preference_card SET current_version_id = $1, updated_at = NOW() WHERE id = $2
    `, [newVersionId, id]);

    // Get user name for response
    const userResult = await query<{ name: string }>(`
      SELECT name FROM app_user WHERE id = $1
    `, [userId]);

    return ok(reply, {
      version: {
        id: newVersionId,
        versionNumber: nextVersion,
        itemCount: data.items.length,
        createdByUserId: userId,
        createdByName: userResult.rows[0].name,
      },
    }, 201);
  });

  /**
   * POST /preference-cards/:id/deactivate
   * Deactivate preference card (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/:id/deactivate', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM preference_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found', 404);
    }

    if (!result.rows[0].active) {
      return fail(reply, 'INVALID_STATE', 'Preference card is already inactive');
    }

    await query(`
      UPDATE preference_card SET active = false, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return ok(reply, { success: true });
  });

  /**
   * POST /preference-cards/:id/activate
   * Activate preference card (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM preference_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Preference card not found', 404);
    }

    if (result.rows[0].active) {
      return fail(reply, 'INVALID_STATE', 'Preference card is already active');
    }

    await query(`
      UPDATE preference_card SET active = true, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return ok(reply, { success: true });
  });
}
