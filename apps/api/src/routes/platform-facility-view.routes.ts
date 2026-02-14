/**
 * Platform Facility View Routes — READ-ONLY cross-facility visibility.
 *
 * All endpoints require PLATFORM_ADMIN role + a valid facilityId UUID query param.
 * Each handler delegates to extracted pure query functions from tenant route files.
 *
 * Mounted at: /api/platform/facility-view
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requirePlatformAdmin } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';
import { queryHealthSummary } from './operations-health.routes.js';
import {
  queryMissingAnalytics,
  queryMissingEvents,
  queryOpenMissingAging,
  queryDeviceEvents,
  queryInventoryEventsFinancial,
} from './inventory.routes.js';

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractFacilityId(
  request: FastifyRequest<{ Querystring: { facilityId?: string } }>,
  reply: FastifyReply,
): string | null {
  const { facilityId } = request.query;
  if (!facilityId || !UUID_RE.test(facilityId)) {
    fail(reply, 'VALIDATION_ERROR', 'facilityId query parameter is required and must be a valid UUID', 400);
    return null;
  }
  return facilityId;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function platformFacilityViewRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/platform/facility-view/health-summary
   */
  fastify.get<{
    Querystring: { facilityId?: string; start?: string; end?: string };
  }>('/health-summary', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const { start, end } = request.query;
    const result = await queryHealthSummary(facilityId, { start, end });
    return ok(reply, result);
  });

  /**
   * GET /api/platform/facility-view/missing-analytics
   */
  fastify.get<{
    Querystring: {
      facilityId?: string;
      start?: string;
      end?: string;
      groupBy?: string;
      resolution?: string;
    };
  }>('/missing-analytics', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const { start, end, groupBy, resolution } = request.query;
    if (!start || !end || !groupBy) {
      return fail(reply, 'VALIDATION_ERROR', 'start, end, and groupBy are required', 400);
    }

    const result = await queryMissingAnalytics(facilityId, {
      start,
      end,
      groupBy: groupBy as 'day' | 'location' | 'catalog' | 'surgeon' | 'staff',
      resolution: (resolution as 'MISSING' | 'FOUND' | 'BOTH') || 'BOTH',
    });
    return ok(reply, result);
  });

  /**
   * GET /api/platform/facility-view/missing-events
   */
  fastify.get<{
    Querystring: {
      facilityId?: string;
      start?: string;
      end?: string;
      resolution?: string;
      groupBy?: string;
      groupKey?: string;
      date?: string;
      limit?: string;
      offset?: string;
    };
  }>('/missing-events', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const { start, end, resolution, groupBy, groupKey, date, limit: limitStr, offset: offsetStr } = request.query;
    if (!start || !end || !groupBy) {
      return fail(reply, 'VALIDATION_ERROR', 'start, end, and groupBy are required', 400);
    }
    if (groupBy === 'day' && !date) {
      return fail(reply, 'VALIDATION_ERROR', 'date is required when groupBy=day', 400);
    }
    if (groupBy !== 'day' && !groupKey) {
      return fail(reply, 'VALIDATION_ERROR', 'groupKey is required when groupBy is not day', 400);
    }

    const result = await queryMissingEvents(facilityId, {
      start,
      end,
      resolution: (resolution as 'MISSING' | 'FOUND' | 'BOTH') || 'BOTH',
      groupBy: groupBy as 'day' | 'location' | 'catalog' | 'surgeon' | 'staff',
      groupKey,
      date,
      limit: Math.min(Math.max(parseInt(limitStr || '100', 10) || 100, 1), 500),
      offset: Math.max(parseInt(offsetStr || '0', 10) || 0, 0),
    });
    return ok(reply, result);
  });

  /**
   * GET /api/platform/facility-view/open-missing-aging
   */
  fastify.get<{
    Querystring: { facilityId?: string };
  }>('/open-missing-aging', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const result = await queryOpenMissingAging(facilityId);
    return ok(reply, result);
  });

  /**
   * GET /api/platform/facility-view/device-events
   */
  fastify.get<{
    Querystring: {
      facilityId?: string;
      deviceId?: string;
      processed?: string;
      hasError?: string;
      start?: string;
      end?: string;
      q?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/device-events', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const { deviceId, processed, hasError, start, end, q, limit: limitStr, cursor } = request.query;
    const result = await queryDeviceEvents(facilityId, {
      deviceId,
      processed: processed === 'true' ? true : processed === 'false' ? false : undefined,
      hasError: hasError === 'true' ? true : hasError === 'false' ? false : undefined,
      start,
      end,
      q,
      limit: parseInt(limitStr || '50', 10) || 50,
      cursor,
    });
    return ok(reply, result);
  });

  /**
   * GET /api/platform/facility-view/events
   */
  fastify.get<{
    Querystring: {
      facilityId?: string;
      financial?: string;
      eventType?: string;
      caseId?: string;
      vendorId?: string;
      gratis?: string;
      start?: string;
      end?: string;
      limit?: string;
      offset?: string;
    };
  }>('/events', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const facilityId = extractFacilityId(request, reply);
    if (!facilityId) return;

    const { financial, eventType, caseId, vendorId, gratis, start, end, limit: limitStr, offset: offsetStr } = request.query;
    const result = await queryInventoryEventsFinancial(facilityId, {
      financial: financial === 'true',
      eventType,
      caseId,
      vendorId,
      gratis: gratis === 'true' ? true : gratis === 'false' ? false : undefined,
      start,
      end,
      limit: parseInt(limitStr || '50', 10) || 50,
      offset: parseInt(offsetStr || '0', 10) || 0,
    });
    return ok(reply, result);
  });
}
