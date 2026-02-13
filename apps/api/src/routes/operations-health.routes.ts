/**
 * Operations Health Summary — read-only aggregated metrics.
 *
 * GET /api/operations/health-summary
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { ok } from '../utils/reply.js';
import { contract } from '@asc/contract';
import { registerContractRoute } from '../lib/contract-route.js';

export async function operationsHealthRoutes(fastify: FastifyInstance): Promise<void> {
  const PREFIX = '/operations';

  registerContractRoute(fastify, contract.operations.healthSummary, PREFIX, {
    preHandler: [fastify.authenticate, requireCapabilities('INVENTORY_MANAGE')],
    handler: async (request, reply) => {
      const { facilityId } = request.user;
      const q = request.contractData.query as { start?: string; end?: string };

      // Default date range: last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const endDate = q.end ? new Date(q.end) : now;
      const startDate = q.start ? new Date(q.start) : thirtyDaysAgo;

      const endISO = endDate.toISOString();
      const startISO = startDate.toISOString();

      // 7-day window for device metrics
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysISO = sevenDaysAgo.toISOString();

      // ── MISSING HEALTH ──────────────────────────────────────────────
      // Aging thresholds use missingSince (most recent [MISSING] event),
      // NOT inventory_item.updated_at — consistent with open-missing-aging endpoint.
      const missingResult = await query<{
        open_count: string;
        over_7_days: string;
        over_30_days: string;
      }>(`
        SELECT
          COUNT(*) AS open_count,
          COUNT(*) FILTER (
            WHERE ms.missing_since IS NOT NULL
            AND ms.missing_since < NOW() - INTERVAL '7 days'
          ) AS over_7_days,
          COUNT(*) FILTER (
            WHERE ms.missing_since IS NOT NULL
            AND ms.missing_since < NOW() - INTERVAL '30 days'
          ) AS over_30_days
        FROM inventory_item ii
        LEFT JOIN LATERAL (
          SELECT MAX(ie.occurred_at) AS missing_since
          FROM inventory_event ie
          WHERE ie.inventory_item_id = ii.id
            AND ie.event_type = 'ADJUSTED'
            AND ie.notes LIKE '[MISSING]%'
        ) ms ON true
        WHERE ii.facility_id = $1
          AND ii.availability_status = 'MISSING'
      `, [facilityId]);

      const resolutionResult = await query<{
        marked_missing: string;
        resolved: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE ie.notes LIKE '[MISSING]%') AS marked_missing,
          COUNT(*) FILTER (WHERE ie.notes LIKE '[FOUND]%') AS resolved
        FROM inventory_event ie
        WHERE ie.facility_id = $1
          AND ie.event_type = 'ADJUSTED'
          AND ie.occurred_at >= $2
          AND ie.occurred_at <= $3
          AND (ie.notes LIKE '[MISSING]%' OR ie.notes LIKE '[FOUND]%')
      `, [facilityId, startISO, endISO]);

      const missingRow = missingResult.rows[0];
      const resRow = resolutionResult.rows[0];
      const markedMissing = parseInt(resRow?.marked_missing || '0');
      const resolved = parseInt(resRow?.resolved || '0');
      const resolutionRate30d = markedMissing > 0
        ? Math.round((resolved / markedMissing) * 100)
        : 100;

      // ── FINANCIAL INTEGRITY ─────────────────────────────────────────
      const financialResult = await query<{
        override_count: string;
        gratis_count: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE cost_override_cents IS NOT NULL) AS override_count,
          COUNT(*) FILTER (WHERE is_gratis = true) AS gratis_count
        FROM inventory_event
        WHERE facility_id = $1
          AND occurred_at >= $2
          AND occurred_at <= $3
      `, [facilityId, startISO, endISO]);

      const finRow = financialResult.rows[0];

      // ── DEVICE STABILITY ────────────────────────────────────────────
      const deviceResult = await query<{
        total_events: string;
        error_events: string;
      }>(`
        SELECT
          COUNT(*) AS total_events,
          COUNT(*) FILTER (WHERE processing_error IS NOT NULL) AS error_events
        FROM device_event
        WHERE facility_id = $1
          AND occurred_at >= $2
      `, [facilityId, sevenDaysISO]);

      const devRow = deviceResult.rows[0];
      const totalEvents7d = parseInt(devRow?.total_events || '0');
      const errorEvents7d = parseInt(devRow?.error_events || '0');
      const errorRate7d = totalEvents7d > 0
        ? Math.round((errorEvents7d / totalEvents7d) * 10000) / 100
        : 0;

      // ── CASE THROUGHPUT ─────────────────────────────────────────────
      // Terminal statuses from packages/domain/src/types.ts CaseStatus enum:
      //   completed = 'COMPLETED'
      //   canceled  = 'CANCELLED' | 'REJECTED'
      // (No WITHDRAWN in case_status — that's surgery_request_status only)
      const caseResult = await query<{
        completed: string;
        canceled: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
          COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'REJECTED')) AS canceled
        FROM surgical_case
        WHERE facility_id = $1
          AND updated_at >= $2
          AND updated_at <= $3
      `, [facilityId, startISO, endISO]);

      const caseRow = caseResult.rows[0];

      return ok(reply, {
        missing: {
          openCount: parseInt(missingRow?.open_count || '0'),
          over7Days: parseInt(missingRow?.over_7_days || '0'),
          over30Days: parseInt(missingRow?.over_30_days || '0'),
          resolutionRate30d,
        },
        financial: {
          overrideCount30d: parseInt(finRow?.override_count || '0'),
          gratisCount30d: parseInt(finRow?.gratis_count || '0'),
        },
        devices: {
          totalEvents7d,
          errorEvents7d,
          errorRate7d,
        },
        cases: {
          completed30d: parseInt(caseRow?.completed || '0'),
          canceled30d: parseInt(caseRow?.canceled || '0'),
        },
      });
    },
  });
}
