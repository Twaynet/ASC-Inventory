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
// capability-guardrail-allowlist: requireScheduler used; target CASE_APPROVE / CASE_ASSIGN_ROOM (Wave 4)

interface CaseRow {
  id: string;
  case_number: string;
  procedure_name: string;
  laterality: string | null;
  surgeon_id: string;
  surgeon_name: string;
  surgeon_color: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  room_id: string | null;
  estimated_duration_minutes: number;
  sort_order: number;
  is_active: boolean;
}

interface ChecklistInstanceRow {
  case_id: string;
  type: string;
  status: string;
  completed_at: Date | null;
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
      ORDER BY sort_order ASC, name ASC
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
        c.laterality,
        c.surgeon_id,
        u.name as surgeon_name,
        u.display_color as surgeon_color,
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

    // Get checklist instances for cases on this date
    const caseIds = casesResult.rows.map(c => c.id);
    const checklistMap = new Map<string, { timeout?: string; debrief?: string }>();

    if (caseIds.length > 0) {
      try {
        const checklistsResult = await query<ChecklistInstanceRow>(`
          SELECT
            ci.case_id,
            ct.type::text as type,
            ci.status::text as status,
            ci.completed_at
          FROM case_checklist_instance ci
          JOIN checklist_template_version ctv ON ci.template_version_id = ctv.id
          JOIN checklist_template ct ON ctv.template_id = ct.id
          WHERE ci.case_id = ANY($1)
        `, [caseIds]);

        for (const row of checklistsResult.rows) {
          if (!checklistMap.has(row.case_id)) {
            checklistMap.set(row.case_id, {});
          }
          const entry = checklistMap.get(row.case_id)!;
          if (row.type === 'TIMEOUT') {
            entry.timeout = row.status;
          } else if (row.type === 'DEBRIEF') {
            entry.debrief = row.status;
          }
        }
      } catch (err) {
        // Checklist tables may not exist yet - gracefully skip
        // This allows the schedule to work even if checklists aren't set up
      }
    }

    // Group cases and blocks by room
    const roomItems = new Map<string, Array<{
      type: 'case' | 'block';
      id: string;
      sortOrder: number;
      durationMinutes: number;
      caseNumber?: string;
      procedureName?: string;
      laterality?: string | null;
      surgeonId?: string;
      surgeonName?: string;
      surgeonColor?: string | null;
      scheduledTime?: string | null;
      status?: string;
      notes?: string | null;
      isActive?: boolean;
      timeoutStatus?: string;
      debriefStatus?: string;
    }>>();

    // Initialize empty arrays for all rooms
    for (const room of roomsResult.rows) {
      roomItems.set(room.id, []);
    }

    // Add cases to their rooms
    for (const c of casesResult.rows) {
      if (c.room_id && roomItems.has(c.room_id)) {
        const checklists = checklistMap.get(c.id);
        roomItems.get(c.room_id)!.push({
          type: 'case',
          id: c.id,
          sortOrder: c.sort_order,
          durationMinutes: c.estimated_duration_minutes,
          caseNumber: c.case_number,
          procedureName: c.procedure_name,
          laterality: c.laterality,
          surgeonId: c.surgeon_id,
          surgeonName: c.surgeon_name,
          surgeonColor: c.surgeon_color,
          scheduledTime: c.scheduled_time,
          status: c.status,
          isActive: c.is_active,
          timeoutStatus: checklists?.timeout,
          debriefStatus: checklists?.debrief,
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
      .map(c => {
        const checklists = checklistMap.get(c.id);
        return {
          type: 'case' as const,
          id: c.id,
          sortOrder: c.sort_order,
          durationMinutes: c.estimated_duration_minutes,
          caseNumber: c.case_number,
          procedureName: c.procedure_name,
          laterality: c.laterality,
          surgeonId: c.surgeon_id,
          surgeonName: c.surgeon_name,
          surgeonColor: c.surgeon_color,
          scheduledTime: c.scheduled_time,
          status: c.status,
          isActive: c.is_active,
          timeoutStatus: checklists?.timeout,
          debriefStatus: checklists?.debrief,
        };
      });

    return reply.send({
      date,
      facilityId,
      rooms,
      unassignedCases,
    });
  });

  /**
   * GET /schedule/unassigned
   * Get all unassigned cases (scheduled but no room assigned)
   */
  fastify.get('/unassigned', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const casesResult = await query<CaseRow>(`
      SELECT
        c.id,
        c.case_number,
        c.procedure_name,
        c.surgeon_id,
        u.name as surgeon_name,
        c.scheduled_date,
        c.scheduled_time::text,
        c.status,
        c.room_id,
        COALESCE(c.estimated_duration_minutes, 60) as estimated_duration_minutes,
        COALESCE(c.sort_order, 0) as sort_order,
        c.is_active
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.facility_id = $1
        AND c.room_id IS NULL
        AND c.status = 'SCHEDULED'
        AND c.is_cancelled = false
      ORDER BY c.scheduled_date ASC, c.scheduled_time ASC NULLS LAST
    `, [facilityId]);

    const unassignedCases = casesResult.rows.map(c => ({
      id: c.id,
      type: 'case' as const,
      caseNumber: c.case_number,
      procedureName: c.procedure_name,
      surgeonId: c.surgeon_id,
      surgeonName: c.surgeon_name,
      scheduledDate: c.scheduled_date,
      scheduledTime: c.scheduled_time,
      status: c.status,
      durationMinutes: c.estimated_duration_minutes,
      isActive: c.is_active,
    }));

    return reply.send({
      unassignedCases,
      count: unassignedCases.length,
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
