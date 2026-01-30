/**
 * Case Routes
 * Scheduling shell - create/update cases, select preference cards, manage requirements
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query, transaction } from '../db/index.js';
import {
  CreateCaseRequestSchema,
  UpdateCaseRequestSchema,
  SetCaseRequirementsRequestSchema,
  SelectPreferenceCardRequestSchema,
  ActivateCaseRequestSchema,
  ApproveCaseRequestSchema,
  RejectCaseRequestSchema,
  CancelCaseRequestSchema,
  AssignRoomRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities, getUserRoles, deriveCapabilities } from '../plugins/auth.js';
import { canStartCase, canCompleteCase } from '../services/checklists.service.js';
import { getCaseRepository, SurgicalCase } from '../repositories/index.js';
import { getStatusEvents } from '../services/case-status.service.js';
import { ok, fail, validated } from '../utils/reply.js';

// Helper to format case for API response
function formatCase(c: SurgicalCase) {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    facilityId: c.facilityId,
    scheduledDate: c.scheduledDate,
    scheduledTime: c.scheduledTime,
    requestedDate: c.requestedDate,
    requestedTime: c.requestedTime,
    surgeonId: c.surgeonId,
    surgeonName: c.surgeonName,
    procedureName: c.procedureName,
    preferenceCardVersionId: c.preferenceCardVersionId,
    status: c.status,
    notes: c.notes,
    isActive: c.isActive,
    activatedAt: c.activatedAt?.toISOString() || null,
    activatedByUserId: c.activatedByUserId,
    isCancelled: c.isCancelled,
    cancelledAt: c.cancelledAt?.toISOString() || null,
    cancelledByUserId: c.cancelledByUserId,
    rejectedAt: c.rejectedAt?.toISOString() || null,
    rejectedByUserId: c.rejectedByUserId,
    rejectionReason: c.rejectionReason,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    // Room scheduling fields
    roomId: c.roomId,
    roomName: c.roomName,
    estimatedDurationMinutes: c.estimatedDurationMinutes,
    sortOrder: c.sortOrder,
  };
}

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  const caseRepo = getCaseRepository();

  /**
   * GET /cases
   * List cases (with optional filters)
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { date?: string; status?: string; active?: string; search?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { date, status, active, search } = request.query;

    const cases = await caseRepo.findMany(facilityId, {
      date,
      status,
      active: active !== undefined ? active === 'true' : undefined,
      search,
    });

    return ok(reply, { cases: cases.map(formatCase) });
  });

  /**
   * POST /cases
   * Create a new case (CASE_CREATE capability)
   * Cases start as inactive (is_active=false)
   */
  fastify.post('/', {
    preHandler: [requireCapabilities('CASE_CREATE')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = validated(reply, CreateCaseRequestSchema, request.body);
    if (!data) return;
    const { facilityId } = request.user;

    // Validate surgeon exists and belongs to facility (cross-domain check)
    const surgeonResult = await query(`
      SELECT id FROM app_user
      WHERE id = $1 AND facility_id = $2 AND role = 'SURGEON'
    `, [data.surgeonId, facilityId]);

    if (surgeonResult.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid surgeon');
    }

    // If preference card provided, get its current version
    let preferenceCardVersionId: string | null = null;
    if (data.preferenceCardId) {
      const pcResult = await query<{ current_version_id: string | null }>(`
        SELECT current_version_id FROM preference_card
        WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
      `, [data.preferenceCardId, facilityId, data.surgeonId]);

      if (pcResult.rows.length === 0) {
        return fail(reply, 'VALIDATION_ERROR', 'Invalid preference card');
      }

      preferenceCardVersionId = pcResult.rows[0].current_version_id;
    }

    // Check if user is trying to create directly in SCHEDULED status
    let status: 'REQUESTED' | 'SCHEDULED' = 'REQUESTED';
    if (data.status === 'SCHEDULED') {
      // Direct scheduling requires CASE_APPROVE capability
      const userRoles = getUserRoles(request.user);
      const userCaps = deriveCapabilities(userRoles);
      if (!userCaps.includes('CASE_APPROVE')) {
        return fail(reply, 'FORBIDDEN', 'Only users with scheduling capability can create directly scheduled cases', 403);
      }
      status = 'SCHEDULED';
    }

    // Create the case
    const newCase = await caseRepo.create({
      facilityId,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      requestedDate: data.requestedDate,
      requestedTime: data.requestedTime,
      surgeonId: data.surgeonId,
      procedureName: data.procedureName,
      preferenceCardVersionId,
      notes: data.notes,
      status,
    });

    // If preference card version set, copy its items to case requirements
    if (preferenceCardVersionId) {
      await caseRepo.copyRequirementsFromVersion(newCase.id, preferenceCardVersionId);
    }

    return ok(reply, { case: formatCase(newCase) }, 201);
  });

  /**
   * GET /cases/:id
   * Get case details
   */
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const surgicalCase = await caseRepo.findById(id, facilityId);
    if (!surgicalCase) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    const requirements = await caseRepo.getRequirements(id);

    return ok(reply, {
      case: formatCase(surgicalCase),
      requirements: requirements.map(r => ({
        id: r.id,
        catalogId: r.catalogId,
        catalogName: r.catalogName,
        quantity: r.quantity,
        isSurgeonOverride: r.isSurgeonOverride,
        notes: r.notes,
      })),
    });
  });

  /**
   * PATCH /cases/:id
   * Update case (CASE_UPDATE capability)
   * Note: Modifying date/time on active cases requires CASE_SCHEDULE
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireCapabilities('CASE_UPDATE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const data = validated(reply, UpdateCaseRequestSchema, request.body);
    if (!data) return;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    // Modifying schedule on active cases requires CASE_SCHEDULE capability
    if (caseStatus.isActive && (data.scheduledDate !== undefined || data.scheduledTime !== undefined)) {
      const userRoles = getUserRoles(request.user);
      const userCaps = deriveCapabilities(userRoles);
      if (!userCaps.includes('CASE_ASSIGN_ROOM')) {
        return fail(reply, 'FORBIDDEN', 'Only users with scheduling capability can modify date/time on active cases', 403);
      }
    }

    // Gate checks for status transitions when timeout/debrief feature is enabled
    if (data.status === 'IN_PROGRESS') {
      const canStart = await canStartCase(id, facilityId);
      if (!canStart) {
        return fail(reply, 'TIMEOUT_REQUIRED', 'Time Out checklist must be completed before starting the procedure');
      }
    }

    if (data.status === 'COMPLETED') {
      const canComplete = await canCompleteCase(id, facilityId);
      if (!canComplete) {
        return fail(reply, 'DEBRIEF_REQUIRED', 'Post-op Debrief checklist must be completed before completing the procedure');
      }
    }

    const updated = await caseRepo.update(id, facilityId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      surgeonId: data.surgeonId,
      procedureName: data.procedureName,
      preferenceCardVersionId: data.preferenceCardVersionId,
      status: data.status as any,
      notes: data.notes,
    }, request.user.userId);

    if (!updated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(updated) });
  });

  /**
   * POST /cases/:id/activate
   * Activate a case (CASE_ACTIVATE capability)
   * Sets date/time and marks case as active
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [requireCapabilities('CASE_ACTIVATE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const data = validated(reply, ActivateCaseRequestSchema, request.body);
    if (!data) return;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (caseStatus.isCancelled) {
      return fail(reply, 'INVALID_STATE', 'Cannot activate a cancelled case');
    }

    if (caseStatus.isActive) {
      return fail(reply, 'INVALID_STATE', 'Case is already active');
    }

    const activated = await caseRepo.activate(id, facilityId, userId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
    });

    if (!activated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(activated) });
  });

  /**
   * POST /cases/:id/approve
   * Approve a case request (CASE_APPROVE capability)
   * Transitions from REQUESTED to SCHEDULED
   */
  fastify.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [requireCapabilities('CASE_APPROVE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const data = validated(reply, ApproveCaseRequestSchema, request.body);
    if (!data) return;

    const approved = await caseRepo.approve(id, facilityId, userId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      roomId: data.roomId,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
    });

    if (!approved) {
      return fail(reply, 'NOT_FOUND', 'Case not found or not in REQUESTED status', 404);
    }

    return ok(reply, { case: formatCase(approved) });
  });

  /**
   * PATCH /cases/:id/assign-room
   * Assign or unassign a room to a case (CASE_ASSIGN_ROOM capability)
   */
  fastify.patch<{ Params: { id: string } }>('/:id/assign-room', {
    preHandler: [requireCapabilities('CASE_ASSIGN_ROOM')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const data = validated(reply, AssignRoomRequestSchema, request.body);
    if (!data) return;

    const { roomId, sortOrder, estimatedDurationMinutes } = data;

    // Verify case exists
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    // Validate room belongs to facility if provided
    if (roomId) {
      const roomResult = await query<{ id: string }>(`
        SELECT id FROM room WHERE id = $1 AND facility_id = $2 AND active = true
      `, [roomId, facilityId]);

      if (roomResult.rows.length === 0) {
        return fail(reply, 'VALIDATION_ERROR', 'Invalid or inactive room');
      }
    }

    const updated = await caseRepo.update(id, facilityId, {
      roomId,
      sortOrder,
      estimatedDurationMinutes,
    });

    if (!updated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(updated) });
  });

  /**
   * POST /cases/:id/reject
   * Reject a case request (CASE_REJECT capability)
   * Transitions from REQUESTED to REJECTED
   */
  fastify.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [requireCapabilities('CASE_REJECT')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const data = validated(reply, RejectCaseRequestSchema, request.body);
    if (!data) return;

    const rejected = await caseRepo.reject(id, facilityId, userId, { reason: data.reason });

    if (!rejected) {
      return fail(reply, 'NOT_FOUND', 'Case not found or not in REQUESTED status', 404);
    }

    return ok(reply, { case: formatCase(rejected) });
  });

  /**
   * POST /cases/:id/deactivate
   * Deactivate a case (CASE_ACTIVATE capability)
   * Reversible - returns case to inactive state
   */
  fastify.post<{ Params: { id: string } }>('/:id/deactivate', {
    preHandler: [requireCapabilities('CASE_ACTIVATE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (!caseStatus.isActive) {
      return fail(reply, 'INVALID_STATE', 'Case is already inactive');
    }

    // Cannot deactivate IN_PROGRESS or COMPLETED cases
    if (caseStatus.status === 'IN_PROGRESS' || caseStatus.status === 'COMPLETED') {
      return fail(reply, 'INVALID_STATE', 'Cannot deactivate a case that is in progress or completed');
    }

    const deactivated = await caseRepo.deactivate(id, facilityId, request.user.userId);
    if (!deactivated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(deactivated) });
  });

  /**
   * POST /cases/:id/cancel
   * Cancel a case (CASE_CANCEL capability)
   * Can happen at any stage
   */
  fastify.post<{ Params: { id: string } }>('/:id/cancel', {
    preHandler: [requireCapabilities('CASE_CANCEL')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const data = validated(reply, CancelCaseRequestSchema, request.body);
    if (!data) return;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (caseStatus.isCancelled) {
      return fail(reply, 'INVALID_STATE', 'Case is already cancelled');
    }

    const cancelled = await caseRepo.cancel(id, facilityId, userId, data.reason);
    if (!cancelled) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(cancelled) });
  });

  /**
   * POST /cases/:id/preference-card
   * Select preference card for case (and optionally copy its items)
   */
  fastify.post<{ Params: { id: string } }>('/:id/preference-card', {
    preHandler: [requireCapabilities('CASE_PREFERENCE_CARD_LINK')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const data = validated(reply, SelectPreferenceCardRequestSchema, request.body);
    if (!data) return;

    const { preferenceCardId } = data;

    // Get case surgeon
    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    // Get preference card and verify it belongs to the surgeon
    const pcResult = await query<{ current_version_id: string | null }>(`
      SELECT current_version_id FROM preference_card
      WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
    `, [preferenceCardId, facilityId, surgeonId]);

    if (pcResult.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid preference card for this surgeon');
    }

    const versionId = pcResult.rows[0].current_version_id;

    await transaction(async (client) => {
      // Update case with preference card version
      await client.query(`
        UPDATE surgical_case
        SET preference_card_version_id = $1
        WHERE id = $2
      `, [versionId, id]);

      // Clear non-override requirements and copy from version
      await caseRepo.clearNonOverrideRequirements(id);

      if (versionId) {
        await caseRepo.copyRequirementsFromVersion(id, versionId);
      }
    });

    return ok(reply, { success: true });
  });

  /**
   * PUT /cases/:id/requirements
   * Set case requirements.
   * Capability-based: SURGEON (owner) or ADMIN (override) can set requirements.
   */
  fastify.put<{ Params: { id: string } }>('/:id/requirements', {
    preHandler: [requireCapabilities('CASE_VIEW')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const body = validated(reply, SetCaseRequirementsRequestSchema, request.body);
    if (!body) return;

    const { requirements, isSurgeonOverride } = body;

    // Verify case exists
    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    // Authorization: assigned surgeon OR admin (via USER_MANAGE capability)
    const userRoles = getUserRoles(request.user);
    const userCaps = deriveCapabilities(userRoles);
    const isAssignedSurgeon = surgeonId === userId;
    const isAdmin = userCaps.includes('USER_MANAGE');

    if (!isAssignedSurgeon && !isAdmin) {
      return fail(reply, 'FORBIDDEN', 'Only the assigned surgeon or an administrator can modify requirements', 403);
    }

    // Log when ADMIN overrides (not the assigned surgeon)
    if (isAdmin && !isAssignedSurgeon) {
      console.info(JSON.stringify({
        code: 'ADMIN_REQUIREMENTS_OVERRIDE',
        level: 'info',
        message: 'Admin modified case requirements for another surgeon',
        userId,
        caseId: id,
        surgeonId,
      }));
    }

    await caseRepo.setRequirements(
      id,
      requirements.map(r => ({
        catalogId: r.catalogId,
        quantity: r.quantity,
        notes: r.notes,
      })),
      isSurgeonOverride
    );

    return ok(reply, { success: true });
  });

  /**
   * DELETE /cases/:id
   * Delete an inactive case (CASE_DELETE capability — ADMIN only)
   * Only inactive cases can be deleted
   */
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireCapabilities('CASE_DELETE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (caseStatus.isActive) {
      return fail(reply, 'INVALID_STATE', 'Cannot delete an active case. Deactivate it first.');
    }

    if (caseStatus.status === 'IN_PROGRESS' || caseStatus.status === 'COMPLETED') {
      return fail(reply, 'INVALID_STATE', 'Cannot delete a case that is in progress or completed');
    }

    // Check if case has any completed checklists (Timeout/Debrief)
    // Completed checklists are part of the audit record and must be preserved
    const completedChecklists = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM case_checklist_instance
      WHERE case_id = $1 AND status = 'COMPLETED'
    `, [id]);

    if (parseInt(completedChecklists.rows[0]?.count || '0') > 0) {
      return fail(reply, 'INVALID_STATE', 'Cannot delete a case with completed Timeout or Debrief checklists. These are part of the audit record.');
    }

    // Delete related records first (foreign key constraints)
    await query(`DELETE FROM case_readiness_cache WHERE case_id = $1`, [id]);

    // Delete checklist-related records in correct order (respecting FK constraints)
    // 1. Delete flag resolutions (FK to signatures)
    await query(`
      DELETE FROM case_checklist_flag_resolution
      WHERE signature_id IN (
        SELECT s.id FROM case_checklist_signature s
        JOIN case_checklist_instance i ON s.instance_id = i.id
        WHERE i.case_id = $1
      )
    `, [id]);
    // 2. Delete signatures (FK to instance)
    await query(`
      DELETE FROM case_checklist_signature
      WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE case_id = $1)
    `, [id]);
    // 3. Delete responses (FK to instance)
    await query(`
      DELETE FROM case_checklist_response
      WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE case_id = $1)
    `, [id]);
    // 4. Delete instances (FK to case)
    await query(`DELETE FROM case_checklist_instance WHERE case_id = $1`, [id]);

    await query(`DELETE FROM case_override WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_requirement WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_anesthesia_plan WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_card_feedback WHERE surgical_case_id = $1`, [id]);

    // Clear reserved_for_case_id in inventory_item
    await query(`UPDATE inventory_item SET reserved_for_case_id = NULL WHERE reserved_for_case_id = $1`, [id]);

    // Handle attestation table (append-only with triggers)
    await query(`ALTER TABLE attestation DROP CONSTRAINT IF EXISTS attestation_case_id_fkey`);
    await query(`ALTER TABLE attestation DISABLE TRIGGER ALL`);
    await query(`ALTER TABLE attestation ALTER COLUMN case_id DROP NOT NULL`);
    await query(`UPDATE attestation SET case_id = NULL WHERE case_id = $1`, [id]);
    await query(`ALTER TABLE attestation ENABLE TRIGGER ALL`);
    await query(`
      ALTER TABLE attestation
      ADD CONSTRAINT attestation_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES surgical_case(id) ON DELETE SET NULL
    `);

    // For surgical_case_status_event (append-only), orphan records
    await query(`ALTER TABLE surgical_case_status_event DISABLE TRIGGER case_status_event_no_update`);
    await query(`ALTER TABLE surgical_case_status_event DISABLE TRIGGER case_status_event_no_delete`);
    await query(`UPDATE surgical_case_status_event SET surgical_case_id = NULL WHERE surgical_case_id = $1`, [id]);
    await query(`ALTER TABLE surgical_case_status_event ENABLE TRIGGER case_status_event_no_update`);
    await query(`ALTER TABLE surgical_case_status_event ENABLE TRIGGER case_status_event_no_delete`);

    // For case_event_log (append-only with NOT NULL case_id), we need to:
    // 1. Drop FK constraint
    // 2. Disable trigger
    // 3. Drop NOT NULL constraint
    // 4. Update case_id to NULL
    // 5. Restore constraints and triggers
    await query(`ALTER TABLE case_event_log DROP CONSTRAINT IF EXISTS case_event_log_case_id_fkey`);
    await query(`ALTER TABLE case_event_log DISABLE TRIGGER case_event_log_no_update`);
    await query(`ALTER TABLE case_event_log ALTER COLUMN case_id DROP NOT NULL`);
    await query(`UPDATE case_event_log SET case_id = NULL WHERE case_id = $1`, [id]);
    await query(`ALTER TABLE case_event_log ENABLE TRIGGER case_event_log_no_update`);

    // Recreate FK with ON DELETE SET NULL (keep column nullable for deleted cases)
    await query(`
      ALTER TABLE case_event_log
      ADD CONSTRAINT case_event_log_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES surgical_case(id) ON DELETE SET NULL
    `);

    // Delete the case
    const deleted = await query(`
      DELETE FROM surgical_case
      WHERE id = $1 AND facility_id = $2
      RETURNING id
    `, [id, facilityId]);

    if (deleted.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { success: true });
  });

  /**
   * GET /cases/:id/status-events
   * Append-only audit trail for status transitions
   */
  fastify.get<{ Params: { id: string } }>('/:id/status-events', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Verify case belongs to facility
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    const events = await getStatusEvents(id);
    return ok(reply, events.map(e => ({
      id: e.id,
      surgicalCaseId: e.surgical_case_id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      reason: e.reason,
      context: e.context,
      actorUserId: e.actor_user_id,
      actorName: e.actor_name,
      createdAt: e.created_at.toISOString(),
    })));
  });
}
