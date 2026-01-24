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
import { requireScheduler, requireSurgeon, requireAdmin } from '../plugins/auth.js';
import { canStartCase, canCompleteCase } from '../services/checklists.service.js';
import { getCaseRepository, SurgicalCase } from '../repositories/index.js';

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

    return reply.send({
      cases: cases.map(formatCase),
    });
  });

  /**
   * POST /cases
   * Create a new case (any authenticated user)
   * Cases start as inactive (is_active=false)
   */
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreateCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;
    const { facilityId } = request.user;

    // Validate surgeon exists and belongs to facility (cross-domain check)
    const surgeonResult = await query(`
      SELECT id FROM app_user
      WHERE id = $1 AND facility_id = $2 AND role = 'SURGEON'
    `, [data.surgeonId, facilityId]);

    if (surgeonResult.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid surgeon' });
    }

    // If preference card provided, get its current version
    let preferenceCardVersionId: string | null = null;
    if (data.preferenceCardId) {
      const pcResult = await query<{ current_version_id: string | null }>(`
        SELECT current_version_id FROM preference_card
        WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
      `, [data.preferenceCardId, facilityId, data.surgeonId]);

      if (pcResult.rows.length === 0) {
        return reply.status(400).send({ error: 'Invalid preference card' });
      }

      preferenceCardVersionId = pcResult.rows[0].current_version_id;
    }

    // Check if user is trying to create directly in SCHEDULED status
    let status: 'REQUESTED' | 'SCHEDULED' = 'REQUESTED';
    if (data.status === 'SCHEDULED') {
      // Only Admin or Scheduler can create directly scheduled cases
      const userRoles = request.user.roles || [request.user.role];
      const canDirectSchedule = userRoles.includes('ADMIN') || userRoles.includes('SCHEDULER');
      if (!canDirectSchedule) {
        return reply.status(403).send({ error: 'Only Admin or Scheduler can create directly scheduled cases' });
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

    return reply.status(201).send({ case: formatCase(newCase) });
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
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    const requirements = await caseRepo.getRequirements(id);

    return reply.send({
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
   * Update case (any authenticated user)
   * Note: Only ADMIN can update date/time on active cases
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, role } = request.user;

    const parseResult = UpdateCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Only ADMIN or SCHEDULER can modify date/time on active cases
    if (caseStatus.isActive && (data.scheduledDate !== undefined || data.scheduledTime !== undefined)) {
      if (role !== 'ADMIN' && role !== 'SCHEDULER') {
        return reply.status(403).send({ error: 'Only ADMIN or SCHEDULER can modify date/time on active cases' });
      }
    }

    // Gate checks for status transitions when timeout/debrief feature is enabled
    if (data.status === 'IN_PROGRESS') {
      const canStart = await canStartCase(id, facilityId);
      if (!canStart) {
        return reply.status(400).send({
          error: 'Time Out checklist must be completed before starting the procedure',
          code: 'TIMEOUT_REQUIRED',
        });
      }
    }

    if (data.status === 'COMPLETED') {
      const canComplete = await canCompleteCase(id, facilityId);
      if (!canComplete) {
        return reply.status(400).send({
          error: 'Post-op Debrief checklist must be completed before completing the procedure',
          code: 'DEBRIEF_REQUIRED',
        });
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
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: formatCase(updated) });
  });

  /**
   * POST /cases/:id/activate
   * Activate a case (ADMIN only)
   * Sets date/time and marks case as active
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = ActivateCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (caseStatus.isCancelled) {
      return reply.status(400).send({ error: 'Cannot activate a cancelled case' });
    }

    if (caseStatus.isActive) {
      return reply.status(400).send({ error: 'Case is already active' });
    }

    const activated = await caseRepo.activate(id, facilityId, userId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
    });

    if (!activated) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: formatCase(activated) });
  });

  /**
   * POST /cases/:id/approve
   * Approve a case request (ADMIN/SCHEDULER only)
   * Transitions from REQUESTED to SCHEDULED
   */
  fastify.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = ApproveCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    const approved = await caseRepo.approve(id, facilityId, userId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      roomId: data.roomId,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
    });

    if (!approved) {
      return reply.status(404).send({ error: 'Case not found or not in REQUESTED status' });
    }

    return reply.send({ case: formatCase(approved) });
  });

  /**
   * PATCH /cases/:id/assign-room
   * Assign or unassign a room to a case (ADMIN/SCHEDULER only)
   */
  fastify.patch<{ Params: { id: string } }>('/:id/assign-room', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = AssignRoomRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { roomId, sortOrder, estimatedDurationMinutes } = parseResult.data;

    // Verify case exists
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Validate room belongs to facility if provided
    if (roomId) {
      const roomResult = await query<{ id: string }>(`
        SELECT id FROM room WHERE id = $1 AND facility_id = $2 AND active = true
      `, [roomId, facilityId]);

      if (roomResult.rows.length === 0) {
        return reply.status(400).send({ error: 'Invalid or inactive room' });
      }
    }

    const updated = await caseRepo.update(id, facilityId, {
      roomId,
      sortOrder,
      estimatedDurationMinutes,
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: formatCase(updated) });
  });

  /**
   * POST /cases/:id/reject
   * Reject a case request (ADMIN/SCHEDULER only)
   * Transitions from REQUESTED to REJECTED
   */
  fastify.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = RejectCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { reason } = parseResult.data;

    const rejected = await caseRepo.reject(id, facilityId, userId, { reason });

    if (!rejected) {
      return reply.status(404).send({ error: 'Case not found or not in REQUESTED status' });
    }

    return reply.send({ case: formatCase(rejected) });
  });

  /**
   * POST /cases/:id/deactivate
   * Deactivate a case (ADMIN only)
   * Reversible - returns case to inactive state
   */
  fastify.post<{ Params: { id: string } }>('/:id/deactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (!caseStatus.isActive) {
      return reply.status(400).send({ error: 'Case is already inactive' });
    }

    // Cannot deactivate IN_PROGRESS or COMPLETED cases
    if (caseStatus.status === 'IN_PROGRESS' || caseStatus.status === 'COMPLETED') {
      return reply.status(400).send({ error: 'Cannot deactivate a case that is in progress or completed' });
    }

    const deactivated = await caseRepo.deactivate(id, facilityId);
    if (!deactivated) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: formatCase(deactivated) });
  });

  /**
   * POST /cases/:id/cancel
   * Cancel a case (any authenticated user)
   * Can happen at any stage
   */
  fastify.post<{ Params: { id: string } }>('/:id/cancel', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = CancelCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { reason } = parseResult.data;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (caseStatus.isCancelled) {
      return reply.status(400).send({ error: 'Case is already cancelled' });
    }

    const cancelled = await caseRepo.cancel(id, facilityId, userId, reason);
    if (!cancelled) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: formatCase(cancelled) });
  });

  /**
   * POST /cases/:id/preference-card
   * Select preference card for case (and optionally copy its items)
   */
  fastify.post<{ Params: { id: string } }>('/:id/preference-card', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = SelectPreferenceCardRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { preferenceCardId } = parseResult.data;

    // Get case surgeon
    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Get preference card and verify it belongs to the surgeon
    const pcResult = await query<{ current_version_id: string | null }>(`
      SELECT current_version_id FROM preference_card
      WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
    `, [preferenceCardId, facilityId, surgeonId]);

    if (pcResult.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid preference card for this surgeon' });
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

    return reply.send({ success: true });
  });

  /**
   * PUT /cases/:id/requirements
   * Set case requirements (surgeon override)
   */
  fastify.put<{ Params: { id: string } }>('/:id/requirements', {
    preHandler: [requireSurgeon],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const parseResult = SetCaseRequirementsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { requirements, isSurgeonOverride } = parseResult.data;

    // Verify case exists and surgeon owns it
    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (surgeonId !== userId) {
      return reply.status(403).send({ error: 'Only the assigned surgeon can modify requirements' });
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

    return reply.send({ success: true });
  });

  /**
   * DELETE /cases/:id
   * Delete an inactive case (ADMIN/SCHEDULER only)
   * Only inactive cases can be deleted
   */
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;

    // Check current case state
    const caseStatus = await caseRepo.getStatus(id, facilityId);
    if (!caseStatus) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (caseStatus.isActive) {
      return reply.status(400).send({ error: 'Cannot delete an active case. Deactivate it first.' });
    }

    if (caseStatus.status === 'IN_PROGRESS' || caseStatus.status === 'COMPLETED') {
      return reply.status(400).send({ error: 'Cannot delete a case that is in progress or completed' });
    }

    // Delete related records first (foreign key constraints)
    await query(`DELETE FROM case_readiness_cache WHERE case_id = $1`, [id]);
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
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ success: true, message: 'Case deleted successfully' });
  });
}
