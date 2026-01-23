/**
 * Settings Routes
 * Facility settings and room management
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateRoomRequestSchema,
  UpdateRoomRequestSchema,
} from '../schemas/index.js';
import { requireAdmin } from '../plugins/auth.js';

interface RoomRow {
  id: string;
  facility_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /settings/rooms
   * List all rooms in facility
   */
  fastify.get<{ Querystring: { includeInactive?: string } }>('/rooms', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const includeInactive = request.query.includeInactive === 'true';

    let sql = `
      SELECT id, facility_id, name, active, sort_order, created_at, updated_at
      FROM room
      WHERE facility_id = $1
    `;

    if (!includeInactive) {
      sql += ` AND active = true`;
    }

    sql += ` ORDER BY sort_order ASC, name ASC`;

    const result = await query<RoomRow>(sql, [facilityId]);

    return reply.send({
      rooms: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        active: row.active,
        sortOrder: row.sort_order,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * POST /settings/rooms
   * Create new room (ADMIN only)
   */
  fastify.post('/rooms', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateRoomRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Check name uniqueness
    const nameCheck = await query(`
      SELECT id FROM room WHERE facility_id = $1 AND LOWER(name) = LOWER($2)
    `, [facilityId, data.name]);

    if (nameCheck.rows.length > 0) {
      return reply.status(400).send({ error: 'Room name already exists' });
    }

    // Get the next sort_order value
    const maxOrderResult = await query<{ max_order: number | null }>(`
      SELECT MAX(sort_order) as max_order FROM room WHERE facility_id = $1
    `, [facilityId]);
    const nextSortOrder = (maxOrderResult.rows[0]?.max_order ?? -1) + 1;

    const result = await query<RoomRow>(`
      INSERT INTO room (facility_id, name, active, sort_order)
      VALUES ($1, $2, true, $3)
      RETURNING *
    `, [facilityId, data.name, nextSortOrder]);

    const row = result.rows[0];
    return reply.status(201).send({
      room: {
        id: row.id,
        name: row.name,
        active: row.active,
        sortOrder: row.sort_order,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * PATCH /settings/rooms/:id
   * Update room (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/rooms/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateRoomRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check room exists
    const existingResult = await query(`
      SELECT id FROM room WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    // Check name uniqueness if changing
    if (data.name) {
      const nameCheck = await query(`
        SELECT id FROM room WHERE facility_id = $1 AND LOWER(name) = LOWER($2) AND id != $3
      `, [facilityId, data.name, id]);

      if (nameCheck.rows.length > 0) {
        return reply.status(400).send({ error: 'Room name already exists' });
      }
    }

    if (!data.name) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    const result = await query<RoomRow>(`
      UPDATE room SET name = $1, updated_at = NOW()
      WHERE id = $2 AND facility_id = $3
      RETURNING *
    `, [data.name, id, facilityId]);

    const row = result.rows[0];
    return reply.send({
      room: {
        id: row.id,
        name: row.name,
        active: row.active,
        sortOrder: row.sort_order,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /settings/rooms/:id/deactivate
   * Deactivate room (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/rooms/:id/deactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM room WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    if (!result.rows[0].active) {
      return reply.status(400).send({ error: 'Room is already inactive' });
    }

    await query(`
      UPDATE room SET active = false, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });

  /**
   * POST /settings/rooms/:id/activate
   * Activate room (ADMIN only)
   */
  fastify.post<{ Params: { id: string } }>('/rooms/:id/activate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{ active: boolean }>(`
      SELECT active FROM room WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    if (result.rows[0].active) {
      return reply.status(400).send({ error: 'Room is already active' });
    }

    await query(`
      UPDATE room SET active = true, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });

  /**
   * POST /settings/rooms/reorder
   * Reorder rooms (ADMIN only)
   * Body: { orderedIds: string[] } - array of room IDs in desired order
   */
  fastify.post<{ Body: { orderedIds: string[] } }>('/rooms/reorder', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { orderedIds } = request.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return reply.status(400).send({ error: 'orderedIds must be a non-empty array' });
    }

    // Verify all rooms belong to this facility
    const roomCheck = await query<{ id: string }>(`
      SELECT id FROM room WHERE facility_id = $1
    `, [facilityId]);

    const facilityRoomIds = new Set(roomCheck.rows.map(r => r.id));
    const invalidIds = orderedIds.filter(id => !facilityRoomIds.has(id));

    if (invalidIds.length > 0) {
      return reply.status(400).send({ error: 'Invalid room IDs provided' });
    }

    // Update sort_order for each room in a transaction
    await query('BEGIN');
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await query(`
          UPDATE room SET sort_order = $1, updated_at = NOW()
          WHERE id = $2 AND facility_id = $3
        `, [i, orderedIds[i], facilityId]);
      }
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    return reply.send({ success: true });
  });

  // ============================================================================
  // SURGEON SETTINGS
  // ============================================================================

  interface SurgeonRow {
    id: string;
    name: string;
    username: string;
    display_color: string | null;
  }

  /**
   * GET /settings/surgeons
   * List all surgeons with their display settings
   */
  fastify.get('/surgeons', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    const result = await query<SurgeonRow>(`
      SELECT id, name, username, display_color
      FROM app_user
      WHERE facility_id = $1 AND 'SURGEON' = ANY(roles)
      ORDER BY name ASC
    `, [facilityId]);

    return reply.send({
      surgeons: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        username: row.username,
        displayColor: row.display_color,
      })),
    });
  });

  /**
   * PATCH /settings/surgeons/:id
   * Update surgeon settings (ADMIN only)
   */
  fastify.patch<{ Params: { id: string }; Body: { displayColor?: string | null } }>('/surgeons/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;
    const { displayColor } = request.body;

    // Validate color format if provided
    if (displayColor !== undefined && displayColor !== null) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(displayColor)) {
        return reply.status(400).send({ error: 'Invalid color format. Use hex format (e.g., #3B82F6)' });
      }
    }

    // Verify user exists and is a surgeon in this facility
    const userCheck = await query<{ id: string }>(`
      SELECT id
      FROM app_user
      WHERE id = $1 AND facility_id = $2 AND 'SURGEON' = ANY(roles)
    `, [id, facilityId]);

    if (userCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Surgeon not found' });
    }

    // Update the display color
    await query(`
      UPDATE app_user SET display_color = $1, updated_at = NOW()
      WHERE id = $2 AND facility_id = $3
    `, [displayColor ?? null, id, facilityId]);

    return reply.send({ success: true });
  });
}
