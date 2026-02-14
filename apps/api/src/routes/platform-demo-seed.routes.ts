/**
 * Platform Demo Seed Routes
 *
 * POST /api/platform/facilities/:facilityId/demo-seed
 *
 * Generates executive-grade demo data for a single facility.
 * PLATFORM_ADMIN only. Transactional. Idempotent-aware.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin } from '../plugins/auth.js';
import { transaction, query } from '../db/index.js';
import { ok, fail, validated } from '../utils/reply.js';
import { executeDemoSeed, type DemoSeedOptions } from '../services/demo-seed.service.js';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const DemoSeedSchema = z.object({
  profile: z.literal('ORTHO_ASC_EXEC_DEMO').default('ORTHO_ASC_EXEC_DEMO'),
  options: z.object({
    surgeonCount: z.number().int().min(2).max(6).default(4),
    caseCount: z.number().int().min(6).max(60).default(40),
    inventoryScale: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']).default('MEDIUM'),
    includeFinancialOverrides: z.boolean().default(true),
    includeMissingItems: z.boolean().default(true),
  }).default({}),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function platformDemoSeedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { facilityId: string } }>(
    '/:facilityId/demo-seed',
    {
      preHandler: [requirePlatformAdmin()],
    },
    async (request: FastifyRequest<{ Params: { facilityId: string } }>, reply) => {
      const { facilityId } = request.params;

      // UUID format check
      if (!UUID_RE.test(facilityId)) {
        return fail(reply, 'VALIDATION_ERROR', 'Invalid facilityId format', 400);
      }

      // Validate body
      const body = validated(reply, DemoSeedSchema, request.body ?? {});
      if (!body) return;

      // Verify facility exists (pre-transaction check)
      const facilityCheck = await query(
        'SELECT id, name FROM facility WHERE id = $1',
        [facilityId],
      );
      if (facilityCheck.rows.length === 0) {
        return fail(reply, 'NOT_FOUND', `Facility ${facilityId} not found`, 404);
      }

      // Run seed in transaction
      try {
        const result = await transaction(async (client) => {
          return executeDemoSeed(client, facilityId, body.options as DemoSeedOptions);
        });

        request.log.info({
          code: 'DEMO_SEED_APPLIED',
          facilityId,
          profile: body.profile,
          ...result.summary,
        }, 'Demo seed applied to facility');

        return ok(reply, result, 201);
      } catch (err: any) {
        if (err.message?.includes('already applied') || err.message?.includes('already seeded')) {
          return fail(reply, 'CONFLICT', err.message, 409);
        }
        if (err.message?.includes('not found') || err.message?.includes('no ASC organization') || err.message?.includes('no rooms')) {
          return fail(reply, 'PRECONDITION_FAILED', err.message, 422);
        }
        throw err;
      }
    },
  );
}
