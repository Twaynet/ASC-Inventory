/**
 * Financial Readiness Admin Routes (Phase 2)
 *
 * Observational financial risk tracking — admin-only, facility-scoped.
 * Does NOT block scheduling.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail, validated } from '../utils/reply.js';
import {
  FinancialDashboardQuerySchema,
  RecordClinicDeclarationSchema,
  RecordAscVerificationSchema,
  RecordOverrideSchema,
} from '../schemas/financial-readiness.schemas.js';
import * as frService from '../services/financial-readiness.service.js';

export async function financialReadinessRoutes(
  fastify: FastifyInstance,
): Promise<void> {

  // GET /dashboard — Paginated list with filters
  fastify.get('/dashboard', {
    preHandler: [requireCapabilities('FINANCIAL_READINESS_VIEW')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = validated(reply, FinancialDashboardQuerySchema, request.query) as {
      riskState?: string; clinicId?: string; surgeonId?: string;
      dateFrom?: string; dateTo?: string; limit: number; offset: number;
    } | null;
    if (!filters) return;
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Facility context required', 403);

    const result = await frService.getDashboard(facilityId, filters);
    return ok(reply, {
      rows: result.rows.map(formatDashboardRow),
      total: result.total,
    });
  });

  // GET /:requestId — Detail with full event history
  fastify.get('/:requestId', {
    preHandler: [requireCapabilities('FINANCIAL_READINESS_VIEW')],
  }, async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Facility context required', 403);

    const detail = await frService.getDetail(facilityId, request.params.requestId);
    if (!detail) return fail(reply, 'NOT_FOUND', 'Surgery request not found', 404);
    return ok(reply, formatDetail(detail));
  });

  // POST /:requestId/declare — Record clinic financial declaration
  fastify.post('/:requestId/declare', {
    preHandler: [requireCapabilities('FINANCIAL_READINESS_EDIT')],
  }, async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
    const body = validated(reply, RecordClinicDeclarationSchema, request.body);
    if (!body) return;
    const { facilityId, userId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Facility context required', 403);

    try {
      const cache = await frService.recordClinicDeclaration(
        facilityId, userId, request.params.requestId,
        body.state, body.reasonCodes, body.note,
      );
      return ok(reply, { cache: formatCacheRow(cache) }, 201);
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:requestId/verify — Record ASC financial verification
  fastify.post('/:requestId/verify', {
    preHandler: [requireCapabilities('FINANCIAL_READINESS_EDIT')],
  }, async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
    const body = validated(reply, RecordAscVerificationSchema, request.body);
    if (!body) return;
    const { facilityId, userId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Facility context required', 403);

    try {
      const cache = await frService.recordAscVerification(
        facilityId, userId, request.params.requestId,
        body.state, body.reasonCodes, body.note,
      );
      return ok(reply, { cache: formatCacheRow(cache) }, 201);
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:requestId/override — Record financial override (NONE clears)
  fastify.post('/:requestId/override', {
    preHandler: [requireCapabilities('FINANCIAL_READINESS_EDIT')],
  }, async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
    const body = validated(reply, RecordOverrideSchema, request.body);
    if (!body) return;
    const { facilityId, userId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Facility context required', 403);

    try {
      const cache = await frService.recordOverride(
        facilityId, userId, request.params.requestId,
        body.state, body.reasonCode, body.note,
      );
      return ok(reply, { cache: formatCacheRow(cache) }, 201);
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });
}

// ============================================================================
// FORMATTERS (snake_case → camelCase)
// ============================================================================

function formatDashboardRow(row: frService.DashboardRow) {
  return {
    surgeryRequestId: row.surgery_request_id,
    procedureName: row.procedure_name,
    surgeonName: row.surgeon_name,
    clinicName: row.clinic_name,
    patientDisplayName: row.patient_display_name,
    scheduledDate: row.scheduled_date,
    requestStatus: row.request_status,
    riskState: row.risk_state,
    clinicState: row.clinic_state,
    ascState: row.asc_state,
    overrideState: row.override_state,
    recomputedAt: row.recomputed_at,
  };
}

function formatCacheRow(row: frService.FinancialReadinessCacheRow) {
  return {
    surgeryRequestId: row.surgery_request_id,
    riskState: row.risk_state,
    clinicState: row.clinic_state,
    ascState: row.asc_state,
    overrideState: row.override_state,
    recomputedAt: row.recomputed_at,
  };
}

function formatDetail(detail: frService.DetailResult) {
  return {
    request: {
      id: detail.request.id,
      procedureName: detail.request.procedure_name,
      surgeonName: detail.request.surgeon_name,
      clinicName: detail.request.clinic_name,
      patientDisplayName: detail.request.patient_display_name,
      scheduledDate: detail.request.scheduled_date,
      status: detail.request.status,
    },
    cache: {
      riskState: detail.cache.risk_state,
      clinicState: detail.cache.clinic_state,
      ascState: detail.cache.asc_state,
      overrideState: detail.cache.override_state,
      recomputedAt: detail.cache.recomputed_at,
    },
    declarations: detail.declarations.map(d => ({
      id: d.id,
      state: d.state,
      reasonCodes: d.reason_codes,
      note: d.note,
      recordedByName: d.recorded_by_name ?? null,
      createdAt: d.created_at,
    })),
    verifications: detail.verifications.map(v => ({
      id: v.id,
      state: v.state,
      reasonCodes: v.reason_codes,
      note: v.note,
      verifiedByName: v.verified_by_name ?? null,
      createdAt: v.created_at,
    })),
    overrides: detail.overrides.map(o => ({
      id: o.id,
      state: o.state,
      reasonCode: o.reason_code,
      note: o.note,
      overriddenByName: o.overridden_by_name ?? null,
      createdAt: o.created_at,
    })),
  };
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

function handleServiceError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as Error & { statusCode?: number; code?: string };
  if (e.statusCode === 404) return fail(reply, 'NOT_FOUND', e.message, 404);
  if (e.statusCode === 409) return fail(reply, e.code || 'CONFLICT', e.message, 409);
  if (e.statusCode === 422) return fail(reply, e.code || 'UNPROCESSABLE_ENTITY', e.message, 422);
  throw err;
}
