/**
 * Platform Configuration Routes
 *
 * LAW §2.3: Separation is mandatory at routing layer
 * LAW §3.3: Any Control Plane action affecting a tenant must explicitly declare targetFacilityId
 * LAW §5: Configuration Governance
 * LAW §11.1: All Control Plane mutations emit immutable audit events
 *
 * All routes require PLATFORM_ADMIN role.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin, getUserRoles } from '../plugins/auth.js';
import { ok, fail, validated } from '../utils/reply.js';
import {
  getAllConfigKeys,
  getConfigKey,
  getEffectiveConfig,
  getPlatformConfigValue,
  getFacilityOverrideValue,
  setPlatformConfig,
  setFacilityOverride,
  clearFacilityOverride,
  getAuditLog,
  type AuditContext,
} from '../services/config.service.js';

// ============================================================================
// Request Schemas
// ============================================================================

const SetPlatformConfigSchema = z.object({
  value: z.string().nullable(),
  reason: z.string().optional(),
  note: z.string().optional(),
  effectiveAt: z.string().datetime().optional(),
});

const SetFacilityOverrideSchema = z.object({
  value: z.string().nullable(),
  reason: z.string().optional(),
  note: z.string().optional(),
  effectiveAt: z.string().datetime().optional(),
});

const ClearFacilityOverrideSchema = z.object({
  reason: z.string().min(1, 'Reason is required to clear override'),
});

// ============================================================================
// Helper: Build audit context from request
// ============================================================================

function buildAuditContext(request: FastifyRequest): AuditContext {
  return {
    actorUserId: request.user.userId,
    actorName: request.user.name,
    actorRoles: getUserRoles(request.user),
    requestId: request.requestId,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] || undefined,
  };
}

// ============================================================================
// Routes
// ============================================================================

export async function platformConfigRoutes(fastify: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────────────────────────────────
  // GET /keys - List all config keys (registry definitions)
  // ─────────────────────────────────────────────────────────────────────────

  fastify.get('/keys', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const keys = await getAllConfigKeys();

    return ok(reply, {
      keys: keys.map(k => ({
        id: k.id,
        key: k.key,
        valueType: k.valueType,
        defaultValue: k.isSensitive ? '[REDACTED]' : k.defaultValue,
        allowFacilityOverride: k.allowFacilityOverride,
        riskClass: k.riskClass,
        displayName: k.displayName,
        description: k.description,
        category: k.category,
        isSensitive: k.isSensitive,
      })),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /keys/:key - Get single config key with current values
  // ─────────────────────────────────────────────────────────────────────────

  fastify.get<{ Params: { key: string } }>('/keys/:key', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const { key } = request.params;

    const configKey = await getConfigKey(key);
    if (!configKey) {
      return fail(reply, 'NOT_FOUND', `Config key not found: ${key}`, 404);
    }

    const platformValue = await getPlatformConfigValue(key);

    return ok(reply, {
      key: {
        id: configKey.id,
        key: configKey.key,
        valueType: configKey.valueType,
        defaultValue: configKey.isSensitive ? '[REDACTED]' : configKey.defaultValue,
        allowFacilityOverride: configKey.allowFacilityOverride,
        riskClass: configKey.riskClass,
        displayName: configKey.displayName,
        description: configKey.description,
        category: configKey.category,
        isSensitive: configKey.isSensitive,
      },
      platformValue: platformValue ? {
        value: configKey.isSensitive ? '[REDACTED]' : platformValue.value,
        version: platformValue.version,
        effectiveAt: platformValue.effectiveAt,
      } : null,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /keys/:key - Set platform config value
  // ─────────────────────────────────────────────────────────────────────────

  fastify.patch<{ Params: { key: string } }>('/keys/:key', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const { key } = request.params;

    const body = validated(reply, SetPlatformConfigSchema, request.body);
    if (!body) return;

    const configKey = await getConfigKey(key);
    if (!configKey) {
      return fail(reply, 'NOT_FOUND', `Config key not found: ${key}`, 404);
    }

    // Validate risk class requirements (LAW §4.3)
    if (['MEDIUM', 'HIGH', 'CRITICAL'].includes(configKey.riskClass) && !body.reason) {
      return fail(reply, 'VALIDATION_ERROR',
        `Config key ${key} has risk class ${configKey.riskClass} and requires a reason`, 400);
    }

    try {
      const result = await setPlatformConfig(key, {
        value: body.value,
        reason: body.reason,
        note: body.note,
        effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
      }, buildAuditContext(request));

      request.log.info({
        code: 'CONFIG_PLATFORM_SET',
        key,
        version: result.version,
        actorUserId: request.user.userId,
      }, 'Platform config value set');

      return ok(reply, { version: result.version });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set config';
      return fail(reply, 'CONFIG_ERROR', message, 400);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /facilities/:facilityId/overrides - List facility overrides
  // LAW §3.3: Explicit targetFacilityId required
  // ─────────────────────────────────────────────────────────────────────────

  fastify.get<{ Params: { facilityId: string } }>('/facilities/:facilityId/overrides', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const { facilityId } = request.params;

    // Get all keys and their effective values for this facility
    const keys = await getAllConfigKeys();
    const overrides: Array<{
      key: string;
      displayName: string;
      platformValue: string | null;
      facilityValue: string | null;
      facilityVersion: number | null;
      effectiveValue: string | null;
      effectiveSource: string;
      allowOverride: boolean;
      isSensitive: boolean;
    }> = [];

    for (const k of keys) {
      if (!k.allowFacilityOverride) continue;

      const effective = await getEffectiveConfig(k.key, facilityId);
      const facilityOverride = await getFacilityOverrideValue(k.key, facilityId);
      const platformValue = await getPlatformConfigValue(k.key);

      overrides.push({
        key: k.key,
        displayName: k.displayName,
        platformValue: k.isSensitive ? '[REDACTED]' : (platformValue?.value ?? k.defaultValue),
        facilityValue: k.isSensitive ? (facilityOverride ? '[REDACTED]' : null) : (facilityOverride?.value ?? null),
        facilityVersion: facilityOverride?.version ?? null,
        effectiveValue: k.isSensitive ? '[REDACTED]' : (effective?.value ?? null),
        effectiveSource: effective?.source ?? 'CODE_FALLBACK',
        allowOverride: k.allowFacilityOverride,
        isSensitive: k.isSensitive,
      });
    }

    return ok(reply, { facilityId, overrides });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /facilities/:facilityId/overrides/:key - Set facility override
  // LAW §3.3: Explicit targetFacilityId required
  // ─────────────────────────────────────────────────────────────────────────

  fastify.patch<{ Params: { facilityId: string; key: string } }>(
    '/facilities/:facilityId/overrides/:key',
    { preHandler: [requirePlatformAdmin()] },
    async (request, reply) => {
      const { facilityId, key } = request.params;

      const body = validated(reply, SetFacilityOverrideSchema, request.body);
      if (!body) return;

      const configKey = await getConfigKey(key);
      if (!configKey) {
        return fail(reply, 'NOT_FOUND', `Config key not found: ${key}`, 404);
      }

      if (!configKey.allowFacilityOverride) {
        return fail(reply, 'FORBIDDEN', `Config key ${key} does not allow facility override`, 403);
      }

      // Validate risk class requirements
      if (['MEDIUM', 'HIGH', 'CRITICAL'].includes(configKey.riskClass) && !body.reason) {
        return fail(reply, 'VALIDATION_ERROR',
          `Config key ${key} has risk class ${configKey.riskClass} and requires a reason`, 400);
      }

      try {
        const result = await setFacilityOverride(key, facilityId, {
          value: body.value,
          reason: body.reason,
          note: body.note,
          effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
        }, buildAuditContext(request));

        request.log.info({
          code: 'CONFIG_FACILITY_OVERRIDE_SET',
          key,
          facilityId,
          version: result.version,
          actorUserId: request.user.userId,
        }, 'Facility config override set');

        return ok(reply, { version: result.version });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to set override';
        return fail(reply, 'CONFIG_ERROR', message, 400);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /facilities/:facilityId/overrides/:key - Clear facility override
  // ─────────────────────────────────────────────────────────────────────────

  fastify.delete<{ Params: { facilityId: string; key: string } }>(
    '/facilities/:facilityId/overrides/:key',
    { preHandler: [requirePlatformAdmin()] },
    async (request, reply) => {
      const { facilityId, key } = request.params;

      const body = validated(reply, ClearFacilityOverrideSchema, request.body);
      if (!body) return;

      try {
        await clearFacilityOverride(key, facilityId, body.reason, buildAuditContext(request));

        request.log.info({
          code: 'CONFIG_FACILITY_OVERRIDE_CLEARED',
          key,
          facilityId,
          actorUserId: request.user.userId,
        }, 'Facility config override cleared');

        return ok(reply, { cleared: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to clear override';
        return fail(reply, 'CONFIG_ERROR', message, 400);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /audit - Get config audit log
  // ─────────────────────────────────────────────────────────────────────────

  fastify.get<{
    Querystring: { key?: string; facilityId?: string; limit?: string; offset?: string }
  }>('/audit', {
    preHandler: [requirePlatformAdmin()],
  }, async (request, reply) => {
    const { key, facilityId, limit, offset } = request.query;

    const entries = await getAuditLog({
      key,
      facilityId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return ok(reply, { entries });
  });
}
