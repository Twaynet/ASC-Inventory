/**
 * PHI Access Audit Routes — Read-Only Visibility (Phase 3)
 *
 * PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW §6 — Audit UX Requirements
 *
 * Provides read-only access to PHI access audit logs for compliance review.
 * All endpoints require PHI_AUDIT classification (PHI_AUDIT_ACCESS capability).
 * Records are immutable — no modification or deletion endpoints exist.
 */

import { FastifyInstance } from 'fastify';
import { requirePhiAccess } from '../plugins/phi-guard.js';
import {
  getPhiAccessLog,
  getPhiAccessLogEntry,
  getPhiAccessStats,
  type PhiAccessFilters,
  type PhiClassificationType,
  type AccessPurposeType,
  type AccessOutcome,
} from '../services/phi-audit.service.js';

export async function phiAuditRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /phi-audit
   * List PHI access audit entries (paginated, filtered)
   *
   * LAW §6: Read-only, supports filtering by user, case, org, purpose, outcome, time range.
   */
  fastify.get<{
    Querystring: {
      userId?: string;
      caseId?: string;
      outcome?: string;
      accessPurpose?: string;
      phiClassification?: string;
      isEmergency?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_AUDIT')],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const q = request.query;

    const filters: PhiAccessFilters = {
      facilityId,
      limit: q.limit ? parseInt(q.limit, 10) : 100,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    };

    if (q.userId) filters.userId = q.userId;
    if (q.caseId) filters.caseId = q.caseId;
    if (q.outcome) filters.outcome = q.outcome as AccessOutcome;
    if (q.accessPurpose) filters.accessPurpose = q.accessPurpose as AccessPurposeType;
    if (q.phiClassification) filters.phiClassification = q.phiClassification as PhiClassificationType;
    if (q.isEmergency === 'true') filters.isEmergency = true;
    if (q.isEmergency === 'false') filters.isEmergency = false;
    if (q.startDate) filters.startDate = q.startDate;
    if (q.endDate) filters.endDate = q.endDate;

    const result = await getPhiAccessLog(filters);

    return reply.send({
      entries: result.entries,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  });

  /**
   * GET /phi-audit/stats
   * Summary statistics for audit dashboard
   *
   * Note: registered BEFORE /:id to avoid route conflict
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/stats', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_AUDIT')],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate } = request.query;

    const stats = await getPhiAccessStats(facilityId, startDate, endDate);

    return reply.send({
      ...stats,
      dateRange: {
        start: startDate || null,
        end: endDate || null,
      },
    });
  });

  /**
   * GET /phi-audit/:id
   * Get single audit entry details
   *
   * LAW §6: Read-only, never allow modification or deletion.
   */
  fastify.get<{
    Params: { id: string };
  }>('/:id', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_AUDIT')],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { id } = request.params;

    const entry = await getPhiAccessLogEntry(id, facilityId);

    if (!entry) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log entry not found',
          requestId: request.requestId,
        },
      });
    }

    return reply.send(entry);
  });
}
