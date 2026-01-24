/**
 * Case Card Management Routes
 * CRUD endpoints for surgical case cards
 *
 * Based on:
 * - case-card-spec.md v1.0
 * - spc-governance-workflow.md v1.1
 *
 * Rules:
 * - Only ONE Active version per Procedure + Surgeon + Facility
 * - Deprecated cards are read-only
 * - Deleted cards are read-only (soft-delete tombstone)
 * - No patient identifiers permitted
 * - All edits are logged (append-only)
 * - SCHEDULER role cannot edit case cards
 * - Soft-lock prevents concurrent edits
 * - Only OWNER-SURGEON or ADMIN can deactivate
 * - Only OWNER-SURGEON can soft-delete
 */


import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

// ============================================================================
// Constants
// ============================================================================

// Roles allowed to view/edit case cards (SCHEDULER excluded per governance doc)
const CASE_CARD_ALLOWED_ROLES = ['ADMIN', 'INVENTORY_TECH', 'CIRCULATOR', 'SCRUB', 'SURGEON'];

// Lock timeout in minutes (auto-expire after inactivity)
const LOCK_TIMEOUT_MINUTES = 30;

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
  // Soft-lock fields
  locked_by_user_id: string | null;
  locked_by_name?: string | null;
  locked_at: Date | null;
  lock_expires_at: Date | null;
  // Soft-delete fields
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  delete_reason: string | null;
}

interface CaseCardVersionRow {
  id: string;
  case_card_id: string;
  version_number: string;
  header_info: Record<string, unknown>;
  patient_flags: Record<string, unknown>;
  instrumentation: Record<string, unknown>;
  equipment: Record<string, unknown>;
  supplies: Record<string, unknown>;
  medications: Record<string, unknown>;
  setup_positioning: Record<string, unknown>;
  surgeon_notes: Record<string, unknown>;
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
  action_type: string | null;
  change_summary: string;
  reason_for_change: string | null;
  previous_version_id: string | null;
  new_version_id: string | null;
  edited_at: Date;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user role is allowed to access case cards
 * Per governance doc: SCHEDULER is explicitly excluded
 */
function isRoleAllowed(role: string): boolean {
  return CASE_CARD_ALLOWED_ROLES.includes(role);
}

/**
 * Check if a lock is expired
 */
function isLockExpired(lockExpiresAt: Date | null): boolean {
  if (!lockExpiresAt) return true;
  return new Date() > new Date(lockExpiresAt);
}

/**
 * Clear expired lock from a card (in-memory check, DB updated separately)
 */
async function clearExpiredLock(cardId: string): Promise<void> {
  await query(`
    UPDATE case_card
    SET locked_by_user_id = NULL, locked_at = NULL, lock_expires_at = NULL
    WHERE id = $1 AND lock_expires_at IS NOT NULL AND NOW() > lock_expires_at
  `, [cardId]);
}

// ============================================================================
// Routes
// ============================================================================

export async function caseCardsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /case-cards
   * List all case cards in facility
   * Note: DELETED cards excluded by default unless includeDeleted=true
   */
  fastify.get<{
    Querystring: {
      surgeonId?: string;
      status?: string;
      search?: string;
      includeDeleted?: string;
    };
  }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { surgeonId, status, search, includeDeleted } = request.query;

    let sql = `
      SELECT
        cc.id, cc.facility_id, cc.surgeon_id, u.name as surgeon_name,
        cc.procedure_name, cc.procedure_codes, cc.case_type,
        cc.default_duration_minutes, cc.status,
        cc.version_major, cc.version_minor, cc.version_patch,
        cc.current_version_id, cc.created_at, cc.updated_at,
        cc.created_by_user_id, cu.name as created_by_name,
        cc.locked_by_user_id, lu.name as locked_by_name,
        cc.locked_at, cc.lock_expires_at,
        cc.deleted_at, cc.deleted_by_user_id, cc.delete_reason
      FROM case_card cc
      JOIN app_user u ON cc.surgeon_id = u.id
      JOIN app_user cu ON cc.created_by_user_id = cu.id
      LEFT JOIN app_user lu ON cc.locked_by_user_id = lu.id
      WHERE cc.facility_id = $1
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    // Exclude DELETED cards unless explicitly requested
    if (includeDeleted !== 'true') {
      sql += ` AND cc.status != 'DELETED'`;
    }

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
      cards: result.rows.map(row => {
        // Check if lock is expired
        const lockExpired = isLockExpired(row.lock_expires_at);
        const isLocked = row.locked_by_user_id && !lockExpired;

        return {
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
          // Lock info (per governance: visible to viewers)
          lock: isLocked ? {
            lockedByUserId: row.locked_by_user_id,
            lockedByName: row.locked_by_name,
            lockedAt: row.locked_at?.toISOString(),
            expiresAt: row.lock_expires_at?.toISOString(),
          } : null,
          // Soft-delete info (for audit)
          deleted: row.deleted_at ? {
            deletedAt: row.deleted_at.toISOString(),
            deletedByUserId: row.deleted_by_user_id,
            reason: row.delete_reason,
          } : null,
        };
      }),
    });
  });

  /**
   * GET /case-cards/:id
   * Get case card with current version data
   * Includes lock status per governance doc
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Clear any expired lock first
    await clearExpiredLock(id);

    const cardResult = await query<CaseCardRow>(`
      SELECT
        cc.id, cc.facility_id, cc.surgeon_id, u.name as surgeon_name,
        cc.procedure_name, cc.procedure_codes, cc.case_type,
        cc.default_duration_minutes, cc.turnover_notes, cc.status,
        cc.version_major, cc.version_minor, cc.version_patch,
        cc.current_version_id, cc.created_at, cc.updated_at,
        cc.created_by_user_id, cu.name as created_by_name,
        cc.locked_by_user_id, lu.name as locked_by_name,
        cc.locked_at, cc.lock_expires_at,
        cc.deleted_at, cc.deleted_by_user_id, cc.delete_reason
      FROM case_card cc
      JOIN app_user u ON cc.surgeon_id = u.id
      JOIN app_user cu ON cc.created_by_user_id = cu.id
      LEFT JOIN app_user lu ON cc.locked_by_user_id = lu.id
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

    // Check lock status
    const lockExpired = isLockExpired(card.lock_expires_at);
    const isLocked = card.locked_by_user_id && !lockExpired;

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
        // Lock info (per governance: visible to viewers)
        lock: isLocked ? {
          lockedByUserId: card.locked_by_user_id,
          lockedByName: card.locked_by_name,
          lockedAt: card.locked_at?.toISOString(),
          expiresAt: card.lock_expires_at?.toISOString(),
        } : null,
        // Soft-delete info (for audit)
        deleted: card.deleted_at ? {
          deletedAt: card.deleted_at.toISOString(),
          deletedByUserId: card.deleted_by_user_id,
          reason: card.delete_reason,
        } : null,
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
   * Per governance: SCHEDULER role cannot create case cards
   */
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Per governance doc: SCHEDULER is explicitly excluded from case-card editing
    if (!isRoleAllowed(userRole)) {
      return reply.status(403).send({ error: 'Your role does not have permission to create case cards' });
    }

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
   * Per governance:
   * - SCHEDULER role cannot edit
   * - Must hold lock or lock must be expired
   * - DELETED/DEPRECATED cards are read-only
   */
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Per governance doc: SCHEDULER is explicitly excluded from case-card editing
    if (!isRoleAllowed(userRole)) {
      return reply.status(403).send({ error: 'Your role does not have permission to edit case cards' });
    }

    // Clear any expired lock first
    await clearExpiredLock(id);

    // Check card exists and is editable
    const existingResult = await query<{
      status: string;
      current_version_id: string;
      version_major: number;
      version_minor: number;
      version_patch: number;
      locked_by_user_id: string | null;
      lock_expires_at: Date | null;
    }>(`
      SELECT status, current_version_id, version_major, version_minor, version_patch,
             locked_by_user_id, lock_expires_at
      FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const existing = existingResult.rows[0];

    // Check status - DEPRECATED and DELETED are read-only
    if (existing.status === 'DEPRECATED') {
      return reply.status(400).send({ error: 'Deprecated case cards are read-only' });
    }

    if (existing.status === 'DELETED') {
      return reply.status(400).send({ error: 'Deleted case cards are read-only' });
    }

    // Check soft-lock - must hold lock or lock must be expired
    if (existing.locked_by_user_id && existing.locked_by_user_id !== userId) {
      const lockExpired = isLockExpired(existing.lock_expires_at);
      if (!lockExpired) {
        return reply.status(409).send({
          error: 'Case card is locked by another user',
          lockedByUserId: existing.locked_by_user_id,
          lockExpiresAt: existing.lock_expires_at?.toISOString(),
        });
      }
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
   * Deactivate (deprecate) an active case card
   * Per governance: Only OWNER-SURGEON and/or ADMIN can deactivate
   */
  fastify.post<{ Params: { id: string } }>('/:id/deprecate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    const result = await query<{ status: string; surgeon_id: string }>(`
      SELECT status, surgeon_id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = result.rows[0];

    // Per governance doc: Only OWNER-SURGEON or ADMIN can deactivate
    const isOwnerSurgeon = card.surgeon_id === userId;
    const isAdmin = userRole === 'ADMIN';

    if (!isOwnerSurgeon && !isAdmin) {
      return reply.status(403).send({
        error: 'Only the case card owner (surgeon) or an administrator can deactivate this card',
      });
    }

    if (card.status === 'DEPRECATED') {
      return reply.status(400).send({ error: 'Case card is already deactivated' });
    }

    if (card.status === 'DELETED') {
      return reply.status(400).send({ error: 'Cannot deactivate a deleted case card' });
    }

    // Reason is required per governance doc
    if (!body.reason) {
      return reply.status(400).send({ error: 'Reason is required for deactivation' });
    }

    await query(`
      UPDATE case_card SET status = 'DEPRECATED' WHERE id = $1
    `, [id]);

    // Log the status change with action_type
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        action_type, change_summary, reason_for_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      facilityId,
      userId,
      userName,
      userRole,
      'DEACTIVATE',
      'Status changed to DEPRECATED (deactivated)',
      body.reason,
    ]);

    return reply.send({ success: true, status: 'DEPRECATED' });
  });

  /**
   * POST /case-cards/:id/delete
   * Soft-delete a case card (tombstone)
   * Per governance: Only OWNER-SURGEON can soft-delete
   */
  fastify.post<{ Params: { id: string } }>('/:id/delete', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    const result = await query<{ status: string; surgeon_id: string }>(`
      SELECT status, surgeon_id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = result.rows[0];

    // Per governance doc: Only OWNER-SURGEON can soft-delete
    const isOwnerSurgeon = card.surgeon_id === userId;

    if (!isOwnerSurgeon) {
      return reply.status(403).send({
        error: 'Only the case card owner (surgeon) can delete this card',
      });
    }

    if (card.status === 'DELETED') {
      return reply.status(400).send({ error: 'Case card is already deleted' });
    }

    // Reason is required per governance doc
    if (!body.reason) {
      return reply.status(400).send({ error: 'Reason is required for deletion' });
    }

    // Soft-delete: set status and record deletion info
    await query(`
      UPDATE case_card
      SET status = 'DELETED', deleted_at = NOW(), deleted_by_user_id = $1, delete_reason = $2
      WHERE id = $3
    `, [userId, body.reason, id]);

    // Log the deletion with action_type
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        action_type, change_summary, reason_for_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      facilityId,
      userId,
      userName,
      userRole,
      'DELETE',
      'Case card soft-deleted (tombstone)',
      body.reason,
    ]);

    return reply.send({ success: true, status: 'DELETED' });
  });

  /**
   * POST /case-cards/:id/clone
   * Seed (clone) a case card to create a new one
   * Per governance: Any allowed role may seed from any existing card
   */
  fastify.post<{ Params: { id: string } }>('/:id/clone', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: sourceId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Per governance doc: SCHEDULER is explicitly excluded
    if (!isRoleAllowed(userRole)) {
      return reply.status(403).send({ error: 'Your role does not have permission to clone case cards' });
    }

    // Validate required fields
    if (!body.targetSurgeonId) {
      return reply.status(400).send({ error: 'targetSurgeonId is required' });
    }

    // Get source card with current version
    const sourceResult = await query<CaseCardRow & { current_version_id: string }>(`
      SELECT cc.*, u.name as surgeon_name
      FROM case_card cc
      JOIN app_user u ON cc.surgeon_id = u.id
      WHERE cc.id = $1 AND cc.facility_id = $2
    `, [sourceId, facilityId]);

    if (sourceResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Source case card not found' });
    }

    const source = sourceResult.rows[0];

    // Verify target surgeon exists
    const surgeonCheck = await query<{ name: string; role: string }>(`
      SELECT name, role FROM app_user WHERE id = $1 AND facility_id = $2 AND active = true
    `, [body.targetSurgeonId, facilityId]);

    if (surgeonCheck.rows.length === 0) {
      return reply.status(400).send({ error: 'Target surgeon not found' });
    }

    if (surgeonCheck.rows[0].role !== 'SURGEON') {
      return reply.status(400).send({ error: 'Target user is not a surgeon' });
    }

    // Determine procedure name (can override or inherit)
    const newProcedureName = body.procedureName || source.procedure_name;

    // Check for duplicate
    const nameCheck = await query(`
      SELECT id FROM case_card
      WHERE surgeon_id = $1 AND LOWER(procedure_name) = LOWER($2) AND facility_id = $3
    `, [body.targetSurgeonId, newProcedureName, facilityId]);

    if (nameCheck.rows.length > 0) {
      return reply.status(400).send({
        error: 'Case card with this procedure name already exists for the target surgeon',
      });
    }

    // Get source version data
    let sourceVersion = null;
    if (source.current_version_id) {
      const versionResult = await query<CaseCardVersionRow>(`
        SELECT * FROM case_card_version WHERE id = $1
      `, [source.current_version_id]);
      if (versionResult.rows.length > 0) {
        sourceVersion = versionResult.rows[0];
      }
    }

    // Create new card (per governance: new CaseCardID, starts as DRAFT)
    const newCardResult = await query<{ id: string }>(`
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
      body.targetSurgeonId,
      newProcedureName,
      source.procedure_codes || [],
      source.case_type,
      source.default_duration_minutes,
      source.turnover_notes,
      userId,
    ]);

    const newCardId = newCardResult.rows[0].id;

    // Create initial version (cloned from source)
    const newVersionResult = await query<{ id: string }>(`
      INSERT INTO case_card_version (
        case_card_id, version_number,
        header_info, patient_flags, instrumentation, equipment,
        supplies, medications, setup_positioning, surgeon_notes,
        created_by_user_id
      )
      VALUES ($1, '1.0.0', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      newCardId,
      sourceVersion?.header_info || '{}',
      sourceVersion?.patient_flags || '{}',
      sourceVersion?.instrumentation || '{}',
      sourceVersion?.equipment || '{}',
      sourceVersion?.supplies || '{}',
      sourceVersion?.medications || '{}',
      sourceVersion?.setup_positioning || '{}',
      sourceVersion?.surgeon_notes || '{}',
      userId,
    ]);

    const newVersionId = newVersionResult.rows[0].id;

    // Update card with current version
    await query(`
      UPDATE case_card SET current_version_id = $1 WHERE id = $2
    `, [newVersionId, newCardId]);

    // Log the creation (per governance: new audit log, no provenance required)
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        action_type, change_summary, reason_for_change, new_version_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      newCardId,
      facilityId,
      userId,
      userName,
      userRole,
      'CREATE',
      `Case card created (seeded from ${source.surgeon_name}'s card)`,
      body.reason || 'Seeded from existing card',
      newVersionId,
    ]);

    return reply.status(201).send({
      card: {
        id: newCardId,
        surgeonId: body.targetSurgeonId,
        surgeonName: surgeonCheck.rows[0].name,
        procedureName: newProcedureName,
        status: 'DRAFT',
        version: '1.0.0',
        currentVersionId: newVersionId,
        clonedFrom: {
          cardId: sourceId,
          surgeonName: source.surgeon_name,
        },
      },
    });
  });

  /**
   * POST /case-cards/:id/lock
   * Acquire soft-lock for editing
   * Per governance: Lock prevents others from saving while held
   */
  fastify.post<{ Params: { id: string } }>('/:id/lock', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;

    // Per governance doc: SCHEDULER is explicitly excluded
    if (!isRoleAllowed(userRole)) {
      return reply.status(403).send({ error: 'Your role does not have permission to edit case cards' });
    }

    // Clear any expired lock first
    await clearExpiredLock(id);

    const result = await query<{
      status: string;
      locked_by_user_id: string | null;
      lock_expires_at: Date | null;
    }>(`
      SELECT status, locked_by_user_id, lock_expires_at
      FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = result.rows[0];

    // Cannot lock read-only cards
    if (card.status === 'DEPRECATED' || card.status === 'DELETED') {
      return reply.status(400).send({ error: 'Cannot lock a read-only case card' });
    }

    // Check if already locked by someone else
    if (card.locked_by_user_id && card.locked_by_user_id !== userId) {
      const lockExpired = isLockExpired(card.lock_expires_at);
      if (!lockExpired) {
        // Get lock holder name
        const holderResult = await query<{ name: string }>(`
          SELECT name FROM app_user WHERE id = $1
        `, [card.locked_by_user_id]);

        return reply.status(409).send({
          error: 'Case card is already locked by another user',
          lockedByUserId: card.locked_by_user_id,
          lockedByName: holderResult.rows[0]?.name || 'Unknown',
          lockExpiresAt: card.lock_expires_at?.toISOString(),
        });
      }
    }

    // Acquire or extend lock
    const expiresAt = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000);

    await query(`
      UPDATE case_card
      SET locked_by_user_id = $1, locked_at = NOW(), lock_expires_at = $2
      WHERE id = $3
    `, [userId, expiresAt, id]);

    return reply.send({
      success: true,
      lock: {
        lockedByUserId: userId,
        lockedByName: userName,
        lockedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        timeoutMinutes: LOCK_TIMEOUT_MINUTES,
      },
    });
  });

  /**
   * POST /case-cards/:id/unlock
   * Release soft-lock
   * Per governance: Lock expires on explicit exit/save or timeout
   */
  fastify.post<{ Params: { id: string } }>('/:id/unlock', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    const result = await query<{ locked_by_user_id: string | null }>(`
      SELECT locked_by_user_id FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = result.rows[0];

    // Only lock holder can release (or anyone if expired)
    if (card.locked_by_user_id && card.locked_by_user_id !== userId) {
      return reply.status(403).send({ error: 'Only the lock holder can release the lock' });
    }

    await query(`
      UPDATE case_card
      SET locked_by_user_id = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE id = $1
    `, [id]);

    return reply.send({ success: true });
  });

  /**
   * POST /case-cards/:id/revert/:versionId
   * Revert to a prior version (append-only: creates new version from old)
   * Per governance: Revert is a new edit that restores prior content
   */
  fastify.post<{ Params: { id: string; versionId: string } }>('/:id/revert/:versionId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, versionId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as any;

    // Per governance doc: SCHEDULER is explicitly excluded
    if (!isRoleAllowed(userRole)) {
      return reply.status(403).send({ error: 'Your role does not have permission to edit case cards' });
    }

    // Clear any expired lock first
    await clearExpiredLock(id);

    // Get current card state
    const cardResult = await query<{
      status: string;
      current_version_id: string;
      version_major: number;
      version_minor: number;
      version_patch: number;
      locked_by_user_id: string | null;
      lock_expires_at: Date | null;
    }>(`
      SELECT status, current_version_id, version_major, version_minor, version_patch,
             locked_by_user_id, lock_expires_at
      FROM case_card WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (cardResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Case card not found' });
    }

    const card = cardResult.rows[0];

    // Cannot revert read-only cards
    if (card.status === 'DEPRECATED' || card.status === 'DELETED') {
      return reply.status(400).send({ error: 'Cannot revert a read-only case card' });
    }

    // Check lock
    if (card.locked_by_user_id && card.locked_by_user_id !== userId) {
      const lockExpired = isLockExpired(card.lock_expires_at);
      if (!lockExpired) {
        return reply.status(409).send({
          error: 'Case card is locked by another user',
          lockedByUserId: card.locked_by_user_id,
        });
      }
    }

    // Get the version to revert to
    const targetVersionResult = await query<CaseCardVersionRow>(`
      SELECT * FROM case_card_version WHERE id = $1 AND case_card_id = $2
    `, [versionId, id]);

    if (targetVersionResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Target version not found' });
    }

    const targetVersion = targetVersionResult.rows[0];

    // Reason is required per governance doc
    if (!body.reason) {
      return reply.status(400).send({ error: 'Reason is required for revert' });
    }

    // Per governance: Revert creates a NEW version with the old content
    const newMajor = card.version_major;
    const newMinor = card.version_minor;
    const newPatch = card.version_patch + 1;
    const newVersionNumber = `${newMajor}.${newMinor}.${newPatch}`;

    // Create new version (copy of target version's content)
    const newVersionResult = await query<{ id: string }>(`
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
      targetVersion.header_info,
      targetVersion.patient_flags,
      targetVersion.instrumentation,
      targetVersion.equipment,
      targetVersion.supplies,
      targetVersion.medications,
      targetVersion.setup_positioning,
      targetVersion.surgeon_notes,
      userId,
    ]);

    const newVersionId = newVersionResult.rows[0].id;

    // Update card
    await query(`
      UPDATE case_card
      SET current_version_id = $1, version_major = $2, version_minor = $3, version_patch = $4
      WHERE id = $5
    `, [newVersionId, newMajor, newMinor, newPatch, id]);

    // Log the revert (per governance: revert is logged as an audit event)
    await query(`
      INSERT INTO case_card_edit_log (
        case_card_id, facility_id, editor_user_id, editor_name, editor_role,
        action_type, change_summary, reason_for_change,
        previous_version_id, new_version_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      facilityId,
      userId,
      userName,
      userRole,
      'REVERT',
      `Reverted to version ${targetVersion.version_number}`,
      body.reason,
      card.current_version_id,
      newVersionId,
    ]);

    return reply.send({
      success: true,
      version: newVersionNumber,
      versionId: newVersionId,
      revertedTo: {
        versionId: versionId,
        versionNumber: targetVersion.version_number,
      },
    });
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
