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
} from '../schemas/index.js';
import { requireScheduler, requireSurgeon } from '../plugins/auth.js';

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /cases
   * List cases (with optional date filter)
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { date?: string; status?: string };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { date, status } = request.query;

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

    sql += ` ORDER BY c.scheduled_date, c.scheduled_time NULLS LAST`;

    interface CaseRow {
      id: string;
      facility_id: string;
      scheduled_date: string;
      scheduled_time: string | null;
      surgeon_id: string;
      surgeon_name: string;
      patient_mrn: string | null;
      procedure_name: string;
      preference_card_version_id: string | null;
      status: string;
      notes: string | null;
      created_at: Date;
      updated_at: Date;
    }
    const result = await query<CaseRow>(sql, params);

    return reply.send({
      cases: result.rows.map(row => ({
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  });

  /**
   * POST /cases
   * Create a new case
   */
  fastify.post('/', {
    preHandler: [requireScheduler],
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
      // Create case
      const caseResult = await client.query(`
        INSERT INTO surgical_case (
          facility_id, scheduled_date, scheduled_time, surgeon_id,
          patient_mrn, procedure_name, preference_card_version_id, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8)
        RETURNING *
      `, [
        facilityId,
        data.scheduledDate,
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

    return reply.status(201).send({ case: result });
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

    interface CaseDetailRow {
      id: string;
      facility_id: string;
      scheduled_date: string;
      scheduled_time: string | null;
      surgeon_id: string;
      surgeon_name: string;
      patient_mrn: string | null;
      procedure_name: string;
      preference_card_version_id: string | null;
      status: string;
      notes: string | null;
      created_at: Date;
      updated_at: Date;
    }
    const result = await query<CaseDetailRow>(`
      SELECT c.*, u.name as surgeon_name
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.id = $1 AND c.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case not found' });
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

    const row = result.rows[0];
    return reply.send({
      case: {
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
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
   * Update case
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireScheduler],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateCaseRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

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

    values.push(id, facilityId);

    const result = await query(`
      UPDATE surgical_case
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case not found' });
    }

    return reply.send({ case: result.rows[0] });
  });

  /**
   * POST /cases/:id/preference-card
   * Select preference card for case (and optionally copy its items)
   */
  fastify.post<{ Params: { id: string } }>('/:id/preference-card', {
    preHandler: [requireScheduler],
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
      return reply.status(404).send({ error: 'Case not found' });
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
      return reply.status(404).send({ error: 'Case not found' });
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
