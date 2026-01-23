/**
 * Schedule Routes
 * Day schedule view, block times, and room day configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query, transaction } from '../db/index.js';
import {
  CreateBlockTimeRequestSchema,
  UpdateBlockTimeRequestSchema,
  SetRoomDayConfigRequestSchema,
} from '../schemas/index.js';
import { requireScheduler } from '../plugins/auth.js';

interface CaseRow {
  id: string;
  case_number: string;
  procedure_name: string;
  surgeon_id: string;
  surgeon_name: string;
  scheduled_time: string | null;
  status: string;
  room_id: string | null;
  estimated_duration_minutes: number;
  sort_order: number;
  is_active: boolean;
}

interface BlockTimeRow {
  id: string;
  room_id: string;
  duration_minutes: number;
  notes: string | null;
  sort_order: number;
  created_at: Date;
  created_by_user_id: string | null;
}

interface RoomRow {
  id: string;
  name: string;
}

interface RoomDayConfigRow {
  room_id: string;
  start_time: string;
}

export async function scheduleRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /schedule/day?date=YYYY-MM-DD
   * Get the day schedule with rooms, cases, and block times
   */
  fastify.get('/day', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { date: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { date } = request.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Get all active rooms for the facility
    const roomsResult = await query<RoomRow>(`
      SELECT id, name FROM room
      WHERE facility_id = $1 AND active = true
      ORDER BY name
    `, [facilityId]);

    // Get room day configs for this date
    const configsResult = await query<RoomDayConfigRow>(`
      SELECT room_id, start_time::text
      FROM room_day_config
      WHERE config_date = $1 AND room_id IN (
        SELECT id FROM room WHERE facility_id = $2 AND active = true
      )
    `, [date, facilityId]);

    const configMap = new Map<string, string>();
    for (const config of configsResult.rows) {
      configMap.set(config.room_id, config.start_time);
    }

    // Get all cases for this date
    const casesResult = await query<CaseRow>(`
      SELECT
        c.id,
        c.case_number,
        c.procedure_name,
        c.surgeon_id,
        u.name as surgeon_name,
        c.scheduled_time::text,
        c.status,
        c.room_id,
        COALESCE(c.estimated_duration_minutes, 60) as estimated_duration_minutes,
        COALESCE(c.sort_order, 0) as sort_order,
        c.is_active
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.facility_id = $1
        AND c.scheduled_date = $2
        AND c.is_cancelled = false
        AND c.status NOT IN ('CANCELLED', 'REJECTED')
      ORDER BY c.sort_order, c.scheduled_time NULLS LAST
    `, [facilityId, date]);

    // Get all block times for this date
    const blocksResult = await query<BlockTimeRow>(`
      SELECT
        bt.id,
        bt.room_id,
        bt.duration_minutes,
        bt.notes,
        bt.sort_order,
        bt.created_at,
        bt.created_by_user_id
      FROM block_time bt
      JOIN room r ON bt.room_id = r.id
      WHERE bt.facility_id = $1 AND bt.block_date = $2 AND r.active = true
      ORDER BY bt.sort_order
    `, [facilityId, date]);

    // Group cases and blocks by room
    const roomItems = new Map<string, Array<{
      type: 'case' | 'block';
      id: string;
      sortOrder: number;
      durationMinutes: number;
      caseNumber?: string;
      procedureName?: string;
      surgeonId?: string;
      surgeonName?: string;
      scheduledTime?: string | null;
      status?: string;
      notes?: string | null;
    }>>();

    // Initialize empty arrays for all rooms
    for (const room of roomsResult.rows) {
      roomItems.set(room.id, []);
    }

    // Add cases to their rooms
    for (const c of casesResult.rows) {
      if (c.room_id && roomItems.has(c.room_id)) {
        roomItems.get(c.room_id)!.push({
          type: 'case',
          id: c.id,
          sortOrder: c.sort_order,
          durationMinutes: c.estimated_duration_minutes,
          caseNumber: c.case_number,
          procedureName: c.procedure_name,
          surgeonId: c.surgeon_id,
          surgeonName: c.surgeon_name,
          scheduledTime: c.scheduled_time,
          status: c.status,
          isActive: c.is_active,
        });
      }
    }

    // Add block times to their rooms
    for (const b of blocksResult.rows) {
      if (roomItems.has(b.room_id)) {
        roomItems.get(b.room_id)!.push({
          type: 'block',
          id: b.id,
          sortOrder: b.sort_order,
          durationMinutes: b.duration_minutes,
          notes: b.notes,
        });
      }
    }

    // Sort items within each room by sortOrder
    for (const items of roomItems.values()) {
      items.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Build rooms array
    const rooms = roomsResult.rows.map(room => ({
      roomId: room.id,
      roomName: room.name,
      startTime: configMap.get(room.id) || '07:30:00',
      items: roomItems.get(room.id) || [],
    }));

    // Build unassigned cases array
    const unassignedCases = casesResult.rows
      .filter(c => !c.room_id)
      .map(c => ({
        type: 'case' as const,
        id: c.id,
        sortOrder: c.sort_order,
        durationMinutes: c.estimated_duration_minutes,
        caseNumber: c.case_number,
        procedureName: c.procedure_name,
        surgeonId: c.surgeon_id,
        surgeonName: c.surgeon_name,
        scheduledTime: c.scheduled_time,
        status: c.status,
        isActive: c.is_active,
      }));

    return reply.send({
      date,
      facilityId,
      rooms,
      unassignedCases,
    });
  });

  /**
   * POST /schedule/block-times
   * Create a new block time
   */
  fastify.post('/block-times', {
    preHandler: [requireScheduler],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;

    const parseResult = CreateBlockTimeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { roomId, blockDate, durationMinutes, notes, sortOrder } = parseResult.data;

    // Validate room belongs to facility
    const roomResult = await query<{ id: string }>(`
      SELECT id FROM room WHERE id = $1 AND facility_id = $2 AND active = true
    `, [roomId, facilityId]);

    if (roomResult.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid or inactive room' });
    }

    // Get max sort order for the day if not provided
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const maxResult = await query<{ max_sort: number | null }>(`
        SELECT COALESCE(MAX(sort_order), -1) as max_sort
        FROM (
          SELECT sort_order FROM surgical_case
          WHERE room_id = $1 AND scheduled_date = $2 AND is_cancelled = false
          UNION ALL
          SELECT sort_order FROM block_time
          WHERE room_id = $1 AND block_date = $2
        ) combined
      `, [roomId, blockDate]);
      finalSortOrder = (maxResult.rows[0].max_sort ?? -1) + 1;
    }

    const result = await query<{ id: string; created_at: Date }>(`
      INSERT INTO block_time (facility_id, room_id, block_date, duration_minutes, notes, sort_order, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [facilityId, roomId, blockDate, durationMinutes, notes ?? null, finalSortOrder, userId]);

    const roomNameResult = await query<{ name: string }>(`
      SELECT name FROM room WHERE id = $1
    `, [roomId]);

    return reply.status(201).send({
      blockTime: {
        id: result.rows[0].id,
        facilityId,
        roomId,
        roomName: roomNameResult.rows[0]?.name || '',
        blockDate,
        durationMinutes,
        notes: notes ?? null,
        sortOrder: finalSortOrder,
        createdAt: result.rows[0].created_at.toISOString(),
        createdByUserId: userId,
      },
    });
  });

  /**
   * PATCH /schedule/block-times/:id
   * Update a block time
   */
  fastify.patch<{ Params: { id: string } }>('/block-times/:id', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateBlockTimeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { durationMinutes, notes, sortOrder } = parseResult.data;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (durationMinutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex++}`);
      values.push(durationMinutes);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(sortOrder);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    values.push(id, facilityId);

    const result = await query<{
      id: string;
      room_id: string;
      block_date: string;
      duration_minutes: number;
      notes: string | null;
      sort_order: number;
      created_at: Date;
      created_by_user_id: string | null;
    }>(`
      UPDATE block_time
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING id, room_id, block_date::text, duration_minutes, notes, sort_order, created_at, created_by_user_id
    `, values);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Block time not found' });
    }

    const bt = result.rows[0];
    const roomNameResult = await query<{ name: string }>(`
      SELECT name FROM room WHERE id = $1
    `, [bt.room_id]);

    return reply.send({
      blockTime: {
        id: bt.id,
        facilityId,
        roomId: bt.room_id,
        roomName: roomNameResult.rows[0]?.name || '',
        blockDate: bt.block_date,
        durationMinutes: bt.duration_minutes,
        notes: bt.notes,
        sortOrder: bt.sort_order,
        createdAt: bt.created_at.toISOString(),
        createdByUserId: bt.created_by_user_id,
      },
    });
  });

  /**
   * DELETE /schedule/block-times/:id
   * Delete a block time
   */
  fastify.delete<{ Params: { id: string } }>('/block-times/:id', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query(`
      DELETE FROM block_time
      WHERE id = $1 AND facility_id = $2
      RETURNING id
    `, [id, facilityId]);

    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Block time not found' });
    }

    return reply.send({ success: true });
  });

  /**
   * PUT /schedule/rooms/:roomId/day-config
   * Set the start time for a room on a specific date
   */
  fastify.put<{ Params: { roomId: string }; Querystring: { date: string } }>('/rooms/:roomId/day-config', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { roomId } = request.params;
    const { date } = request.query;
    const { facilityId } = request.user;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const parseResult = SetRoomDayConfigRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { startTime } = parseResult.data;

    // Validate room belongs to facility
    const roomResult = await query<{ id: string }>(`
      SELECT id FROM room WHERE id = $1 AND facility_id = $2 AND active = true
    `, [roomId, facilityId]);

    if (roomResult.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid or inactive room' });
    }

    const result = await query<{
      id: string;
      config_date: string;
      start_time: string;
      created_at: Date;
      updated_at: Date;
    }>(`
      INSERT INTO room_day_config (room_id, config_date, start_time)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id, config_date)
      DO UPDATE SET start_time = $3, updated_at = NOW()
      RETURNING id, config_date::text, start_time::text, created_at, updated_at
    `, [roomId, date, startTime]);

    const config = result.rows[0];

    return reply.send({
      config: {
        id: config.id,
        roomId,
        configDate: config.config_date,
        startTime: config.start_time,
        createdAt: config.created_at.toISOString(),
        updatedAt: config.updated_at.toISOString(),
      },
    });
  });

  /**
   * PATCH /schedule/reorder
   * Reorder items within a room (cases and block times)
   */
  fastify.patch<{
    Body: {
      roomId: string | null;
      date: string;
      orderedItems: Array<{ type: 'case' | 'block'; id: string }>;
    };
  }>('/reorder', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { roomId, date, orderedItems } = request.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    if (!orderedItems || !Array.isArray(orderedItems)) {
      return reply.status(400).send({ error: 'orderedItems array is required' });
    }

    // Validate room if provided
    if (roomId) {
      const roomResult = await query<{ id: string }>(`
        SELECT id FROM room WHERE id = $1 AND facility_id = $2 AND active = true
      `, [roomId, facilityId]);

      if (roomResult.rows.length === 0) {
        return reply.status(400).send({ error: 'Invalid or inactive room' });
      }
    }

    await transaction(async (client) => {
      for (let i = 0; i < orderedItems.length; i++) {
        const item = orderedItems[i];
        if (item.type === 'case') {
          await client.query(`
            UPDATE surgical_case
            SET sort_order = $1, room_id = $2, updated_at = NOW()
            WHERE id = $3 AND facility_id = $4 AND scheduled_date = $5
          `, [i, roomId, item.id, facilityId, date]);
        } else if (item.type === 'block') {
          await client.query(`
            UPDATE block_time
            SET sort_order = $1
            WHERE id = $2 AND facility_id = $3 AND block_date = $4
          `, [i, item.id, facilityId, date]);
        }
      }
    });

    return reply.send({ success: true });
  });
}
