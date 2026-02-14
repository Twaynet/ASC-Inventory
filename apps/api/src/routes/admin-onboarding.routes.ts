/**
 * Admin Onboarding Routes
 *
 * Open Missing Aging Trend → Timeline → Resolution Loop.
 *
 * GET  /api/admin/trends/open-missing-aging
 * GET  /api/admin/missing/:inventoryItemId/timeline
 * POST /api/admin/missing/:inventoryItemId/resolve
 *
 * All endpoints require ADMIN role and enforce facility isolation.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query, transaction } from '../db/index.js';
import { requireAdmin } from '../plugins/auth.js';
import { ok, fail, validated } from '../utils/reply.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESOLUTION_TYPES = [
  'LOCATED',
  'VENDOR_REPLACEMENT',
  'CASE_RESCHEDULED',
  'INVENTORY_ERROR_CORRECTED',
  'OTHER',
] as const;

const ResolveSchema = z.object({
  resolutionType: z.enum(RESOLUTION_TYPES),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Compute days between two dates (floor). */
export function daysOpen(missingSince: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - missingSince.getTime()) / (1000 * 60 * 60 * 24));
}

/** Is daysOpen > 7? */
export function isLongAging(days: number): boolean {
  return days > 7;
}

/** Was the item resolved within 48h of its missing event? */
export function wasResolvedWithin48h(missingSince: Date, resolvedAt: Date): boolean {
  const diffMs = resolvedAt.getTime() - missingSince.getTime();
  return diffMs >= 0 && diffMs <= 48 * 60 * 60 * 1000;
}

/** Group dates into ISO week-start (Monday). */
export function weekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? 6 : day - 1); // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split('T')[0];
}

/**
 * Compute spike annotations from raw daily data and resolution data.
 * Groups by ISO week; computes counts, resolvedWithin48h, and longAging.
 */
export function computeAnnotations(
  dailyCounts: Array<{ date: string; openCount: number }>,
  resolvedItems: Array<{ missingSince: Date; resolvedAt: Date }>,
  openItems: Array<{ missingSince: Date }>,
): Array<{
  weekStart: string;
  count: number;
  resolvedWithin48h: number;
  longAging: number;
}> {
  const weekMap = new Map<string, { count: number; resolvedWithin48h: number; longAging: number }>();

  // Sum open counts per week
  for (const dc of dailyCounts) {
    const ws = weekStart(new Date(dc.date));
    const entry = weekMap.get(ws) || { count: 0, resolvedWithin48h: 0, longAging: 0 };
    entry.count = Math.max(entry.count, dc.openCount); // peak open count in the week
    weekMap.set(ws, entry);
  }

  // Count resolved-within-48h per week (based on missing event week)
  for (const r of resolvedItems) {
    const ws = weekStart(r.missingSince);
    const entry = weekMap.get(ws);
    if (entry && wasResolvedWithin48h(r.missingSince, r.resolvedAt)) {
      entry.resolvedWithin48h++;
    }
  }

  // Count long-aging items per week (based on missing event week)
  const now = new Date();
  for (const item of openItems) {
    const days = daysOpen(item.missingSince, now);
    if (isLongAging(days)) {
      const ws = weekStart(item.missingSince);
      const entry = weekMap.get(ws);
      if (entry) {
        entry.longAging++;
      }
    }
  }

  return Array.from(weekMap.entries())
    .map(([ws, data]) => ({ weekStart: ws, ...data }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function adminOnboardingRoutes(fastify: FastifyInstance): Promise<void> {

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /trends/open-missing-aging
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get<{ Querystring: { days?: string } }>('/trends/open-missing-aging', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
    const facilityId = request.user.facilityId;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const windowDays = Math.min(Math.max(parseInt(request.query.days || '30', 10) || 30, 1), 365);

    // ── Daily open counts (how many items were MISSING on each day) ──
    // For each day in the window, count items that were MISSING on that day:
    // An item is MISSING on date D if it has a [MISSING] event before D
    // and no MISSING_RESOLVED event before D.
    const dailyResult = await query<{ date: string; open_count: string }>(`
      WITH date_series AS (
        SELECT generate_series(
          (CURRENT_DATE - $2::int)::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS d
      ),
      missing_events AS (
        SELECT
          ie.inventory_item_id,
          ie.occurred_at AS missing_since
        FROM inventory_event ie
        WHERE ie.facility_id = $1
          AND ie.event_type = 'ADJUSTED'
          AND ie.notes LIKE '[MISSING]%'
      ),
      resolved_events AS (
        SELECT
          ie.inventory_item_id,
          ie.occurred_at AS resolved_at
        FROM inventory_event ie
        WHERE ie.facility_id = $1
          AND (
            (ie.event_type = 'ADJUSTED' AND ie.notes LIKE '[FOUND]%')
            OR ie.event_type = 'MISSING_RESOLVED'
          )
      )
      SELECT
        ds.d::text AS date,
        COUNT(DISTINCT me.inventory_item_id)::text AS open_count
      FROM date_series ds
      LEFT JOIN missing_events me
        ON me.missing_since <= ds.d + interval '1 day'
      LEFT JOIN resolved_events re
        ON re.inventory_item_id = me.inventory_item_id
        AND re.resolved_at <= ds.d + interval '1 day'
        AND re.resolved_at >= me.missing_since
      WHERE re.inventory_item_id IS NULL
        OR re.resolved_at IS NULL
      GROUP BY ds.d
      ORDER BY ds.d
    `, [facilityId, windowDays]);

    const trend = dailyResult.rows.map(r => ({
      date: r.date,
      openCount: parseInt(r.open_count),
    }));

    // ── Currently open items ──────────────────────────────────────────
    const openResult = await query<{
      inventory_item_id: string;
      item_name: string;
      case_name: string | null;
      surgeon_name: string | null;
      missing_since: Date;
      last_touched_by: string | null;
      last_touched_at: Date | null;
    }>(`
      SELECT
        ii.id AS inventory_item_id,
        ic.name AS item_name,
        sc.procedure_name AS case_name,
        su.name AS surgeon_name,
        ms.missing_since,
        lt_user.name AS last_touched_by,
        lt.last_event_at AS last_touched_at
      FROM inventory_item ii
      JOIN item_catalog ic ON ic.id = ii.catalog_id
      LEFT JOIN surgical_case sc ON sc.id = ii.reserved_for_case_id
      LEFT JOIN app_user su ON su.id = sc.surgeon_id
      -- Most recent [MISSING] event timestamp
      LEFT JOIN LATERAL (
        SELECT MAX(ie.occurred_at) AS missing_since
        FROM inventory_event ie
        WHERE ie.inventory_item_id = ii.id
          AND ie.event_type = 'ADJUSTED'
          AND ie.notes LIKE '[MISSING]%'
      ) ms ON true
      -- Most recent event overall (last touched)
      LEFT JOIN LATERAL (
        SELECT ie.performed_by_user_id, ie.occurred_at AS last_event_at
        FROM inventory_event ie
        WHERE ie.inventory_item_id = ii.id
        ORDER BY ie.occurred_at DESC
        LIMIT 1
      ) lt ON true
      LEFT JOIN app_user lt_user ON lt_user.id = lt.performed_by_user_id
      WHERE ii.facility_id = $1
        AND ii.availability_status = 'MISSING'
      ORDER BY ms.missing_since ASC NULLS LAST
    `, [facilityId]);

    const now = new Date();
    const currentlyOpen = openResult.rows.map(r => ({
      inventoryItemId: r.inventory_item_id,
      itemName: r.item_name,
      caseName: r.case_name,
      surgeonName: r.surgeon_name,
      daysOpen: r.missing_since ? daysOpen(new Date(r.missing_since), now) : 0,
      lastTouchedBy: r.last_touched_by,
      lastTouchedAt: r.last_touched_at?.toISOString() ?? null,
    }));

    // ── Resolution data for annotations ───────────────────────────────
    const resolvedResult = await query<{
      missing_since: Date;
      resolved_at: Date;
    }>(`
      SELECT
        me.occurred_at AS missing_since,
        re.occurred_at AS resolved_at
      FROM inventory_event me
      JOIN inventory_event re
        ON re.inventory_item_id = me.inventory_item_id
        AND (
          (re.event_type = 'ADJUSTED' AND re.notes LIKE '[FOUND]%')
          OR re.event_type = 'MISSING_RESOLVED'
        )
        AND re.occurred_at >= me.occurred_at
      WHERE me.facility_id = $1
        AND me.event_type = 'ADJUSTED'
        AND me.notes LIKE '[MISSING]%'
        AND me.occurred_at >= CURRENT_DATE - $2::int
    `, [facilityId, windowDays]);

    const openItemsForAnnotation = openResult.rows
      .filter(r => r.missing_since)
      .map(r => ({ missingSince: new Date(r.missing_since) }));

    const annotations = computeAnnotations(
      trend,
      resolvedResult.rows.map(r => ({
        missingSince: new Date(r.missing_since),
        resolvedAt: new Date(r.resolved_at),
      })),
      openItemsForAnnotation,
    );

    return ok(reply, { trend, annotations, currentlyOpen });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /missing/:inventoryItemId/timeline
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { inventoryItemId: string } }>('/missing/:inventoryItemId/timeline', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{ Params: { inventoryItemId: string } }>, reply: FastifyReply) => {
    const facilityId = request.user.facilityId;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const { inventoryItemId } = request.params;
    if (!UUID_RE.test(inventoryItemId)) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid inventoryItemId format', 400);
    }

    // Verify item exists and belongs to this facility
    const itemResult = await query<{
      id: string;
      catalog_name: string;
      serial_number: string | null;
      lot_number: string | null;
      availability_status: string;
    }>(`
      SELECT ii.id, ic.name AS catalog_name, ii.serial_number, ii.lot_number,
             ii.availability_status
      FROM inventory_item ii
      JOIN item_catalog ic ON ic.id = ii.catalog_id
      WHERE ii.id = $1 AND ii.facility_id = $2
    `, [inventoryItemId, facilityId]);

    if (itemResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Item not found in this facility', 404);
    }

    const item = itemResult.rows[0];

    // Build timeline from inventory_event rows (relevant types)
    const timelineResult = await query<{
      event_type: string;
      notes: string | null;
      user_name: string;
      occurred_at: Date;
    }>(`
      SELECT
        ie.event_type,
        ie.notes,
        u.name AS user_name,
        ie.occurred_at
      FROM inventory_event ie
      JOIN app_user u ON u.id = ie.performed_by_user_id
      WHERE ie.inventory_item_id = $1
      ORDER BY ie.occurred_at ASC
    `, [inventoryItemId]);

    // Also include resolution records
    const resolutionResult = await query<{
      resolution_type: string;
      resolution_notes: string | null;
      user_name: string;
      created_at: Date;
    }>(`
      SELECT
        mir.resolution_type,
        mir.resolution_notes,
        u.name AS user_name,
        mir.created_at
      FROM missing_item_resolution mir
      JOIN app_user u ON u.id = mir.resolved_by_user_id
      WHERE mir.inventory_item_id = $1
      ORDER BY mir.created_at ASC
    `, [inventoryItemId]);

    // Merge and sort
    const timeline: Array<{ type: string; userName: string; timestamp: string; notes?: string | null }> = [];

    for (const row of timelineResult.rows) {
      let type = row.event_type;
      // Map note-tagged events to semantic types
      if (row.event_type === 'ADJUSTED' && row.notes?.startsWith('[MISSING]')) {
        type = 'MISSING_FLAGGED';
      } else if (row.event_type === 'ADJUSTED' && row.notes?.startsWith('[FOUND]')) {
        type = 'MISSING_RESOLVED';
      } else if (row.event_type === 'MISSING_RESOLVED') {
        type = 'MISSING_RESOLVED';
      }
      timeline.push({
        type,
        userName: row.user_name,
        timestamp: row.occurred_at.toISOString(),
        notes: row.notes,
      });
    }

    for (const row of resolutionResult.rows) {
      timeline.push({
        type: 'MISSING_RESOLVED',
        userName: row.user_name,
        timestamp: row.created_at.toISOString(),
        notes: row.resolution_notes,
      });
    }

    // Sort ascending by timestamp
    timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Determine if currently open
    const isOpen = item.availability_status === 'MISSING';

    // Compute daysOpen from most recent MISSING_FLAGGED event
    let itemDaysOpen = 0;
    if (isOpen) {
      const missingSinceResult = await query<{ missing_since: Date }>(`
        SELECT MAX(ie.occurred_at) AS missing_since
        FROM inventory_event ie
        WHERE ie.inventory_item_id = $1
          AND ie.event_type = 'ADJUSTED'
          AND ie.notes LIKE '[MISSING]%'
      `, [inventoryItemId]);

      if (missingSinceResult.rows[0]?.missing_since) {
        itemDaysOpen = daysOpen(new Date(missingSinceResult.rows[0].missing_since));
      }
    }

    return ok(reply, {
      item: {
        id: item.id,
        name: item.catalog_name,
        serialNumber: item.serial_number,
        lotNumber: item.lot_number,
      },
      timeline,
      isOpen,
      daysOpen: itemDaysOpen,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /missing/:inventoryItemId/resolve
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.post<{ Params: { inventoryItemId: string } }>('/missing/:inventoryItemId/resolve', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{ Params: { inventoryItemId: string } }>, reply: FastifyReply) => {
    const facilityId = request.user.facilityId;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const { inventoryItemId } = request.params;
    if (!UUID_RE.test(inventoryItemId)) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid inventoryItemId format', 400);
    }

    const body = validated(reply, ResolveSchema, request.body);
    if (!body) return;

    // Verify item exists, belongs to facility, and is currently MISSING
    const itemResult = await query<{
      id: string;
      availability_status: string;
    }>(`
      SELECT id, availability_status
      FROM inventory_item
      WHERE id = $1 AND facility_id = $2
    `, [inventoryItemId, facilityId]);

    if (itemResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Item not found in this facility', 404);
    }

    if (itemResult.rows[0].availability_status !== 'MISSING') {
      return fail(reply, 'CONFLICT', 'Item is not currently missing', 409);
    }

    // Check for existing resolution (reject double resolution)
    const existingResolution = await query<{ id: string }>(`
      SELECT mir.id
      FROM missing_item_resolution mir
      WHERE mir.inventory_item_id = $1
        AND mir.created_at > (
          SELECT MAX(ie.occurred_at)
          FROM inventory_event ie
          WHERE ie.inventory_item_id = $1
            AND ie.event_type = 'ADJUSTED'
            AND ie.notes LIKE '[MISSING]%'
        )
    `, [inventoryItemId]);

    if (existingResolution.rows.length > 0) {
      return fail(reply, 'CONFLICT', 'Item has already been resolved', 409);
    }

    // Get missing_since for daysOpen calculation
    const missingSinceResult = await query<{ missing_since: Date }>(`
      SELECT MAX(ie.occurred_at) AS missing_since
      FROM inventory_event ie
      WHERE ie.inventory_item_id = $1
        AND ie.event_type = 'ADJUSTED'
        AND ie.notes LIKE '[MISSING]%'
    `, [inventoryItemId]);

    const missingSince = missingSinceResult.rows[0]?.missing_since;
    const resolvedAt = new Date();
    const itemDaysOpen = missingSince ? daysOpen(new Date(missingSince), resolvedAt) : 0;

    // Execute resolution in transaction
    await transaction(async (client) => {
      // 1. Insert missing_item_resolution record
      await client.query(
        `INSERT INTO missing_item_resolution
           (inventory_item_id, facility_id, resolved_by_user_id, resolution_type, resolution_notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [inventoryItemId, facilityId, request.user.userId, body.resolutionType, body.notes ?? null],
      );

      // 2. Insert append-only inventory_event
      await client.query(
        `INSERT INTO inventory_event
           (facility_id, inventory_item_id, event_type, notes, performed_by_user_id, occurred_at)
         VALUES ($1, $2, 'MISSING_RESOLVED', $3, $4, $5)`,
        [
          facilityId,
          inventoryItemId,
          `[RESOLVED] ${body.resolutionType}${body.notes ? ': ' + body.notes : ''}`,
          request.user.userId,
          resolvedAt.toISOString(),
        ],
      );

      // 3. Update inventory_item availability_status back to AVAILABLE
      await client.query(
        `UPDATE inventory_item SET availability_status = 'AVAILABLE' WHERE id = $1`,
        [inventoryItemId],
      );
    });

    request.log.info(
      {
        code: 'MISSING_ITEM_RESOLVED',
        inventoryItemId,
        facilityId,
        resolvedBy: request.user.userId,
        resolutionType: body.resolutionType,
        daysOpen: itemDaysOpen,
      },
      'Missing item resolved',
    );

    return ok(reply, {
      resolved: true,
      resolvedBy: request.user.name,
      resolvedAt: resolvedAt.toISOString(),
      daysOpen: itemDaysOpen,
    });
  });
}
