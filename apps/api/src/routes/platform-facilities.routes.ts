/**
 * Platform Facility Management Routes
 *
 * PLATFORM_ADMIN-only endpoints for creating and inspecting facilities.
 * All routes are mounted under /api/platform/facilities.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin } from '../plugins/auth.js';
import { transaction, query } from '../db/index.js';
import { ok, fail, validated } from '../utils/reply.js';
import { assertNotReservedFacilityKey } from '../utils/facility-key.js';
import {
  createFacilityBootstrap,
  getFacilityBootstrapStatus,
} from '../services/facility-bootstrap.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateFacilitySchema = z.object({
  facilityKey: z
    .string()
    .min(1, 'facilityKey is required')
    .max(20, 'facilityKey must be 20 characters or fewer')
    .regex(/^[A-Z0-9_]+$/, 'facilityKey must be uppercase alphanumeric with underscores'),
  name: z.string().min(1, 'name is required').max(255),
  timezone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  initialAdmin: z.object({
    username: z.string().min(3, 'username must be at least 3 characters').max(100),
    password: z.string().min(8, 'password must be at least 8 characters'),
    name: z.string().min(1, 'admin name is required').max(255),
    email: z.string().email().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function platformFacilitiesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/platform/facilities
   *
   * Create a new facility with baseline tenant bootstrap.
   * Auth: PLATFORM_ADMIN only.
   */
  fastify.post('/', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply) => {
    const body = validated(reply, CreateFacilitySchema, request.body);
    if (!body) return;

    // Reject reserved facility keys (PLATFORM)
    try {
      assertNotReservedFacilityKey(body.facilityKey);
    } catch (err: any) {
      return fail(reply, 'VALIDATION_ERROR', err.message, 400);
    }

    // Check for duplicate facility_key before entering transaction
    const existing = await query(
      'SELECT id FROM facility WHERE facility_key = $1',
      [body.facilityKey],
    );
    if (existing.rows.length > 0) {
      return fail(
        reply,
        'CONFLICT',
        `Facility with key "${body.facilityKey}" already exists.`,
        409,
      );
    }

    // Create facility + all baseline rows in a single transaction
    try {
      const result = await transaction(async (client) => {
        return createFacilityBootstrap(client, {
          facilityKey: body.facilityKey,
          name: body.name,
          timezone: body.timezone,
          address: body.address,
          initialAdmin: {
            username: body.initialAdmin.username,
            password: body.initialAdmin.password,
            name: body.initialAdmin.name,
            email: body.initialAdmin.email,
          },
        });
      });

      request.log.info(
        {
          code: 'FACILITY_CREATED',
          facilityId: result.facility.id,
          facilityKey: result.facility.facilityKey,
          adminUserId: result.adminUser.id,
        },
        'New facility created via platform bootstrap',
      );

      return ok(reply, result, 201);
    } catch (err: any) {
      // Handle unique violation on facility_key (race condition with concurrent request)
      if (err.code === '23505' && err.constraint?.includes('facility_key')) {
        return fail(
          reply,
          'CONFLICT',
          `Facility with key "${body.facilityKey}" already exists.`,
          409,
        );
      }
      // Handle unique violation on admin username within the facility
      if (err.code === '23505') {
        return fail(
          reply,
          'CONFLICT',
          `Duplicate value conflict: ${err.detail || 'unique constraint violated'}`,
          409,
        );
      }
      throw err;
    }
  });

  /**
   * GET /api/platform/facilities/:facilityId/bootstrap-status
   *
   * Returns a quick checklist of baseline rows present for a facility.
   * Helps debug onboarding without UI.
   * Auth: PLATFORM_ADMIN only.
   */
  fastify.get('/:facilityId/bootstrap-status', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest<{ Params: { facilityId: string } }>, reply) => {
    const { facilityId } = request.params;

    // Basic UUID format check
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facilityId)) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid facilityId format', 400);
    }

    const status = await getFacilityBootstrapStatus({ query }, facilityId);
    if (!status) {
      return fail(reply, 'NOT_FOUND', `Facility ${facilityId} not found`, 404);
    }

    return ok(reply, status);
  });
}
