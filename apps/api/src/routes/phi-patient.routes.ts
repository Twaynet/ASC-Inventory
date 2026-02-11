/**
 * PHI Patient Routes — Phase 6A: Patient Identity Domain
 *
 * LAW Reference: PHI_PHASE_6_IDENTITY_LAW.md
 *
 * Rules:
 * - All routes require PHI_CLINICAL classification (read = PHI_CLINICAL_ACCESS)
 * - Write operations additionally require PHI_WRITE_CLINICAL capability
 * - Patient identity is facility-scoped
 * - No PHI in error messages or logs
 * - All access is audited via phi-guard
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import { ok, fail } from '../utils/reply.js';
import { requirePhiAccess } from '../plugins/phi-guard.js';
import { deriveCapabilities, type UserRole } from '@asc/domain';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if the requesting user has PHI_WRITE_CLINICAL capability.
 * The phi-guard already enforces PHI_CLINICAL_ACCESS for read;
 * write operations need this additional gate.
 */
function hasWriteCapability(roles: UserRole[]): boolean {
  return deriveCapabilities(roles).includes('PHI_WRITE_CLINICAL');
}

function normalizeRoles(user: { role: UserRole; roles?: UserRole[] }): UserRole[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
}

// ============================================================================
// Routes
// ============================================================================

export async function phiPatientRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /phi-patient/by-case/:caseId
   * Get patient identity linked to a surgical case.
   * Returns null patient field if no patient is linked.
   */
  fastify.get<{ Params: { caseId: string } }>('/by-case/:caseId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId } = request.user;

    const result = await query<{
      patient_id: string | null;
      first_name: string | null;
      last_name: string | null;
      date_of_birth: string | null;
      mrn: string | null;
    }>(`
      SELECT p.id as patient_id, p.first_name, p.last_name, p.date_of_birth, p.mrn
      FROM surgical_case sc
      LEFT JOIN patient p ON sc.patient_id = p.id
      WHERE sc.id = $1 AND sc.facility_id = $2
    `, [caseId, facilityId]);

    if (result.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const row = result.rows[0];
    const patient = row.patient_id ? {
      id: row.patient_id,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      mrn: row.mrn,
    } : null;

    return ok(reply, { patient });
  });

  /**
   * GET /phi-patient/lookup
   * Lookup patient by MRN within the user's facility.
   * Query param: ?mrn=...
   */
  fastify.get<{ Querystring: { mrn: string } }>('/lookup', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL')],
  }, async (request, reply) => {
    const { mrn } = request.query;
    const { facilityId } = request.user;

    if (!mrn || typeof mrn !== 'string' || mrn.trim().length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'mrn query parameter is required', 400);
    }

    const result = await query<{
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string;
      mrn: string;
    }>(`
      SELECT id, first_name, last_name, date_of_birth, mrn
      FROM patient
      WHERE facility_id = $1 AND mrn = $2
    `, [facilityId, mrn.trim()]);

    if (result.rows.length === 0) {
      return ok(reply, { patient: null });
    }

    const row = result.rows[0];
    return ok(reply, {
      patient: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        mrn: row.mrn,
      },
    });
  });

  /**
   * POST /phi-patient
   * Create a new patient identity record.
   * Requires PHI_WRITE_CLINICAL capability (ADMIN only).
   */
  fastify.post<{
    Body: { firstName: string; lastName: string; dateOfBirth: string; mrn: string };
  }>('/', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL')],
  }, async (request, reply) => {
    const roles = normalizeRoles(request.user);
    if (!hasWriteCapability(roles)) {
      return fail(reply, 'FORBIDDEN', 'PHI write access required', 403);
    }

    const { facilityId } = request.user;
    const { firstName, lastName, dateOfBirth, mrn } = request.body;

    // Validate required fields
    if (!firstName?.trim() || !lastName?.trim() || !dateOfBirth?.trim() || !mrn?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'firstName, lastName, dateOfBirth, and mrn are required', 400);
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return fail(reply, 'VALIDATION_ERROR', 'dateOfBirth must be in YYYY-MM-DD format', 400);
    }

    // Check for duplicate MRN within facility
    const existing = await query<{ id: string }>(`
      SELECT id FROM patient WHERE facility_id = $1 AND mrn = $2
    `, [facilityId, mrn.trim()]);

    if (existing.rows.length > 0) {
      return fail(reply, 'CONFLICT', 'A patient with this MRN already exists at this facility', 409);
    }

    const result = await query<{
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string;
      mrn: string;
    }>(`
      INSERT INTO patient (facility_id, first_name, last_name, date_of_birth, mrn)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, first_name, last_name, date_of_birth, mrn
    `, [facilityId, firstName.trim(), lastName.trim(), dateOfBirth, mrn.trim()]);

    const row = result.rows[0];
    return ok(reply, {
      patient: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        mrn: row.mrn,
      },
    }, 201);
  });

  /**
   * PUT /phi-patient/:patientId
   * Update a patient identity record.
   * Requires PHI_WRITE_CLINICAL capability (ADMIN only).
   */
  fastify.put<{
    Params: { patientId: string };
    Body: { firstName?: string; lastName?: string; dateOfBirth?: string; mrn?: string };
  }>('/:patientId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL')],
  }, async (request, reply) => {
    const roles = normalizeRoles(request.user);
    if (!hasWriteCapability(roles)) {
      return fail(reply, 'FORBIDDEN', 'PHI write access required', 403);
    }

    const { facilityId } = request.user;
    const { patientId } = request.params;
    const { firstName, lastName, dateOfBirth, mrn } = request.body;

    // Validate date format if provided
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return fail(reply, 'VALIDATION_ERROR', 'dateOfBirth must be in YYYY-MM-DD format', 400);
    }

    // Verify patient exists and belongs to facility
    const existing = await query<{ id: string }>(`
      SELECT id FROM patient WHERE id = $1 AND facility_id = $2
    `, [patientId, facilityId]);

    if (existing.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Patient not found', 404);
    }

    // If MRN is being changed, check for duplicates
    if (mrn) {
      const duplicate = await query<{ id: string }>(`
        SELECT id FROM patient WHERE facility_id = $1 AND mrn = $2 AND id != $3
      `, [facilityId, mrn.trim(), patientId]);

      if (duplicate.rows.length > 0) {
        return fail(reply, 'CONFLICT', 'A patient with this MRN already exists at this facility', 409);
      }
    }

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (firstName?.trim()) { sets.push(`first_name = $${paramIdx++}`); values.push(firstName.trim()); }
    if (lastName?.trim()) { sets.push(`last_name = $${paramIdx++}`); values.push(lastName.trim()); }
    if (dateOfBirth) { sets.push(`date_of_birth = $${paramIdx++}`); values.push(dateOfBirth); }
    if (mrn?.trim()) { sets.push(`mrn = $${paramIdx++}`); values.push(mrn.trim()); }

    if (sets.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'At least one field must be provided', 400);
    }

    values.push(patientId, facilityId);

    const result = await query<{
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string;
      mrn: string;
    }>(`
      UPDATE patient SET ${sets.join(', ')}
      WHERE id = $${paramIdx++} AND facility_id = $${paramIdx}
      RETURNING id, first_name, last_name, date_of_birth, mrn
    `, values);

    const row = result.rows[0];
    return ok(reply, {
      patient: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        mrn: row.mrn,
      },
    });
  });

  /**
   * PUT /phi-patient/link-case/:caseId
   * Link a patient to a surgical case (or unlink by passing patientId: null).
   * Requires PHI_WRITE_CLINICAL capability (ADMIN only).
   */
  fastify.put<{
    Params: { caseId: string };
    Body: { patientId: string | null };
  }>('/link-case/:caseId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const roles = normalizeRoles(request.user);
    if (!hasWriteCapability(roles)) {
      return fail(reply, 'FORBIDDEN', 'PHI write access required', 403);
    }

    const { facilityId } = request.user;
    const { caseId } = request.params;
    const { patientId } = request.body;

    // Verify case exists and belongs to facility
    const caseResult = await query<{ id: string }>(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    // If linking (not unlinking), verify patient exists and belongs to same facility
    if (patientId) {
      const patientResult = await query<{ id: string }>(`
        SELECT id FROM patient WHERE id = $1 AND facility_id = $2
      `, [patientId, facilityId]);

      if (patientResult.rows.length === 0) {
        return fail(reply, 'NOT_FOUND', 'Patient not found', 404);
      }
    }

    await query(`
      UPDATE surgical_case SET patient_id = $1 WHERE id = $2 AND facility_id = $3
    `, [patientId, caseId, facilityId]);

    return ok(reply, { linked: patientId !== null });
  });
}
