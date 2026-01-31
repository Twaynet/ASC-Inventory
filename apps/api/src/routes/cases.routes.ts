/**
 * Case Routes
 * Scheduling shell - create/update cases, select preference cards, manage requirements
 *
 * Wave 6B.2: Routes marked [CONTRACT] are registered via the contract adapter
 * and validated against @asc/contract schemas.
 */

import { FastifyInstance } from 'fastify';
import { query, transaction } from '../db/index.js';
import {
  SetCaseRequirementsRequestSchema,
  SelectPreferenceCardRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities, getUserRoles, deriveCapabilities } from '../plugins/auth.js';
import { canStartCase, canCompleteCase } from '../services/checklists.service.js';
import { getCaseRepository, SurgicalCase } from '../repositories/index.js';
import { getStatusEvents } from '../services/case-status.service.js';
import { ok, fail, validated } from '../utils/reply.js';
import { idempotent } from '../plugins/idempotency.js';
import { contract } from '@asc/contract';
import { registerContractRoute } from '../lib/contract-route.js';

// Helper to format case for API response
function formatCase(c: SurgicalCase) {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    facilityId: c.facilityId,
    scheduledDate: c.scheduledDate ?? null,
    scheduledTime: c.scheduledTime ?? null,
    requestedDate: c.requestedDate ?? null,
    requestedTime: c.requestedTime ?? null,
    surgeonId: c.surgeonId,
    surgeonName: c.surgeonName ?? '',
    procedureName: c.procedureName,
    preferenceCardVersionId: c.preferenceCardVersionId ?? null,
    status: c.status,
    notes: c.notes ?? null,
    isActive: c.isActive ?? false,
    activatedAt: c.activatedAt?.toISOString() ?? null,
    activatedByUserId: c.activatedByUserId ?? null,
    isCancelled: c.isCancelled ?? false,
    cancelledAt: c.cancelledAt?.toISOString() ?? null,
    cancelledByUserId: c.cancelledByUserId ?? null,
    rejectedAt: c.rejectedAt?.toISOString() ?? null,
    rejectedByUserId: c.rejectedByUserId ?? null,
    rejectionReason: c.rejectionReason ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : (c.createdAt ?? new Date().toISOString()),
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : (c.updatedAt ?? new Date().toISOString()),
    // Room scheduling fields
    roomId: c.roomId ?? null,
    roomName: c.roomName ?? null,
    estimatedDurationMinutes: c.estimatedDurationMinutes ?? 60,
    sortOrder: c.sortOrder ?? 0,
  };
}

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  const caseRepo = getCaseRepository();
  const PREFIX = '/cases';

  // ── [CONTRACT] GET /cases — List cases ─────────────────────────────
  registerContractRoute(fastify, contract.cases.list, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { facilityId } = request.user;
      const { date, status, active, search } = request.contractData.query as {
        date?: string; status?: string; active?: string; search?: string;
      };

      const cases = await caseRepo.findMany(facilityId, {
        date,
        status,
        active: active !== undefined ? active === 'true' : undefined,
        search,
      });

      return ok(reply, { cases: cases.map(formatCase) });
    },
  });

  // ── [CONTRACT] GET /cases/:caseId — Get case details ───────────────
  registerContractRoute(fastify, contract.cases.get, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId } = request.user;

      const surgicalCase = await caseRepo.findById(caseId, facilityId);
      if (!surgicalCase) {
        return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
      }

      const requirements = await caseRepo.getRequirements(caseId);

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
    },
  });

  // ── [CONTRACT] PATCH /cases/:caseId — Update case ──────────────────
  registerContractRoute(fastify, contract.cases.update, PREFIX, {
    preHandler: [requireCapabilities('CASE_UPDATE')],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId } = request.user;
      const data = request.contractData.body as {
        scheduledDate?: string;
        scheduledTime?: string | null;
        surgeonId?: string;
        procedureName?: string;
        preferenceCardVersionId?: string | null;
        status?: string;
        notes?: string | null;
      };

      // Check current case state
      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
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
        const canStart = await canStartCase(caseId, facilityId);
        if (!canStart) {
          return fail(reply, 'TIMEOUT_REQUIRED', 'Time Out checklist must be completed before starting the procedure');
        }
      }

      if (data.status === 'COMPLETED') {
        const canComplete = await canCompleteCase(caseId, facilityId);
        if (!canComplete) {
          return fail(reply, 'DEBRIEF_REQUIRED', 'Post-op Debrief checklist must be completed before completing the procedure');
        }
      }

      const updated = await caseRepo.update(caseId, facilityId, {
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
    },
  });

  // ── [CONTRACT] POST /cases/:caseId/approve — Approve case ─────────
  registerContractRoute(fastify, contract.cases.approve, PREFIX, {
    preHandler: [requireCapabilities('CASE_APPROVE'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId, userId } = request.user;
      const data = request.contractData.body as {
        scheduledDate: string;
        scheduledTime?: string;
        roomId?: string | null;
        estimatedDurationMinutes?: number;
      };

      const approved = await caseRepo.approve(caseId, facilityId, userId, {
        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime,
        roomId: data.roomId,
        estimatedDurationMinutes: data.estimatedDurationMinutes,
      });

      if (!approved) {
        return fail(reply, 'NOT_FOUND', 'Case not found or not in REQUESTED status', 404);
      }

      return ok(reply, { case: formatCase(approved) });
    },
  });

  // ── [CONTRACT] POST /cases/:caseId/reject — Reject case ───────────
  registerContractRoute(fastify, contract.cases.reject, PREFIX, {
    preHandler: [requireCapabilities('CASE_REJECT'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId, userId } = request.user;
      const data = request.contractData.body as { reason: string };

      const rejected = await caseRepo.reject(caseId, facilityId, userId, { reason: data.reason });

      if (!rejected) {
        return fail(reply, 'NOT_FOUND', 'Case not found or not in REQUESTED status', 404);
      }

      return ok(reply, { case: formatCase(rejected) });
    },
  });

  // ── [CONTRACT] PATCH /cases/:caseId/assign-room — Assign room ─────
  registerContractRoute(fastify, contract.cases.assignRoom, PREFIX, {
    preHandler: [requireCapabilities('CASE_ASSIGN_ROOM'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId } = request.user;
      const data = request.contractData.body as {
        roomId: string | null;
        sortOrder?: number;
        estimatedDurationMinutes?: number;
      };

      const { roomId, sortOrder, estimatedDurationMinutes } = data;

      // Verify case exists
      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
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

      const updated = await caseRepo.update(caseId, facilityId, {
        roomId,
        sortOrder,
        estimatedDurationMinutes,
      });

      if (!updated) {
        return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
      }

      return ok(reply, { case: formatCase(updated) });
    },
  });

  // ── [CONTRACT] POST /cases — Create case ────────────────────────────
  registerContractRoute(fastify, contract.cases.create, PREFIX, {
    preHandler: [requireCapabilities('CASE_CREATE')],
    handler: async (request, reply) => {
      const data = request.contractData.body as {
        surgeonId: string;
        procedureName: string;
        scheduledDate: string;
        scheduledTime?: string;
        requestedDate?: string;
        requestedTime?: string;
        preferenceCardId?: string;
        notes?: string;
        status?: string;
      };
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
    },
  });

  // ── [CONTRACT] POST /cases/:caseId/activate — Activate case ────────
  registerContractRoute(fastify, contract.cases.activate, PREFIX, {
    preHandler: [requireCapabilities('CASE_ACTIVATE'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId, userId } = request.user;

      const data = request.contractData.body as {
        scheduledDate?: string;
        scheduledTime?: string;
      };

      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (caseStatus.isCancelled) {
      return fail(reply, 'INVALID_STATE', 'Cannot activate a cancelled case');
    }

    if (caseStatus.isActive) {
      return fail(reply, 'INVALID_STATE', 'Case is already active');
    }

    const activated = await caseRepo.activate(caseId, facilityId, userId, {
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
    });

    if (!activated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(activated) });
    },
  });

  // ── [CONTRACT] POST /cases/:caseId/deactivate — Deactivate case ────
  registerContractRoute(fastify, contract.cases.deactivate, PREFIX, {
    preHandler: [requireCapabilities('CASE_ACTIVATE'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId } = request.user;

      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (!caseStatus.isActive) {
      return fail(reply, 'INVALID_STATE', 'Case is already inactive');
    }

    if (caseStatus.status === 'IN_PROGRESS' || caseStatus.status === 'COMPLETED') {
      return fail(reply, 'INVALID_STATE', 'Cannot deactivate a case that is in progress or completed');
    }

    const deactivated = await caseRepo.deactivate(caseId, facilityId, request.user.userId);
    if (!deactivated) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(deactivated) });
    },
  });

  // ── [CONTRACT] POST /cases/:caseId/cancel — Cancel case ────────────
  registerContractRoute(fastify, contract.cases.cancel, PREFIX, {
    preHandler: [requireCapabilities('CASE_CANCEL'), idempotent()],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId, userId } = request.user;

      const data = request.contractData.body as { reason: string };

      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
    if (!caseStatus) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    if (caseStatus.isCancelled) {
      return fail(reply, 'INVALID_STATE', 'Case is already cancelled');
    }

    const cancelled = await caseRepo.cancel(caseId, facilityId, userId, data.reason);
    if (!cancelled) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    return ok(reply, { case: formatCase(cancelled) });
    },
  });

  // ── [CONTRACT] GET /cases/:caseId/status-events — Status events ────
  registerContractRoute(fastify, contract.cases.statusEvents, PREFIX, {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { caseId } = request.contractData.params as { caseId: string };
      const { facilityId } = request.user;

      const caseStatus = await caseRepo.getStatus(caseId, facilityId);
      if (!caseStatus) {
        return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
      }

      const events = await getStatusEvents(caseId);
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
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  // NON-CONTRACTED ROUTES (legacy registration, unchanged)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * POST /cases/:id/preference-card
   * Select preference card for case
   */
  fastify.post<{ Params: { id: string } }>('/:id/preference-card', {
    preHandler: [requireCapabilities('CASE_PREFERENCE_CARD_LINK')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const data = validated(reply, SelectPreferenceCardRequestSchema, request.body);
    if (!data) return;

    const { preferenceCardId } = data;

    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    const pcResult = await query<{ current_version_id: string | null }>(`
      SELECT current_version_id FROM preference_card
      WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
    `, [preferenceCardId, facilityId, surgeonId]);

    if (pcResult.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid preference card for this surgeon');
    }

    const versionId = pcResult.rows[0].current_version_id;

    await transaction(async (client) => {
      await client.query(`
        UPDATE surgical_case
        SET preference_card_version_id = $1
        WHERE id = $2
      `, [versionId, id]);

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
   */
  fastify.put<{ Params: { id: string } }>('/:id/requirements', {
    preHandler: [requireCapabilities('CASE_VIEW')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const body = validated(reply, SetCaseRequirementsRequestSchema, request.body);
    if (!body) return;

    const { requirements, isSurgeonOverride } = body;

    const surgeonId = await caseRepo.getSurgeonId(id, facilityId);
    if (!surgeonId) {
      return fail(reply, 'NOT_FOUND', 'Procedure not found', 404);
    }

    const userRoles = getUserRoles(request.user);
    const userCaps = deriveCapabilities(userRoles);
    const isAssignedSurgeon = surgeonId === userId;
    const isAdmin = userCaps.includes('USER_MANAGE');

    if (!isAssignedSurgeon && !isAdmin) {
      return fail(reply, 'FORBIDDEN', 'Only the assigned surgeon or an administrator can modify requirements', 403);
    }

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
   */
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireCapabilities('CASE_DELETE')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

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

    const completedChecklists = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM case_checklist_instance
      WHERE case_id = $1 AND status = 'COMPLETED'
    `, [id]);

    if (parseInt(completedChecklists.rows[0]?.count || '0') > 0) {
      return fail(reply, 'INVALID_STATE', 'Cannot delete a case with completed Timeout or Debrief checklists. These are part of the audit record.');
    }

    await query(`DELETE FROM case_readiness_cache WHERE case_id = $1`, [id]);
    await query(`
      DELETE FROM case_checklist_flag_resolution
      WHERE signature_id IN (
        SELECT s.id FROM case_checklist_signature s
        JOIN case_checklist_instance i ON s.instance_id = i.id
        WHERE i.case_id = $1
      )
    `, [id]);
    await query(`
      DELETE FROM case_checklist_signature
      WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE case_id = $1)
    `, [id]);
    await query(`
      DELETE FROM case_checklist_response
      WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE case_id = $1)
    `, [id]);
    await query(`DELETE FROM case_checklist_instance WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_override WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_requirement WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_anesthesia_plan WHERE case_id = $1`, [id]);
    await query(`DELETE FROM case_card_feedback WHERE surgical_case_id = $1`, [id]);
    await query(`UPDATE inventory_item SET reserved_for_case_id = NULL WHERE reserved_for_case_id = $1`, [id]);

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

    await query(`ALTER TABLE surgical_case_status_event DISABLE TRIGGER case_status_event_no_update`);
    await query(`ALTER TABLE surgical_case_status_event DISABLE TRIGGER case_status_event_no_delete`);
    await query(`UPDATE surgical_case_status_event SET surgical_case_id = NULL WHERE surgical_case_id = $1`, [id]);
    await query(`ALTER TABLE surgical_case_status_event ENABLE TRIGGER case_status_event_no_update`);
    await query(`ALTER TABLE surgical_case_status_event ENABLE TRIGGER case_status_event_no_delete`);

    await query(`ALTER TABLE case_event_log DROP CONSTRAINT IF EXISTS case_event_log_case_id_fkey`);
    await query(`ALTER TABLE case_event_log DISABLE TRIGGER case_event_log_no_update`);
    await query(`ALTER TABLE case_event_log ALTER COLUMN case_id DROP NOT NULL`);
    await query(`UPDATE case_event_log SET case_id = NULL WHERE case_id = $1`, [id]);
    await query(`ALTER TABLE case_event_log ENABLE TRIGGER case_event_log_no_update`);
    await query(`
      ALTER TABLE case_event_log
      ADD CONSTRAINT case_event_log_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES surgical_case(id) ON DELETE SET NULL
    `);

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

}
