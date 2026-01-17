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
      SELECT id, facility_id, name, active, created_at, updated_at
      FROM room
      WHERE facility_id = $1
    `;

    if (!includeInactive) {
      sql += ` AND active = true`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await query<RoomRow>(sql, [facilityId]);

    return reply.send({
      rooms: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        active: row.active,
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

    const result = await query<RoomRow>(`
      INSERT INTO room (facility_id, name, active)
      VALUES ($1, $2, true)
      RETURNING *
    `, [facilityId, data.name]);

    const row = result.rows[0];
    return reply.status(201).send({
      room: {
        id: row.id,
        name: row.name,
        active: row.active,
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
}
