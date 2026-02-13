/**
 * Admin Surgery Request Routes (Phase 1 Readiness)
 *
 * ASC admin endpoints for reviewing, accepting, returning, rejecting,
 * and converting surgery requests. JWT auth + capability-based access.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail, validated } from '../utils/reply.js';
import {
  AdminReturnRequestSchema,
  AdminAcceptRequestSchema,
  AdminRejectRequestSchema,
  AdminListQuerySchema,
} from '../schemas/surgery-request.schemas.js';
import * as srService from '../services/surgery-request.service.js';

export async function adminSurgeryRequestRoutes(
  fastify: FastifyInstance,
): Promise<void> {

  // GET / — List surgery requests for this facility
  fastify.get('/', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = validated(reply, AdminListQuerySchema, request.query) as {
      status?: string; clinicId?: string; surgeonId?: string;
      dateFrom?: string; dateTo?: string; limit: number; offset: number;
    } | null;
    if (!filters) return;

    const { facilityId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const result = await srService.findByFacility(facilityId, filters);
    return ok(reply, {
      requests: result.rows.map(formatRequest),
      total: result.total,
    });
  });

  // GET /clinics — List clinics that have sent requests to this facility
  fastify.get('/clinics', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }
    const clinics = await srService.listClinics(facilityId);
    return ok(reply, { clinics });
  });

  // GET /:id — Detailed view of a single surgery request
  fastify.get('/:id', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const row = await srService.findById(request.params.id, { facilityId });
    if (!row) {
      return fail(reply, 'NOT_FOUND', 'Surgery request not found', 404);
    }

    // Load related data
    const [submissions, auditEvents, checklistInstances, conversion] = await Promise.all([
      srService.getSubmissions(row.id),
      srService.getAuditEvents(row.id),
      srService.getChecklistInstances(row.id),
      srService.getConversion(row.id),
    ]);

    // Load responses for the latest checklist instance
    let checklistResponses: srService.ChecklistResponseRow[] = [];
    if (checklistInstances.length > 0) {
      const latestInstance = checklistInstances[checklistInstances.length - 1];
      checklistResponses = await srService.getChecklistResponses(latestInstance.id);
    }

    return ok(reply, {
      request: formatRequest(row),
      submissions: submissions.map(formatSubmission),
      auditEvents: auditEvents.map(formatAuditEvent),
      checklistInstances: checklistInstances.map(formatChecklistInstance),
      checklistResponses: checklistResponses.map(formatChecklistResponse),
      conversion: conversion ? {
        surgicalCaseId: conversion.surgical_case_id,
        convertedAt: conversion.converted_at,
        convertedByUserId: conversion.converted_by_user_id,
      } : null,
    });
  });

  // POST /:id/return — Return request to clinic
  fastify.post('/:id/return', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = validated(reply, AdminReturnRequestSchema, request.body) as { reasonCode: string; note?: string } | null;
    if (!body) return;

    const { facilityId, userId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    try {
      const updated = await srService.returnToClinic(
        facilityId, userId, request.params.id, body.reasonCode, body.note,
      );
      return ok(reply, { request: formatRequest(updated) });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:id/accept — Accept request
  fastify.post('/:id/accept', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = validated(reply, AdminAcceptRequestSchema, request.body);
    if (!body) return;

    const { facilityId, userId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    try {
      const updated = await srService.accept(
        facilityId, userId, request.params.id, body.note,
      );
      return ok(reply, { request: formatRequest(updated) });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:id/reject — Reject request
  fastify.post('/:id/reject', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = validated(reply, AdminRejectRequestSchema, request.body) as { reasonCode: string; note?: string } | null;
    if (!body) return;

    const { facilityId, userId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    try {
      const updated = await srService.reject(
        facilityId, userId, request.params.id, body.reasonCode, body.note,
      );
      return ok(reply, { request: formatRequest(updated) });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:id/checklist/complete — Complete a checklist instance
  fastify.post('/:id/checklist/complete', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_REVIEW')],
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { instanceId: string } }>, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    const body = request.body as { instanceId?: string };
    if (!body?.instanceId) {
      return fail(reply, 'VALIDATION_ERROR', 'instanceId is required', 400);
    }

    try {
      const instance = await srService.completeChecklist(
        facilityId, userId, request.params.id, body.instanceId,
      );
      return ok(reply, { checklistInstance: formatChecklistInstance(instance) });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // POST /:id/convert — Convert accepted request to surgical_case
  fastify.post('/:id/convert', {
    preHandler: [requireCapabilities('SURGERY_REQUEST_CONVERT')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;
    if (!facilityId) {
      return fail(reply, 'FORBIDDEN', 'Facility context required', 403);
    }

    try {
      const result = await srService.convert(
        facilityId, userId, request.params.id,
      );
      return ok(reply, {
        request: formatRequest(result.request),
        surgicalCaseId: result.surgicalCaseId,
      }, 201);
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });
}

// ============================================================================
// FORMATTERS
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

function formatSubmission(row: srService.SubmissionRow) {
  return {
    id: row.id,
    requestId: row.request_id,
    submissionSeq: row.submission_seq,
    submittedAt: row.submitted_at,
    receivedAt: row.received_at,
    payloadVersion: row.payload_version,
    createdAt: row.created_at,
  };
}

function formatAuditEvent(row: srService.AuditEventRow) {
  return {
    id: row.id,
    requestId: row.request_id,
    submissionId: row.submission_id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorClinicId: row.actor_clinic_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name ?? null,
    reasonCode: row.reason_code,
    note: row.note,
    createdAt: row.created_at,
  };
}

function formatChecklistInstance(row: srService.ChecklistInstanceRow) {
  return {
    id: row.id,
    requestId: row.request_id,
    submissionId: row.submission_id,
    templateVersionId: row.template_version_id,
    templateName: row.template_name ?? null,
    templateVersion: row.template_version ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatChecklistResponse(row: srService.ChecklistResponseRow) {
  return {
    id: row.id,
    instanceId: row.instance_id,
    itemKey: row.item_key,
    response: row.response,
    actorType: row.actor_type,
    actorClinicId: row.actor_clinic_id,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
  };
}

function handleServiceError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as Error & { statusCode?: number; code?: string };
  if (e.statusCode === 409) {
    return fail(reply, e.code || 'CONFLICT', e.message, 409);
  }
  if (e.statusCode === 422) {
    return fail(reply, e.code || 'UNPROCESSABLE_ENTITY', e.message, 422);
  }
  if (e.statusCode === 404) {
    return fail(reply, 'NOT_FOUND', e.message, 404);
  }
  throw err;
}
