/**
 * Platform Control Plane Routes
 *
 * LAW §2.3: Separation is mandatory at routing, API, authorization layers.
 * LAW §2.4: Tenant users must never access Control Plane routes.
 *
 * All routes in this file require PLATFORM_ADMIN role.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { requirePlatformAdmin } from '../plugins/auth.js';
import { platformConfigRoutes } from './platform-config.routes.js';
import { platformFacilityViewRoutes } from './platform-facility-view.routes.js';
import { platformFacilitiesRoutes } from './platform-facilities.routes.js';
import { query } from '../db/index.js';
import { ok } from '../utils/reply.js';

export async function platformRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/platform/health
   *
   * Health check endpoint for Control Plane.
   * Used to verify PLATFORM_ADMIN auth is working correctly.
   */
  fastify.get('/health', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      plane: 'control',
    });
  });

  /**
   * GET /api/platform/facilities
   *
   * List all facilities for the Platform Admin UI facility selector.
   * LAW §3.3: Explicit targetFacilityId required for cross-tenant operations.
   */
  fastify.get('/facilities', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply) => {
    const result = await query('SELECT id, name FROM facility ORDER BY name');
    return ok(reply, {
      facilities: result.rows.map(row => ({
        id: row.id,
        name: row.name,
      })),
    });
  });

  // Mount config routes under /api/platform/config
  // LAW §5: Configuration Governance
  await fastify.register(platformConfigRoutes, { prefix: '/config' });

  // Mount facility management routes (POST create, bootstrap-status)
  // under /api/platform/facilities (shares prefix with GET list above)
  await fastify.register(platformFacilitiesRoutes, { prefix: '/facilities' });

  // Mount facility-view routes under /api/platform/facility-view
  // Read-only cross-facility visibility for PLATFORM_ADMIN
  await fastify.register(platformFacilityViewRoutes, { prefix: '/facility-view' });
}
