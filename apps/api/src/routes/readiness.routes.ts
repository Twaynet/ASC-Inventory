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
  getCalendarSummary,
} from '../services/readiness.service.js';
// Auth decorators available if needed: requireAttestation, requireSurgeon

/**
 * Format a Date to YYYY-MM-DD string without timezone conversion.
 * PostgreSQL DATE columns are returned at midnight UTC, so we need to
 * extract the UTC date components to avoid day shifts.
 */
function formatDateLocal(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

    // Get target date as string (YYYY-MM-DD format)
    // If not provided, default to tomorrow
    let targetDateStr: string;
    if (date) {
      targetDateStr = date;
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDateStr = formatDateLocal(tomorrow);
    }

    // Create Date object for any functions that need it
    // Parse as UTC to avoid timezone issues
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

    const forceRefresh = refresh === 'true';
    const cacheRows = await getDayBeforeReadiness(facilityId, targetDateStr, forceRefresh);

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

    // Get surgeon IDs and active/cancelled status
    const surgeonIds = new Map<string, string>();
    const caseActiveStatus = new Map<string, { isActive: boolean; isCancelled: boolean }>();
    if (caseIds.length > 0) {
      const surgeonResult = await query<{ id: string; surgeon_id: string; is_active: boolean; is_cancelled: boolean }>(`
        SELECT id, surgeon_id, is_active, is_cancelled FROM surgical_case WHERE id = ANY($1)
      `, [caseIds]);
      for (const row of surgeonResult.rows) {
        surgeonIds.set(row.id, row.surgeon_id);
        caseActiveStatus.set(row.id, { isActive: row.is_active, isCancelled: row.is_cancelled });
      }
    }

    // Transform cache rows to response format
    const cases = cacheRows.map(row => {
      const activeStatus = caseActiveStatus.get(row.case_id) || { isActive: true, isCancelled: false };
      return {
        caseId: row.case_id,
        facilityId: row.facility_id,
        scheduledDate: formatDateLocal(row.scheduled_date),
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
        attestationId: row.attestation_id,
        hasSurgeonAcknowledgment: row.has_surgeon_acknowledgment,
        surgeonAcknowledgedAt: row.surgeon_acknowledged_at?.toISOString() || null,
        surgeonAcknowledgmentId: row.surgeon_acknowledgment_id,
        isActive: activeStatus.isActive,
        isCancelled: activeStatus.isCancelled,
      };
    });

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
      targetDate: formatDateLocal(targetDate),
      cases,
      summary,
    });
  });

  /**
   * GET /readiness/calendar-summary
   * Get calendar summary for a date range (for month/week views)
   */
  fastify.get('/calendar-summary', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { startDate: string; endDate: string; granularity?: 'day' | 'case' };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, granularity = 'day' } = request.query;

    if (!startDate || !endDate) {
      return reply.status(400).send({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return reply.status(400).send({ error: 'Invalid date format' });
    }

    if (granularity !== 'day' && granularity !== 'case') {
      return reply.status(400).send({ error: 'granularity must be "day" or "case"' });
    }

    const result = await getCalendarSummary(facilityId, start, end, granularity);

    return reply.send(result);
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
      scheduledDate: formatDateLocal(caseResult.rows[0].scheduled_date),
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
      voided_at: Date | null;
      voided_by_user_id: string | null;
      voided_by_name: string | null;
    }>(`
      SELECT a.*, u.name as user_name, vu.name as voided_by_name
      FROM attestation a
      JOIN app_user u ON a.attested_by_user_id = u.id
      LEFT JOIN app_user vu ON a.voided_by_user_id = vu.id
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
        voidedAt: row.voided_at?.toISOString() || null,
        voidedByUserId: row.voided_by_user_id,
        voidedByName: row.voided_by_name,
      })),
    });
  });

  /**
   * POST /readiness/attestations/:id/void
   * Void an attestation (reversible attestation)
   */
  fastify.post('/attestations/:id/void', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: { reason?: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId, userId, role } = request.user;
    const body = request.body as { reason?: string } || {};

    // Get the attestation
    const attestationResult = await query<{
      id: string;
      case_id: string;
      type: string;
      attested_by_user_id: string;
      voided_at: Date | null;
    }>(`
      SELECT id, case_id, type, attested_by_user_id, voided_at
      FROM attestation
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (attestationResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Attestation not found' });
    }

    const attestation = attestationResult.rows[0];

    // Check if already voided
    if (attestation.voided_at) {
      return reply.status(400).send({ error: 'Attestation already voided' });
    }

    // Role-based authorization (same roles that can create can void)
    if (attestation.type === 'SURGEON_ACKNOWLEDGMENT') {
      // Only the surgeon who created it or admin can void
      if (role !== 'ADMIN' && attestation.attested_by_user_id !== userId) {
        return reply.status(403).send({
          error: 'Only the attesting surgeon or admin can void this attestation',
        });
      }
    } else if (attestation.type === 'CASE_READINESS') {
      // Only staff roles can void readiness attestations
      const allowedRoles = ['ADMIN', 'CIRCULATOR', 'INVENTORY_TECH'];
      if (!allowedRoles.includes(role)) {
        return reply.status(403).send({
          error: 'Only authorized staff can void readiness attestations',
        });
      }
    }

    // Void the attestation
    await query(`
      UPDATE attestation
      SET voided_at = NOW(), voided_by_user_id = $1
      WHERE id = $2
    `, [userId, id]);

    // Get case scheduled date for cache refresh
    const caseResult = await query<{ scheduled_date: Date }>(`
      SELECT scheduled_date FROM surgical_case WHERE id = $1
    `, [attestation.case_id]);

    if (caseResult.rows.length > 0) {
      await updateReadinessCache(facilityId, caseResult.rows[0].scheduled_date);
    }

    // Get user name for response
    const userResult = await query<{ name: string }>(`
      SELECT name FROM app_user WHERE id = $1
    `, [userId]);

    return reply.send({
      success: true,
      attestationId: id,
      voidedAt: new Date().toISOString(),
      voidedByUserId: userId,
      voidedByName: userResult.rows[0]?.name || 'Unknown',
      reason: body.reason || null,
    });
  });

  /**
   * GET /readiness/cases/:id/verification
   * Get detailed item verification status for a case
   * Used for scanner-based verification workflow
   */
  fastify.get('/cases/:id/verification', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id: caseId } = request.params;
    const { facilityId } = request.user;

    // Verify case exists and get details
    const caseResult = await query<{
      id: string;
      procedure_name: string;
      surgeon_name: string;
      scheduled_date: Date;
      scheduled_time: string | null;
    }>(`
      SELECT sc.id, sc.procedure_name, u.name as surgeon_name,
             sc.scheduled_date, sc.scheduled_time
      FROM surgical_case sc
      JOIN app_user u ON sc.surgeon_id = u.id
      WHERE sc.id = $1 AND sc.facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Case not found' });
    }

    const caseData = caseResult.rows[0];

    // Get case requirements with catalog info
    const requirementsResult = await query<{
      id: string;
      catalog_id: string;
      catalog_name: string;
      category: string;
      quantity: number;
      requires_sterility: boolean;
    }>(`
      SELECT cr.id, cr.catalog_id, ic.name as catalog_name, ic.category,
             cr.quantity, ic.requires_sterility
      FROM case_requirement cr
      JOIN item_catalog ic ON cr.catalog_id = ic.id
      WHERE cr.case_id = $1
      ORDER BY ic.name
    `, [caseId]);

    // For each requirement, get matching inventory items
    const requirements = await Promise.all(
      requirementsResult.rows.map(async (req) => {
        // Get inventory items for this catalog item
        const itemsResult = await query<{
          id: string;
          barcode: string | null;
          serial_number: string | null;
          location_name: string | null;
          sterility_status: string;
          sterility_expires_at: Date | null;
          availability_status: string;
          reserved_for_case_id: string | null;
          last_verified_at: Date | null;
          last_verified_by_name: string | null;
        }>(`
          SELECT ii.id, ii.barcode, ii.serial_number, l.name as location_name,
                 ii.sterility_status, ii.sterility_expires_at,
                 ii.availability_status, ii.reserved_for_case_id,
                 ii.last_verified_at, u.name as last_verified_by_name
          FROM inventory_item ii
          LEFT JOIN location l ON ii.location_id = l.id
          LEFT JOIN app_user u ON ii.last_verified_by_user_id = u.id
          WHERE ii.catalog_id = $1 AND ii.facility_id = $2
            AND (ii.availability_status = 'AVAILABLE'
                 OR (ii.availability_status = 'RESERVED' AND ii.reserved_for_case_id = $3))
          ORDER BY ii.last_verified_at DESC NULLS LAST
        `, [req.catalog_id, facilityId, caseId]);

        // Compute verification stats
        const items = itemsResult.rows;
        const verifiedCount = items.filter(i => i.last_verified_at !== null).length;
        const cutoffDate = new Date(caseData.scheduled_date);

        // Check sterility for items that require it
        const suitableItems = items.filter(item => {
          if (req.requires_sterility) {
            if (item.sterility_status !== 'STERILE') return false;
            if (item.sterility_expires_at && item.sterility_expires_at < cutoffDate) return false;
          }
          return item.last_verified_at !== null;
        });

        return {
          id: req.id,
          catalogId: req.catalog_id,
          catalogName: req.catalog_name,
          category: req.category,
          requiredQuantity: req.quantity,
          requiresSterility: req.requires_sterility,
          availableCount: items.length,
          verifiedCount,
          suitableCount: suitableItems.length,
          isSatisfied: suitableItems.length >= req.quantity,
          items: items.map(item => ({
            id: item.id,
            barcode: item.barcode,
            serialNumber: item.serial_number,
            locationName: item.location_name,
            sterilityStatus: item.sterility_status,
            sterilityExpiresAt: item.sterility_expires_at?.toISOString() || null,
            availabilityStatus: item.availability_status,
            isReservedForThisCase: item.reserved_for_case_id === caseId,
            lastVerifiedAt: item.last_verified_at?.toISOString() || null,
            lastVerifiedByName: item.last_verified_by_name,
            isVerified: item.last_verified_at !== null,
          })),
        };
      })
    );

    // Compute overall stats
    const totalRequired = requirements.reduce((sum, r) => sum + r.requiredQuantity, 0);
    const totalVerified = requirements.reduce((sum, r) => sum + Math.min(r.verifiedCount, r.requiredQuantity), 0);
    const allSatisfied = requirements.every(r => r.isSatisfied);

    return reply.send({
      caseId,
      procedureName: caseData.procedure_name,
      surgeonName: caseData.surgeon_name,
      scheduledDate: formatDateLocal(caseData.scheduled_date),
      scheduledTime: caseData.scheduled_time,
      requirements,
      summary: {
        totalRequirements: requirements.length,
        satisfiedRequirements: requirements.filter(r => r.isSatisfied).length,
        totalRequired,
        totalVerified,
        allSatisfied,
        readinessState: allSatisfied ? 'GREEN' : (totalVerified > 0 ? 'ORANGE' : 'RED'),
      },
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
      date: formatDateLocal(targetDate),
    });
  });
}
