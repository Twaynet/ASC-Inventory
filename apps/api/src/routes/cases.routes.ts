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
  CancelCaseRequestSchema,
} from '../schemas/index.js';
import { requireScheduler, requireSurgeon, requireAdmin } from '../plugins/auth.js';
import { canStartCase, canCompleteCase } from '../services/checklists.service.js';

interface CaseRow {
  id: string;
  facility_id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  surgeon_id: string;
  surgeon_name: string;
  patient_mrn: string | null;
  procedure_name: string;
  preference_card_version_id: string | null;
  status: string;
  notes: string | null;
  is_active: boolean;
  activated_at: Date | null;
  activated_by_user_id: string | null;
  is_cancelled: boolean;
  cancelled_at: Date | null;
  cancelled_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapCaseRow(row: CaseRow) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    surgeonId: row.surgeon_id,
    surgeonName: row.surgeon_name,
    patientMrn: row.patient_mrn,
    procedureName: row.procedure_name,
    preferenceCardVersionId: row.preference_card_version_id,
    status: row.status,
    notes: row.notes,
    isActive: row.is_active,
    activatedAt: row.activated_at?.toISOString() || null,
    activatedByUserId: row.activated_by_user_id,
    isCancelled: row.is_cancelled,
    cancelledAt: row.cancelled_at?.toISOString() || null,
    cancelledByUserId: row.cancelled_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /cases
   * List cases (with optional date filter)
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { date?: string; status?: string; active?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { date, status, active } = request.query;

    let sql = `
      SELECT c.*, u.name as surgeon_name
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (date) {
      sql += ` AND c.scheduled_date = $${params.length + 1}`;
      params.push(date);
    }

    if (status) {
      sql += ` AND c.status = $${params.length + 1}`;
      params.push(status);
    }

    if (active !== undefined) {
      sql += ` AND c.is_active = $${params.length + 1}`;
      params.push(active === 'true');
    }

    sql += ` ORDER BY c.scheduled_date NULLS LAST, c.scheduled_time NULLS LAST`;

    const result = await query<CaseRow>(sql, params);

    return reply.send({
      cases: result.rows.map(mapCaseRow),
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

    // Validate surgeon exists and belongs to facility
    const surgeonResult = await query(`
      SELECT id FROM app_user
      WHERE id = $1 AND facility_id = $2 AND role = 'SURGEON'
    `, [data.surgeonId, facilityId]);

    if (surgeonResult.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid surgeon' });
    }

    // If preference card provided, get its current version
    let preferenceCardVersionId = null;
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

    const result = await transaction(async (client) => {
      // Create case - starts as inactive (DRAFT status) until admin activates
      const caseResult = await client.query<CaseRow>(`
        INSERT INTO surgical_case (
          facility_id, scheduled_date, scheduled_time, surgeon_id,
          patient_mrn, procedure_name, preference_card_version_id, status, notes,
          is_active, is_cancelled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, false, false)
        RETURNING *, (SELECT name FROM app_user WHERE id = $4) as surgeon_name
      `, [
        facilityId,
        data.scheduledDate || null,
        data.scheduledTime || null,
        data.surgeonId,
        data.patientMrn || null,
        data.procedureName,
        preferenceCardVersionId,
        data.notes || null,
      ]);

      const newCase = caseResult.rows[0];

      // If preference card version set, copy its items to case requirements
      if (preferenceCardVersionId) {
        const versionResult = await client.query<{ items: unknown[] }>(`
          SELECT items FROM preference_card_version WHERE id = $1
        `, [preferenceCardVersionId]);

        if (versionResult.rows.length > 0) {
          const items = versionResult.rows[0].items as Array<{
            catalogId: string;
            quantity: number;
            notes?: string;
          }>;

          for (const item of items) {
            await client.query(`
              INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override, notes)
              VALUES ($1, $2, $3, false, $4)
            `, [newCase.id, item.catalogId, item.quantity, item.notes || null]);
          }
        }
      }

      return newCase;
    });

    return reply.status(201).send({ case: mapCaseRow(result) });
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

    const result = await query<CaseRow>(`
      SELECT c.*, u.name as surgeon_name
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.id = $1 AND c.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Get requirements
    interface RequirementRow {
      id: string;
      catalog_id: string;
      catalog_name: string;
      quantity: number;
      is_surgeon_override: boolean;
      notes: string | null;
    }
    const reqResult = await query<RequirementRow>(`
      SELECT cr.*, ic.name as catalog_name
      FROM case_requirement cr
      JOIN item_catalog ic ON cr.catalog_id = ic.id
      WHERE cr.case_id = $1
    `, [id]);

    return reply.send({
      case: mapCaseRow(result.rows[0]),
      requirements: reqResult.rows.map(r => ({
        id: r.id,
        catalogId: r.catalog_id,
        catalogName: r.catalog_name,
        quantity: r.quantity,
        isSurgeonOverride: r.is_surgeon_override,
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
    const existingCase = await query<{ is_active: boolean; status: string }>(`
      SELECT is_active, status FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingCase.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    const isActive = existingCase.rows[0].is_active;

    // Only ADMIN can modify date/time on active cases
    if (isActive && (data.scheduledDate !== undefined || data.scheduledTime !== undefined)) {
      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only ADMIN can modify date/time on active cases' });
      }
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.scheduledDate !== undefined) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      values.push(data.scheduledDate);
    }
    if (data.scheduledTime !== undefined) {
      updates.push(`scheduled_time = $${paramIndex++}`);
      values.push(data.scheduledTime);
    }
    if (data.surgeonId !== undefined) {
      updates.push(`surgeon_id = $${paramIndex++}`);
      values.push(data.surgeonId);
    }
    if (data.patientMrn !== undefined) {
      updates.push(`patient_mrn = $${paramIndex++}`);
      values.push(data.patientMrn);
    }
    if (data.procedureName !== undefined) {
      updates.push(`procedure_name = $${paramIndex++}`);
      values.push(data.procedureName);
    }
    if (data.preferenceCardVersionId !== undefined) {
      updates.push(`preference_card_version_id = $${paramIndex++}`);
      values.push(data.preferenceCardVersionId);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
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

    values.push(id, facilityId);

    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, values);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    return reply.send({ case: mapCaseRow(result.rows[0]) });
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
    const existingCase = await query<{ is_active: boolean; is_cancelled: boolean }>(`
      SELECT is_active, is_cancelled FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingCase.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (existingCase.rows[0].is_cancelled) {
      return reply.status(400).send({ error: 'Cannot activate a cancelled case' });
    }

    if (existingCase.rows[0].is_active) {
      return reply.status(400).send({ error: 'Case is already active' });
    }

    // Activate the case
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_active = true,
          activated_at = NOW(),
          activated_by_user_id = $3,
          scheduled_date = $4,
          scheduled_time = $5,
          status = 'SCHEDULED',
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId, userId, data.scheduledDate, data.scheduledTime || null]);

    return reply.send({ case: mapCaseRow(result.rows[0]) });
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
    const existingCase = await query<{ is_active: boolean; status: string }>(`
      SELECT is_active, status FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingCase.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (!existingCase.rows[0].is_active) {
      return reply.status(400).send({ error: 'Case is already inactive' });
    }

    // Cannot deactivate IN_PROGRESS or COMPLETED cases
    if (existingCase.rows[0].status === 'IN_PROGRESS' || existingCase.rows[0].status === 'COMPLETED') {
      return reply.status(400).send({ error: 'Cannot deactivate a case that is in progress or completed' });
    }

    // Deactivate the case
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_active = false,
          status = 'DRAFT',
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId]);

    return reply.send({ case: mapCaseRow(result.rows[0]) });
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
    const existingCase = await query<{ is_cancelled: boolean }>(`
      SELECT is_cancelled FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingCase.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (existingCase.rows[0].is_cancelled) {
      return reply.status(400).send({ error: 'Case is already cancelled' });
    }

    // Cancel the case
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_cancelled = true,
          cancelled_at = NOW(),
          cancelled_by_user_id = $3,
          status = 'CANCELLED',
          notes = CASE WHEN $4 IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Cancelled: ' || $4 ELSE notes END,
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId, userId, reason || null]);

    return reply.send({ case: mapCaseRow(result.rows[0]) });
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

    // Get case
    const caseResult = await query<{ surgeon_id: string }>(`
      SELECT surgeon_id FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    // Get preference card and verify it belongs to the surgeon
    const pcResult = await query<{ current_version_id: string | null }>(`
      SELECT current_version_id FROM preference_card
      WHERE id = $1 AND facility_id = $2 AND surgeon_id = $3
    `, [preferenceCardId, facilityId, caseResult.rows[0].surgeon_id]);

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

      // Delete existing non-override requirements
      await client.query(`
        DELETE FROM case_requirement
        WHERE case_id = $1 AND is_surgeon_override = false
      `, [id]);

      // Copy items from preference card version
      if (versionId) {
        const versionResult = await client.query<{ items: unknown[] }>(`
          SELECT items FROM preference_card_version WHERE id = $1
        `, [versionId]);

        if (versionResult.rows.length > 0) {
          const items = versionResult.rows[0].items as Array<{
            catalogId: string;
            quantity: number;
            notes?: string;
          }>;

          for (const item of items) {
            // Use ON CONFLICT to handle surgeon overrides
            await client.query(`
              INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override, notes)
              VALUES ($1, $2, $3, false, $4)
              ON CONFLICT (case_id, catalog_id) DO NOTHING
            `, [id, item.catalogId, item.quantity, item.notes || null]);
          }
        }
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
    const caseResult = await query<{ surgeon_id: string }>(`
      SELECT surgeon_id FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Procedure not found' });
    }

    if (caseResult.rows[0].surgeon_id !== userId) {
      return reply.status(403).send({ error: 'Only the assigned surgeon can modify requirements' });
    }

    await transaction(async (client) => {
      // Remove existing surgeon overrides
      await client.query(`
        DELETE FROM case_requirement
        WHERE case_id = $1 AND is_surgeon_override = true
      `, [id]);

      // Insert new requirements
      for (const req of requirements) {
        await client.query(`
          INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (case_id, catalog_id)
          DO UPDATE SET quantity = $3, is_surgeon_override = $4, notes = $5
        `, [id, req.catalogId, req.quantity, isSurgeonOverride, req.notes || null]);
      }
    });

    return reply.send({ success: true });
  });
}
