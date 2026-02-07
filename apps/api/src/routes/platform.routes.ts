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

  // Mount config routes under /api/platform/config
  // LAW §5: Configuration Governance
  await fastify.register(platformConfigRoutes, { prefix: '/config' });
}
