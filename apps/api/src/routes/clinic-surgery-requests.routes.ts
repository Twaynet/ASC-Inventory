/**
 * Clinic Surgery Request Routes (Phase 1 Readiness)
 *
 * Authenticated via X-Clinic-Key header. Clinic can only access its own requests.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireClinicAuth } from '../plugins/clinic-auth.js';
import { ok, fail, validated } from '../utils/reply.js';
import {
  ClinicSubmitRequestSchema,
  ClinicListQuerySchema,
} from '../schemas/surgery-request.schemas.js';
import * as srService from '../services/surgery-request.service.js';
import type { SubmitRequestBody } from '../services/surgery-request.service.js';

export async function clinicSurgeryRequestRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // All routes in this plugin require clinic auth
  fastify.addHook('preHandler', requireClinicAuth);

  // POST / — Submit or resubmit a surgery request
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validated(reply, ClinicSubmitRequestSchema, request.body) as SubmitRequestBody | null;
    if (!body) return;

    const clinicId = request.clinicContext!.clinicId;

    try {
      const result = await srService.submitOrResubmit(clinicId, body);

      if (result.created) {
        return ok(reply, { request: formatRequest(result.request) }, 201);
      }
      if (result.resubmitted) {
        return ok(reply, { request: formatRequest(result.request), resubmitted: true });
      }
      // Idempotent return of existing
      return ok(reply, { request: formatRequest(result.request), existing: true });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // GET / — List clinic's own requests
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = validated(reply, ClinicListQuerySchema, request.query) as { status?: string; since?: string; limit: number } | null;
    if (!filters) return;

    const clinicId = request.clinicContext!.clinicId;
    const rows = await srService.findByClinic(clinicId, filters);
    return ok(reply, { requests: rows.map(formatRequest) });
  });

  // GET /:id — Get single request (clinic scope)
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const clinicId = request.clinicContext!.clinicId;
    const row = await srService.findById(request.params.id, { clinicId });

    if (!row) {
      return fail(reply, 'NOT_FOUND', 'Surgery request not found', 404);
    }
    return ok(reply, { request: formatRequest(row) });
  });

  // POST /:id/withdraw — Withdraw a request
  fastify.post('/:id/withdraw', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const clinicId = request.clinicContext!.clinicId;

    try {
      const updated = await srService.withdraw(clinicId, request.params.id);
      return ok(reply, { request: formatRequest(updated) });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRequest(row: srService.SurgeryRequestRow) {
  return {
    id: row.id,
    targetFacilityId: row.target_facility_id,
    sourceClinicId: row.source_clinic_id,
    sourceRequestId: row.source_request_id,
    status: row.status,
    procedureName: row.procedure_name,
    surgeonId: row.surgeon_id,
    surgeonName: row.surgeon_name ?? null,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    patientRefId: row.patient_ref_id,
    patientDisplayName: row.patient_display_name ?? null,
    patientClinicKey: row.patient_clinic_key ?? null,
    patientBirthYear: row.patient_birth_year ?? null,
    clinicName: row.clinic_name ?? null,
    submittedAt: row.submitted_at,
    lastSubmittedAt: row.last_submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function handleServiceError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as Error & { statusCode?: number; code?: string };
  if (e.statusCode === 409) {
    return fail(reply, e.code || 'CONFLICT', e.message, 409);
  }
  if (e.statusCode === 404) {
    return fail(reply, 'NOT_FOUND', e.message, 404);
  }
  throw err;
}
