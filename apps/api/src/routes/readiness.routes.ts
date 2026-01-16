/**
 * Readiness Routes
 * Day-before readiness queries and attestation management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';
import { CreateAttestationRequestSchema } from '../schemas/index.js';
import {
  getDayBeforeReadiness,
  computeSingleCaseReadiness,
  updateReadinessCache,
} from '../services/readiness.service.js';
// Auth decorators available if needed: requireAttestation, requireSurgeon

export async function readinessRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /readiness/day-before
   * Get readiness for all cases on a specific date (tomorrow by default)
   */
  fastify.get('/day-before', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { date?: string; refresh?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { date, refresh } = request.query;

    // Default to tomorrow in facility timezone
    // For simplicity, using UTC - production should use facility timezone
    let targetDate: Date;
    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
    }
    // Normalize to start of day
    targetDate.setHours(0, 0, 0, 0);

    const forceRefresh = refresh === 'true';
    const cacheRows = await getDayBeforeReadiness(facilityId, targetDate, forceRefresh);

    // Get facility name
    const facilityResult = await query<{ name: string }>(`
      SELECT name FROM facility WHERE id = $1
    `, [facilityId]);
    const facilityName = facilityResult.rows[0]?.name || 'Unknown';

    // Get scheduled times for cases
    const caseIds = cacheRows.map(r => r.case_id);
    const caseTimes = new Map<string, string | null>();
    if (caseIds.length > 0) {
      const timesResult = await query<{ id: string; scheduled_time: string | null }>(`
        SELECT id, scheduled_time FROM surgical_case WHERE id = ANY($1)
      `, [caseIds]);
      for (const row of timesResult.rows) {
        caseTimes.set(row.id, row.scheduled_time);
      }
    }

    // Get surgeon IDs
    const surgeonIds = new Map<string, string>();
    if (caseIds.length > 0) {
      const surgeonResult = await query<{ id: string; surgeon_id: string }>(`
        SELECT id, surgeon_id FROM surgical_case WHERE id = ANY($1)
      `, [caseIds]);
      for (const row of surgeonResult.rows) {
        surgeonIds.set(row.id, row.surgeon_id);
      }
    }

    // Transform cache rows to response format
    const cases = cacheRows.map(row => ({
      caseId: row.case_id,
      facilityId: row.facility_id,
      scheduledDate: row.scheduled_date.toISOString().split('T')[0],
      scheduledTime: caseTimes.get(row.case_id) || null,
      procedureName: row.procedure_name,
      surgeonId: surgeonIds.get(row.case_id) || '',
      surgeonName: row.surgeon_name,
      readinessState: row.readiness_state,
      missingItems: row.missing_items as any[],
      totalRequiredItems: row.total_required_items,
      totalVerifiedItems: row.total_verified_items,
      hasAttestation: row.has_attestation,
      attestedAt: row.attested_at?.toISOString() || null,
      attestedByName: row.attested_by_name,
      hasSurgeonAcknowledgment: row.has_surgeon_acknowledgment,
      surgeonAcknowledgedAt: row.surgeon_acknowledged_at?.toISOString() || null,
    }));

    // Calculate summary
    const summary = {
      total: cases.length,
      green: cases.filter(c => c.readinessState === 'GREEN').length,
      orange: cases.filter(c => c.readinessState === 'ORANGE').length,
      red: cases.filter(c => c.readinessState === 'RED').length,
      attested: cases.filter(c => c.hasAttestation).length,
    };

    return reply.send({
      facilityId,
      facilityName,
      targetDate: targetDate.toISOString().split('T')[0],
      cases,
      summary,
    });
  });

  /**
   * GET /readiness/cases/:id
   * Get readiness for a single case (computed fresh)
   */
  fastify.get('/cases/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const readiness = await computeSingleCaseReadiness(id, facilityId);

    if (!readiness) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Get additional case info
    const caseResult = await query<{
      scheduled_date: Date;
      scheduled_time: string | null;
      procedure_name: string;
      surgeon_id: string;
    }>(`
      SELECT scheduled_date, scheduled_time, procedure_name, surgeon_id
      FROM surgical_case WHERE id = $1
    `, [id]);

    const surgeonResult = await query<{ name: string }>(`
      SELECT name FROM app_user WHERE id = $1
    `, [caseResult.rows[0].surgeon_id]);

    return reply.send({
      ...readiness,
      facilityId,
      scheduledDate: caseResult.rows[0].scheduled_date.toISOString().split('T')[0],
      scheduledTime: caseResult.rows[0].scheduled_time,
      procedureName: caseResult.rows[0].procedure_name,
      surgeonId: caseResult.rows[0].surgeon_id,
      surgeonName: surgeonResult.rows[0]?.name || 'Unknown',
    });
  });

  /**
   * POST /readiness/attestations
   * Create attestation (staff readiness attestation or surgeon acknowledgment)
   */
  fastify.post('/attestations', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreateAttestationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { caseId, type, notes } = parseResult.data;
    const { facilityId, userId, role } = request.user;

    // Verify case exists
    const caseResult = await query<{ surgeon_id: string; scheduled_date: Date }>(`
      SELECT surgeon_id, scheduled_date FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Role-based authorization
    if (type === 'SURGEON_ACKNOWLEDGMENT') {
      // Only surgeon assigned to case can acknowledge
      if (role !== 'SURGEON' || caseResult.rows[0].surgeon_id !== userId) {
        return reply.status(403).send({
          error: 'Only the assigned surgeon can acknowledge',
        });
      }
    } else if (type === 'CASE_READINESS') {
      // Only staff roles can attest readiness
      const allowedRoles = ['ADMIN', 'CIRCULATOR', 'INVENTORY_TECH'];
      if (!allowedRoles.includes(role)) {
        return reply.status(403).send({
          error: 'Only authorized staff can attest readiness',
        });
      }
    }

    // Get current readiness state
    const readiness = await computeSingleCaseReadiness(caseId, facilityId);
    if (!readiness) {
      return reply.status(500).send({ error: 'Failed to compute readiness' });
    }

    // For surgeon acknowledgment, procedure must be RED
    if (type === 'SURGEON_ACKNOWLEDGMENT' && readiness.readinessState !== 'RED') {
      return reply.status(400).send({
        error: 'Surgeon acknowledgment only required when procedure has missing items',
      });
    }

    // Insert attestation (append-only)
    const result = await query<{ id: string; created_at: Date }>(`
      INSERT INTO attestation (
        facility_id, case_id, type, attested_by_user_id,
        readiness_state_at_time, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [facilityId, caseId, type, userId, readiness.readinessState, notes || null]);

    // Get user name for response
    const userResult = await query<{ name: string }>(`
      SELECT name FROM app_user WHERE id = $1
    `, [userId]);

    // Update readiness cache
    await updateReadinessCache(facilityId, caseResult.rows[0].scheduled_date);

    return reply.status(201).send({
      id: result.rows[0].id,
      caseId,
      type,
      attestedByUserId: userId,
      attestedByName: userResult.rows[0]?.name || 'Unknown',
      readinessStateAtTime: readiness.readinessState,
      notes,
      createdAt: result.rows[0].created_at.toISOString(),
    });
  });

  /**
   * GET /readiness/cases/:id/attestations
   * Get all attestations for a case
   */
  fastify.get('/cases/:id/attestations', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<{
      id: string;
      type: string;
      attested_by_user_id: string;
      readiness_state_at_time: string;
      notes: string | null;
      created_at: Date;
      user_name: string;
    }>(`
      SELECT a.*, u.name as user_name
      FROM attestation a
      JOIN app_user u ON a.attested_by_user_id = u.id
      WHERE a.case_id = $1 AND a.facility_id = $2
      ORDER BY a.created_at DESC
    `, [id, facilityId]);

    return reply.send({
      attestations: result.rows.map(row => ({
        id: row.id,
        caseId: id,
        type: row.type,
        attestedByUserId: row.attested_by_user_id,
        attestedByName: row.user_name,
        readinessStateAtTime: row.readiness_state_at_time,
        notes: row.notes,
        createdAt: row.created_at.toISOString(),
      })),
    });
  });

  /**
   * POST /readiness/refresh
   * Force refresh readiness cache for a date
   */
  fastify.post('/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Body: { date?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const body = request.body as { date?: string } || {};

    let targetDate: Date;
    if (body.date) {
      targetDate = new Date(body.date);
    } else {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
    }
    targetDate.setHours(0, 0, 0, 0);

    await updateReadinessCache(facilityId, targetDate);

    return reply.send({
      success: true,
      date: targetDate.toISOString().split('T')[0],
    });
  });
}
