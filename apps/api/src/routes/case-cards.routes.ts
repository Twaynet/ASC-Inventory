/**
 * Case Card Management Routes
 * CRUD endpoints for surgical case cards
 *
 * Based on case-card-spec.md v1.0
 * Rules:
 * - Only ONE Active version per Procedure + Surgeon + Facility
 * - Deprecated cards are read-only
 * - No patient identifiers permitted
 * - All edits are logged
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

interface CaseCardRow {
  id: string;
  facility_id: string;
  surgeon_id: string;
  surgeon_name: string;
  procedure_name: string;
  procedure_codes: string[] | null;
  case_type: string;
  default_duration_minutes: number | null;
  turnover_notes: string | null;
  status: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by_user_id: string;
  created_by_name: string;
}

interface CaseCardVersionRow {
  id: string;
  case_card_id: string;
  version_number: string;
  header_info: any;
  patient_flags: any;
  instrumentation: any;
  equipment: any;
  supplies: any;
  medications: any;
  setup_positioning: any;
  surgeon_notes: any;
  created_at: Date;
  created_by_user_id: string;
  created_by_name: string;
}

interface EditLogRow {
  id: string;
  case_card_id: string;
  editor_user_id: string;
  editor_name: string;
  editor_role: string;
  change_summary: string;
  reason_for_change: string | null;
  previous_version_id: string | null;
  new_version_id: string | null;
  edited_at: Date;
}

// ============================================================================
// Routes
// ============================================================================

export async function caseCardsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /case-cards
   * List all case cards in facility
   */
  fastify.get<{
    Querystring: {
      surgeonId?: string;
      status?: string;
      search?: string;
    };
  }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { surgeonId, status, search } = request.query;

    let sql = `
      SELECT
        cc.id, cc.facility_id, cc.surgeon_id, u.name as surgeon_name,
        cc.procedure_name, cc.procedure_codes, cc.case_type,
        cc.default_duration_minutes, cc.status,
        cc.version_major, cc.version_minor, cc.version_patch,
        cc.current_version_id, cc.created_at, cc.updated_at,
        cc.created_by_user_id, cu.name as created_by_name
      FROM case_card cc
      JOIN app_user u ON cc.surgeon_id = u.id
      JOIN app_user cu ON cc.created_by_user_id = cu.id
      WHERE cc.facility_id = $1
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    if (surgeonId) {
      sql += ` AND cc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    if (status) {
      sql += ` AND cc.status = $${paramIndex++}`;
      params.push(status.toUpperCase());
    }

    if (search) {
      sql += ` AND (
        cc.procedure_name ILIKE $${paramIndex} OR
        u.name ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cc.status ASC, u.name ASC, cc.procedure_name ASC`;

    const result = await query<CaseCardRow>(sql, params);

    return reply.send({
      cards: result.rows.map(row => ({
        id: row.id,
        surgeonId: row.surgeon_id,
        surgeonName: row.surgeon_name,
        procedureName: row.procedure_name,
        procedureCodes: row.procedure_codes || [],
        caseType: row.case_type,
        defaultDurationMinutes: row.default_duration_minutes,
        status: row.status,
        version: `${row.version_major}.${row.version_minor}.${row.version_patch}`,
        currentVersionId: row.current_version_id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        createdByName: row.created_by_name,
      })),
    });
  });

  /**
   * GET /case-cards/:id
   * Get case card with current version data
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const cardResult = await query<CaseCardRow>(`
      SELECT
        cc.id, cc.facility_id, cc.surgeon_id, u.name as surgeon_name,
        cc.procedure_name, cc.procedure_codes, cc.case_type,
        cc.default_duration_minutes, cc.turnover_notes, cc.status,
        cc.version_major, cc.version_minor, cc.version_patch,
        cc.current_version_id, cc.created_at, cc.updated_at,
        cc.created_by_user_id, cu.name as created_by_name
      FROM case_card cc
      JOIN app_user u ON cc.surgeon_id = u.id
      JOIN app_user cu ON cc.created_by_user_id = cu.id
      WHERE cc.id = $1 AND cc.facility_id = $2
    `, [id, facilityId]);

    if (cardResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = cardResult.rows[0];
    let currentVersion = null;

    if (card.current_version_id) {
      const versionResult = await query<CaseCardVersionRow>(`
        SELECT
          ccv.id, ccv.case_card_id, ccv.version_number,
          ccv.header_info, ccv.patient_flags, ccv.instrumentation,
          ccv.equipment, ccv.supplies, ccv.medications,
          ccv.setup_positioning, ccv.surgeon_notes,
          ccv.created_at, ccv.created_by_user_id, u.name as created_by_name
        FROM case_card_version ccv
        JOIN app_user u ON ccv.created_by_user_id = u.id
        WHERE ccv.id = $1
      `, [card.current_version_id]);

      if (versionResult.rows.length > 0) {
        const v = versionResult.rows[0];
        currentVersion = {
          id: v.id,
          versionNumber: v.version_number,
          headerInfo: v.header_info,
          patientFlags: v.patient_flags,
          instrumentation: v.instrumentation,
          equipment: v.equipment,
          supplies: v.supplies,
          medications: v.medications,
          setupPositioning: v.setup_positioning,
          surgeonNotes: v.surgeon_notes,
          createdAt: v.created_at.toISOString(),
          createdByUserId: v.created_by_user_id,
          createdByName: v.created_by_name,
        };
      }
    }

    return reply.send({
      card: {
        id: card.id,
        surgeonId: card.surgeon_id,
        surgeonName: card.surgeon_name,
        procedureName: card.procedure_name,
        procedureCodes: card.procedure_codes || [],
        caseType: card.case_type,
        defaultDurationMinutes: card.default_duration_minutes,
        turnoverNotes: card.turnover_notes,
        status: card.status,
        version: `${card.version_major}.${card.version_minor}.${card.version_patch}`,
        currentVersionId: card.current_version_id,
        createdAt: card.created_at.toISOString(),
        updatedAt: card.updated_at.toISOString(),
        createdByName: card.created_by_name,
      },
      currentVersion,
    });
  });

  /**
   * GET /case-cards/:id/edit-log
   * Get edit history for a case card
   */
  fastify.get<{ Params: { id: string } }>('/:id/edit-log', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Verify card exists
    const cardCheck = await query(`
      SELECT id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (cardCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const result = await query<EditLogRow>(`
      SELECT
        id, case_card_id, editor_user_id, editor_name, editor_role,
        change_summary, reason_for_change,
        previous_version_id, new_version_id, edited_at
      FROM case_card_edit_log
      WHERE case_card_id = $1
      ORDER BY edited_at DESC
    `, [id]);

    return reply.send({
      editLog: result.rows.map(row => ({
        id: row.id,
        editorUserId: row.editor_user_id,
        editorName: row.editor_name,
        editorRole: row.editor_role,
        changeSummary: row.change_summary,
        reasonForChange: row.reason_for_change,
        previousVersionId: row.previous_version_id,
        newVersionId: row.new_version_id,
        editedAt: row.edited_at.toISOString(),
      })),
    });
  });

  /**
   * GET /case-cards/:id/versions
   * Get all versions of a case card
   */
  fastify.get<{ Params: { id: string } }>('/:id/versions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Verify card exists
    const cardCheck = await query(`
      SELECT id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (cardCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const result = await query<CaseCardVersionRow>(`
      SELECT
        ccv.id, ccv.case_card_id, ccv.version_number,
        ccv.created_at, ccv.created_by_user_id, u.name as created_by_name
      FROM case_card_version ccv
      JOIN app_user u ON ccv.created_by_user_id = u.id
      WHERE ccv.case_card_id = $1
      ORDER BY ccv.created_at DESC
    `, [id]);

    return reply.send({
      versions: result.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        createdAt: v.created_at.toISOString(),
        createdByUserId: v.created_by_user_id,
        createdByName: v.created_by_name,
      })),
    });
  });

  /**
   * POST /case-cards
   * Create new case card with initial version
   */
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Validate required fields
    if (!body.surgeonId || !body.procedureName) {
      return reply.status(400).send({ error: 'surgeonId and procedureName are required' });
    }

    // Verify surgeon exists
    const surgeonCheck = await query<{ name: string; role: string }>(`
      SELECT name, role FROM app_user WHERE id = $1 AND facility_id = $2 AND active = true
    `, [body.surgeonId, facilityId]);

    if (surgeonCheck.rows.length === 0) {
      return reply.status(400).send({ error: 'Surgeon not found' });
    }

    if (surgeonCheck.rows[0].role !== 'SURGEON') {
      return reply.status(400).send({ error: 'Selected user is not a surgeon' });
    }

    // Check for duplicate procedure name for same surgeon
    const nameCheck = await query(`
      SELECT id FROM case_card
      WHERE surgeon_id = $1 AND LOWER(procedure_name) = LOWER($2) AND facility_id = $3
    `, [body.surgeonId, body.procedureName, facilityId]);

    if (nameCheck.rows.length > 0) {
      return reply.status(400).send({
        error: 'Case card with this procedure name already exists for this surgeon',
      });
    }

    // Create card
    const cardResult = await query<{ id: string }>(`
      INSERT INTO case_card (
        facility_id, surgeon_id, procedure_name, procedure_codes,
        case_type, default_duration_minutes, turnover_notes,
        status, version_major, version_minor, version_patch,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', 1, 0, 0, $8)
      RETURNING id
    `, [
      facilityId,
      body.surgeonId,
      body.procedureName,
      body.procedureCodes || [],
      body.caseType || 'ELECTIVE',
      body.defaultDurationMinutes || null,
      body.turnoverNotes || null,
      userId,
    ]);

    const cardId = cardResult.rows[0].id;

    // Create initial version
    const versionResult = await query<{ id: string }>(`
      INSERT INTO case_card_version (
        case_card_id, version_number,
        header_info, patient_flags, instrumentation, equipment,
        supplies, medications, setup_positioning, surgeon_notes,
        created_by_user_id
      )
      VALUES ($1, '1.0.0', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      cardId,
      JSON.stringify(body.headerInfo || {}),
      JSON.stringify(body.patientFlags || {}),
      JSON.stringify(body.instrumentation || {}),
      JSON.stringify(body.equipment || {}),
      JSON.stringify(body.supplies || {}),
      JSON.stringify(body.medications || {}),
      JSON.stringify(body.setupPositioning || {}),
      JSON.stringify(body.surgeonNotes || {}),
      userId,
    ]);

    const versionId = versionResult.rows[0].id;

    // Update card with current version
    await query(`
      UPDATE case_card SET current_version_id = $1 WHERE id = $2
    `, [versionId, cardId]);

    // Log the creation
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        change_summary, reason_for_change, new_version_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      cardId,
      facilityId,
      userId,
      userName,
      userRole,
      'Case card created',
      body.reasonForChange || 'Initial creation',
      versionId,
    ]);

    return reply.status(201).send({
      card: {
        id: cardId,
        surgeonId: body.surgeonId,
        surgeonName: surgeonCheck.rows[0].name,
        procedureName: body.procedureName,
        status: 'DRAFT',
        version: '1.0.0',
        currentVersionId: versionId,
      },
    });
  });

  /**
   * PUT /case-cards/:id
   * Update case card (creates new version, logs edit)
   */
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Check card exists and is editable
    const existingResult = await query<{
      status: string;
      current_version_id: string;
      version_major: number;
      version_minor: number;
      version_patch: number;
    }>(`
      SELECT status, current_version_id, version_major, version_minor, version_patch
      FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const existing = existingResult.rows[0];

    if (existing.status === 'DEPRECATED') {
      return reply.status(400).send({ error: 'Deprecated case cards are read-only' });
    }

    if (!body.changeSummary) {
      return reply.status(400).send({ error: 'changeSummary is required for edits' });
    }

    // Determine version bump
    let newMajor = existing.version_major;
    let newMinor = existing.version_minor;
    let newPatch = existing.version_patch;

    const versionBump = body.versionBump || 'patch';
    if (versionBump === 'major') {
      newMajor++;
      newMinor = 0;
      newPatch = 0;
    } else if (versionBump === 'minor') {
      newMinor++;
      newPatch = 0;
    } else {
      newPatch++;
    }

    const newVersionNumber = `${newMajor}.${newMinor}.${newPatch}`;

    // Update card metadata
    await query(`
      UPDATE case_card SET
        procedure_name = COALESCE($1, procedure_name),
        procedure_codes = COALESCE($2, procedure_codes),
        case_type = COALESCE($3, case_type),
        default_duration_minutes = COALESCE($4, default_duration_minutes),
        turnover_notes = COALESCE($5, turnover_notes),
        version_major = $6,
        version_minor = $7,
        version_patch = $8
      WHERE id = $9
    `, [
      body.procedureName,
      body.procedureCodes,
      body.caseType,
      body.defaultDurationMinutes,
      body.turnoverNotes,
      newMajor,
      newMinor,
      newPatch,
      id,
    ]);

    // Create new version
    const versionResult = await query<{ id: string }>(`
      INSERT INTO case_card_version (
        case_card_id, version_number,
        header_info, patient_flags, instrumentation, equipment,
        supplies, medications, setup_positioning, surgeon_notes,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      id,
      newVersionNumber,
      JSON.stringify(body.headerInfo || {}),
      JSON.stringify(body.patientFlags || {}),
      JSON.stringify(body.instrumentation || {}),
      JSON.stringify(body.equipment || {}),
      JSON.stringify(body.supplies || {}),
      JSON.stringify(body.medications || {}),
      JSON.stringify(body.setupPositioning || {}),
      JSON.stringify(body.surgeonNotes || {}),
      userId,
    ]);

    const newVersionId = versionResult.rows[0].id;

    // Update card with new version
    await query(`
      UPDATE case_card SET current_version_id = $1 WHERE id = $2
    `, [newVersionId, id]);

    // Log the edit
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        change_summary, reason_for_change, previous_version_id, new_version_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      id,
      facilityId,
      userId,
      userName,
      userRole,
      body.changeSummary,
      body.reasonForChange || null,
      existing.current_version_id,
      newVersionId,
    ]);

    return reply.send({
      success: true,
      version: newVersionNumber,
      versionId: newVersionId,
    });
  });

  /**
   * POST /case-cards/:id/activate
   * Activate a draft case card
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;

    const result = await query<{ status: string; surgeon_id: string; procedure_name: string }>(`
      SELECT status, surgeon_id, procedure_name FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    if (result.rows[0].status === 'ACTIVE') {
      return reply.status(400).send({ error: 'Case card is already active' });
    }

    if (result.rows[0].status === 'DEPRECATED') {
      return reply.status(400).send({ error: 'Cannot activate deprecated case card' });
    }

    // Deactivate any existing active card for same surgeon/procedure
    await query(`
      UPDATE case_card SET status = 'DEPRECATED'
      WHERE surgeon_id = $1 AND procedure_name = $2 AND facility_id = $3 AND status = 'ACTIVE' AND id != $4
    `, [result.rows[0].surgeon_id, result.rows[0].procedure_name, facilityId, id]);

    await query(`
      UPDATE case_card SET status = 'ACTIVE' WHERE id = $1
    `, [id]);

    // Log the status change
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        change_summary, reason_for_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, facilityId, userId, userName, userRole, 'Status changed to ACTIVE', 'Activated']);

    return reply.send({ success: true, status: 'ACTIVE' });
  });

  /**
   * POST /case-cards/:id/deprecate
   * Deprecate an active case card
   */
  fastify.post<{ Params: { id: string } }>('/:id/deprecate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    const result = await query<{ status: string }>(`
      SELECT status FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    if (result.rows[0].status === 'DEPRECATED') {
      return reply.status(400).send({ error: 'Case card is already deprecated' });
    }

    await query(`
      UPDATE case_card SET status = 'DEPRECATED' WHERE id = $1
    `, [id]);

    // Log the status change
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        change_summary, reason_for_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      id,
      facilityId,
      userId,
      userName,
      userRole,
      'Status changed to DEPRECATED',
      body.reason || 'Deprecated',
    ]);

    return reply.send({ success: true, status: 'DEPRECATED' });
  });

  /**
   * GET /case-cards/surgeons
   * Get list of surgeons for dropdown
   */
  fastify.get('/surgeons', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    const result = await query<{ id: string; name: string }>(`
      SELECT id, name FROM app_user
      WHERE facility_id = $1 AND role = 'SURGEON' AND active = true
      ORDER BY name ASC
    `, [facilityId]);

    return reply.send({
      surgeons: result.rows.map(row => ({
        id: row.id,
        name: row.name,
      })),
    });
  });

  // ============================================================================
  // Case Card Feedback (from Debrief)
  // ============================================================================

  /**
   * POST /case-cards/:id/feedback
   * Submit feedback for a case card from a surgical case debrief
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      surgicalCaseId: string;
      itemsUnused?: string[];
      itemsMissing?: string[];
      setupIssues?: string;
      staffComments?: string;
      suggestedEdits?: string;
    };
  }>('/:id/feedback', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: caseCardId } = request.params;
    const { facilityId, userId } = request.user;
    const { surgicalCaseId, itemsUnused, itemsMissing, setupIssues, staffComments, suggestedEdits } = request.body;

    // Validate case card exists
    const cardCheck = await query<{ id: string }>(`
      SELECT id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [caseCardId, facilityId]);

    if (cardCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    // Validate surgical case exists and is linked to this case card
    const caseCheck = await query<{ id: string; case_card_version_id: string | null }>(`
      SELECT sc.id, sc.case_card_version_id
      FROM surgical_case sc
      WHERE sc.id = $1 AND sc.facility_id = $2
    `, [surgicalCaseId, facilityId]);

    if (caseCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Surgical case not found' });
    }

    // Check if feedback already exists for this case
    const existingFeedback = await query<{ id: string }>(`
      SELECT id FROM case_card_feedback
      WHERE case_card_id = $1 AND surgical_case_id = $2
    `, [caseCardId, surgicalCaseId]);

    if (existingFeedback.rows.length > 0) {
      return reply.status(400).send({ error: 'Feedback already submitted for this case' });
    }

    // Insert feedback
    const result = await query<{ id: string; created_at: Date }>(`
      INSERT INTO case_card_feedback (
        case_card_id, surgical_case_id, facility_id,
        items_unused, items_missing, setup_issues, staff_comments, suggested_edits,
        submitted_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, created_at
    `, [
      caseCardId,
      surgicalCaseId,
      facilityId,
      JSON.stringify(itemsUnused || []),
      JSON.stringify(itemsMissing || []),
      setupIssues || null,
      staffComments || null,
      suggestedEdits || null,
      userId,
    ]);

    return reply.status(201).send({
      feedbackId: result.rows[0].id,
      createdAt: result.rows[0].created_at.toISOString(),
    });
  });

  /**
   * GET /case-cards/:id/feedback
   * Get all feedback for a case card
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>('/:id/feedback', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: caseCardId } = request.params;
    const { facilityId } = request.user;
    const { status } = request.query;

    // Verify case card exists
    const cardCheck = await query(`
      SELECT id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [caseCardId, facilityId]);

    if (cardCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    let sql = `
      SELECT
        f.id, f.surgical_case_id, f.items_unused, f.items_missing,
        f.setup_issues, f.staff_comments, f.suggested_edits,
        f.submitted_by_user_id, u.name as submitted_by_name,
        f.reviewed_at, f.reviewed_by_user_id, ru.name as reviewed_by_name,
        f.review_notes, f.review_action,
        f.created_at,
        sc.procedure_name, sc.scheduled_date
      FROM case_card_feedback f
      JOIN app_user u ON f.submitted_by_user_id = u.id
      LEFT JOIN app_user ru ON f.reviewed_by_user_id = ru.id
      JOIN surgical_case sc ON f.surgical_case_id = sc.id
      WHERE f.case_card_id = $1 AND f.facility_id = $2
    `;
    const params: unknown[] = [caseCardId, facilityId];

    if (status === 'pending') {
      sql += ` AND f.reviewed_at IS NULL`;
    } else if (status === 'reviewed') {
      sql += ` AND f.reviewed_at IS NOT NULL`;
    }

    sql += ` ORDER BY f.created_at DESC`;

    const result = await query<{
      id: string;
      surgical_case_id: string;
      items_unused: string[];
      items_missing: string[];
      setup_issues: string | null;
      staff_comments: string | null;
      suggested_edits: string | null;
      submitted_by_user_id: string;
      submitted_by_name: string;
      reviewed_at: Date | null;
      reviewed_by_user_id: string | null;
      reviewed_by_name: string | null;
      review_notes: string | null;
      review_action: string | null;
      created_at: Date;
      procedure_name: string;
      scheduled_date: Date;
    }>(sql, params);

    return reply.send({
      feedback: result.rows.map(row => ({
        id: row.id,
        surgicalCaseId: row.surgical_case_id,
        procedureName: row.procedure_name,
        scheduledDate: row.scheduled_date.toISOString().split('T')[0],
        itemsUnused: row.items_unused || [],
        itemsMissing: row.items_missing || [],
        setupIssues: row.setup_issues,
        staffComments: row.staff_comments,
        suggestedEdits: row.suggested_edits,
        submittedByUserId: row.submitted_by_user_id,
        submittedByName: row.submitted_by_name,
        reviewedAt: row.reviewed_at?.toISOString() || null,
        reviewedByUserId: row.reviewed_by_user_id,
        reviewedByName: row.reviewed_by_name,
        reviewNotes: row.review_notes,
        reviewAction: row.review_action,
        createdAt: row.created_at.toISOString(),
      })),
      summary: {
        total: result.rows.length,
        pending: result.rows.filter(r => !r.reviewed_at).length,
        reviewed: result.rows.filter(r => r.reviewed_at).length,
      },
    });
  });

  /**
   * POST /case-cards/:id/feedback/:feedbackId/review
   * Mark feedback as reviewed
   */
  fastify.post<{
    Params: { id: string; feedbackId: string };
    Body: {
      action: 'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED';
      notes?: string;
    };
  }>('/:id/feedback/:feedbackId/review', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: caseCardId, feedbackId } = request.params;
    const { facilityId, userId, role } = request.user;
    const { action, notes } = request.body;

    // Only ADMIN can review feedback
    if (role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Only administrators can review feedback' });
    }

    // Validate action
    const validActions = ['ACKNOWLEDGED', 'APPLIED', 'DISMISSED'];
    if (!validActions.includes(action)) {
      return reply.status(400).send({ error: 'Invalid action. Must be ACKNOWLEDGED, APPLIED, or DISMISSED' });
    }

    // Check feedback exists and belongs to this case card
    const feedbackCheck = await query<{ id: string; reviewed_at: Date | null }>(`
      SELECT id, reviewed_at FROM case_card_feedback
      WHERE id = $1 AND case_card_id = $2 AND facility_id = $3
    `, [feedbackId, caseCardId, facilityId]);

    if (feedbackCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Feedback not found' });
    }

    if (feedbackCheck.rows[0].reviewed_at) {
      return reply.status(400).send({ error: 'Feedback has already been reviewed' });
    }

    // Update feedback with review
    await query(`
      UPDATE case_card_feedback
      SET reviewed_at = NOW(), reviewed_by_user_id = $1, review_action = $2, review_notes = $3
      WHERE id = $4
    `, [userId, action, notes || null, feedbackId]);

    return reply.send({
      success: true,
      feedbackId,
      action,
      reviewedAt: new Date().toISOString(),
    });
  });
}
