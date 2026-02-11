/**
 * Case Dashboard Routes
 * The authoritative workspace for a single scheduled surgical case
 *
 * Based on case-dashboard.md v1.0
 * Rules:
 * - Case Dashboard is the only place to Attest/Void readiness
 * - Case Card is a template; instance overrides must not modify the template
 * - Phase 6A: Patient identity included via LEFT JOIN (PHI_CLINICAL guarded)
 * - Event log is append-only
 */

import { FastifyInstance } from 'fastify';
import { query, transaction } from '../db/index.js';
import { ok, fail } from '../utils/reply.js';
import { requirePhiAccess } from '../plugins/phi-guard.js';

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

// ============================================================================
// Types
// ============================================================================

interface CaseDashboardData {
  caseId: string;
  caseNumber: string;
  facility: string;
  facilityId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  surgeon: string;
  surgeonId: string;
  procedureName: string;
  status: string;
  isActive: boolean;
  attestationState: string;
  attestedBy: string | null;
  attestedAt: string | null;
  voidReason: string | null;
  estimatedDurationMinutes: number | null;
  laterality: string | null;
  orRoom: string | null;
  schedulerNotes: string | null;
  caseType: string;
  procedureCodes: string[];
  patientFlags: {
    latexAllergy: boolean;
    iodineAllergy: boolean;
    nickelFree: boolean;
    anticoagulation: boolean;
    infectionRisk: boolean;
    neuromonitoringRequired: boolean;
  };
  admissionTypes: {
    outpatient: boolean;
    twentyThreeHrObs: boolean;
    admin: boolean;
  };
  caseCard: {
    id: string;
    name: string;
    version: string;
    versionId: string;
    status: string;
  } | null;
  caseCardLink: {
    eventId: string;
    caseCardId: string | null;
    cardName: string | null;
    cardVersion: string | null;
    reasonCode: string;
    reasonNote: string | null;
    linkedBy: string;
    linkedAt: string;
  } | null;
  anesthesiaPlan: {
    modalities: string[];
    positioningConsiderations: string | null;
    airwayNotes: string | null;
    anticoagulationConsiderations: string | null;
  } | null;
  overrides: Array<{
    id: string;
    target: string;
    originalValue: string | null;
    overrideValue: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  }>;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    mrn: string;
  } | null;
  readinessState: string;
  missingItems: any[];
}

// ============================================================================
// Routes
// ============================================================================

export async function caseDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /case-dashboard/:caseId
   * Get full dashboard data for a case
   */
  fastify.get<{ Params: { caseId: string } }>('/:caseId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId } = request.user;

    // Get case with all related data
    const caseResult = await query<{
      id: string;
      case_number: string;
      facility_id: string;
      facility_name: string;
      scheduled_date: Date;
      scheduled_time: string | null;
      surgeon_id: string;
      surgeon_name: string;
      procedure_name: string;
      status: string;
      is_active: boolean;
      attestation_state: string;
      attestation_void_reason: string | null;
      estimated_duration_minutes: number | null;
      laterality: string | null;
      or_room: string | null;
      scheduler_notes: string | null;
      case_type: string;
      procedure_codes: string[];
      patient_flags: any;
      admission_types: any;
      case_card_version_id: string | null;
      patient_id: string | null;
      patient_first_name: string | null;
      patient_last_name: string | null;
      patient_dob: string | null;
      patient_mrn: string | null;
    }>(`
      SELECT
        sc.id, sc.case_number, sc.facility_id, f.name as facility_name,
        sc.scheduled_date, sc.scheduled_time,
        sc.surgeon_id, u.name as surgeon_name,
        sc.procedure_name, sc.status, sc.is_active,
        sc.attestation_state, sc.attestation_void_reason,
        sc.estimated_duration_minutes, sc.laterality,
        COALESCE(sc.or_room, r.name) as or_room, sc.scheduler_notes,
        sc.case_type, sc.procedure_codes, sc.patient_flags, sc.admission_types,
        sc.case_card_version_id,
        p.id as patient_id, p.first_name as patient_first_name,
        p.last_name as patient_last_name, p.date_of_birth as patient_dob,
        p.mrn as patient_mrn
      FROM surgical_case sc
      JOIN facility f ON sc.facility_id = f.id
      JOIN app_user u ON sc.surgeon_id = u.id
      LEFT JOIN room r ON sc.room_id = r.id
      LEFT JOIN patient p ON sc.patient_id = p.id
      WHERE sc.id = $1 AND sc.facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const caseData = caseResult.rows[0];

    // Get latest attestation info
    const attestationResult = await query<{
      attested_by_name: string;
      created_at: Date;
    }>(`
      SELECT u.name as attested_by_name, a.created_at
      FROM attestation a
      JOIN app_user u ON a.attested_by_user_id = u.id
      WHERE a.case_id = $1 AND a.voided_at IS NULL
      ORDER BY a.created_at DESC
      LIMIT 1
    `, [caseId]);

    // Get case card info if linked
    let caseCard = null;
    if (caseData.case_card_version_id) {
      const cardResult = await query<{
        card_id: string;
        procedure_name: string;
        version_number: string;
        version_id: string;
        status: string;
      }>(`
        SELECT
          cc.id as card_id, cc.procedure_name,
          ccv.version_number, ccv.id as version_id,
          cc.status
        FROM case_card_version ccv
        JOIN case_card cc ON ccv.case_card_id = cc.id
        WHERE ccv.id = $1
      `, [caseData.case_card_version_id]);

      if (cardResult.rows.length > 0) {
        const card = cardResult.rows[0];
        caseCard = {
          id: card.card_id,
          name: card.procedure_name,
          version: card.version_number,
          versionId: card.version_id,
          status: card.status,
        };
      }
    }

    // Get anesthesia plan
    const anesthesiaResult = await query<{
      modalities: string[] | null;
      positioning_considerations: string | null;
      airway_notes: string | null;
      anticoagulation_considerations: string | null;
    }>(`
      SELECT modalities, positioning_considerations, airway_notes, anticoagulation_considerations
      FROM case_anesthesia_plan
      WHERE case_id = $1
    `, [caseId]);

    // Parse PostgreSQL array string to JavaScript array
    const parsePostgresArray = (arr: string | string[] | null): string[] => {
      if (!arr) return [];
      if (Array.isArray(arr)) return arr;
      // Parse PostgreSQL array format: {GENERAL,TIVA} -> ['GENERAL', 'TIVA']
      if (typeof arr === 'string' && arr.startsWith('{') && arr.endsWith('}')) {
        return arr.slice(1, -1).split(',').filter(Boolean);
      }
      return [];
    };

    const anesthesiaPlan = anesthesiaResult.rows.length > 0 ? {
      modalities: parsePostgresArray(anesthesiaResult.rows[0].modalities),
      positioningConsiderations: anesthesiaResult.rows[0].positioning_considerations,
      airwayNotes: anesthesiaResult.rows[0].airway_notes,
      anticoagulationConsiderations: anesthesiaResult.rows[0].anticoagulation_considerations,
    } : null;

    // Get current case card link from link events
    let caseCardLink = null;
    const linkResult = await query<{
      id: string;
      action: string;
      source_case_card_id: string | null;
      snapshot_json: any;
      reason_code: string;
      reason_note: string | null;
      performed_by_name: string;
      performed_at: Date;
    }>(`
      SELECT id, action, source_case_card_id, snapshot_json,
             reason_code, reason_note, performed_by_name, performed_at
      FROM case_card_link_event
      WHERE case_id = $1
      ORDER BY performed_at DESC, created_at DESC, id DESC
      LIMIT 1
    `, [caseId]);

    if (linkResult.rows.length > 0 && linkResult.rows[0].action !== 'UNLINKED') {
      const le = linkResult.rows[0];
      caseCardLink = {
        eventId: le.id,
        caseCardId: le.source_case_card_id,
        cardName: le.snapshot_json?.caseCardName || null,
        cardVersion: le.snapshot_json?.versionNumber || null,
        reasonCode: le.reason_code,
        reasonNote: le.reason_note,
        linkedBy: le.performed_by_name,
        linkedAt: le.performed_at.toISOString(),
      };
    }

    // Get active overrides
    const overridesResult = await query<{
      id: string;
      override_target: string;
      original_value: string | null;
      override_value: string;
      reason: string;
      created_by_name: string;
      created_at: Date;
    }>(`
      SELECT
        co.id, co.override_target, co.original_value,
        co.override_value, co.reason,
        u.name as created_by_name, co.created_at
      FROM case_override co
      JOIN app_user u ON co.created_by_user_id = u.id
      WHERE co.case_id = $1 AND co.reverted_at IS NULL
      ORDER BY co.created_at DESC
    `, [caseId]);

    // Get readiness from cache
    const readinessResult = await query<{
      readiness_state: string;
      missing_items: any;
    }>(`
      SELECT readiness_state, missing_items
      FROM case_readiness_cache
      WHERE case_id = $1
    `, [caseId]);

    const dashboard: CaseDashboardData = {
      caseId: caseData.id,
      caseNumber: caseData.case_number,
      facility: caseData.facility_name,
      facilityId: caseData.facility_id,
      scheduledDate: formatDateLocal(caseData.scheduled_date),
      scheduledTime: caseData.scheduled_time,
      surgeon: caseData.surgeon_name,
      surgeonId: caseData.surgeon_id,
      procedureName: caseData.procedure_name,
      status: caseData.status,
      isActive: caseData.is_active,
      attestationState: caseData.attestation_state,
      attestedBy: attestationResult.rows[0]?.attested_by_name || null,
      attestedAt: attestationResult.rows[0]?.created_at?.toISOString() || null,
      voidReason: caseData.attestation_void_reason,
      estimatedDurationMinutes: caseData.estimated_duration_minutes,
      laterality: caseData.laterality,
      orRoom: caseData.or_room,
      schedulerNotes: caseData.scheduler_notes,
      caseType: caseData.case_type || 'ELECTIVE',
      procedureCodes: caseData.procedure_codes || [],
      patientFlags: caseData.patient_flags || {
        latexAllergy: false,
        iodineAllergy: false,
        nickelFree: false,
        anticoagulation: false,
        infectionRisk: false,
        neuromonitoringRequired: false,
      },
      admissionTypes: caseData.admission_types || {
        outpatient: false,
        twentyThreeHrObs: false,
        admin: false,
      },
      caseCard,
      caseCardLink,
      anesthesiaPlan,
      patient: caseData.patient_id ? {
        id: caseData.patient_id,
        firstName: caseData.patient_first_name!,
        lastName: caseData.patient_last_name!,
        dateOfBirth: caseData.patient_dob!,
        mrn: caseData.patient_mrn!,
      } : null,
      overrides: overridesResult.rows.map(o => ({
        id: o.id,
        target: o.override_target,
        originalValue: o.original_value,
        overrideValue: o.override_value,
        reason: o.reason,
        createdBy: o.created_by_name,
        createdAt: o.created_at.toISOString(),
      })),
      readinessState: readinessResult.rows[0]?.readiness_state || 'RED',
      missingItems: readinessResult.rows[0]?.missing_items || [],
    };

    return ok(reply, { dashboard });
  });

  /**
   * POST /case-dashboard/:caseId/attest
   * Attest case readiness
   */
  fastify.post<{ Params: { caseId: string } }>('/:caseId/attest', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;

    // Verify case exists and can be attested
    const caseResult = await query<{
      attestation_state: string;
      case_card_version_id: string | null;
    }>(`
      SELECT attestation_state, case_card_version_id
      FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const caseData = caseResult.rows[0];

    // Check if case card is linked
    if (!caseData.case_card_version_id) {
      return fail(reply, 'VALIDATION_ERROR', 'Cannot attest: No Case Card linked');
    }

    // Check if anesthesia modality is selected
    const anesthesiaResult = await query<{ modalities: string | string[] | null }>(`
      SELECT modalities FROM case_anesthesia_plan WHERE case_id = $1
    `, [caseId]);

    // Parse PostgreSQL array string
    const parseArr = (arr: string | string[] | null): string[] => {
      if (!arr) return [];
      if (Array.isArray(arr)) return arr;
      if (typeof arr === 'string' && arr.startsWith('{') && arr.endsWith('}')) {
        return arr.slice(1, -1).split(',').filter(Boolean);
      }
      return [];
    };

    const modalities = parseArr(anesthesiaResult.rows[0]?.modalities);
    if (anesthesiaResult.rows.length === 0 || modalities.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Cannot attest: Anesthesia modality not selected');
    }

    // Get current readiness state for attestation record
    const readinessResult = await query<{ readiness_state: string }>(`
      SELECT readiness_state FROM case_readiness_cache WHERE case_id = $1
    `, [caseId]);

    const readinessState = readinessResult.rows[0]?.readiness_state || 'GREEN';

    // Create attestation record
    await query(`
      INSERT INTO attestation (facility_id, case_id, type, attested_by_user_id, readiness_state_at_time)
      VALUES ($1, $2, 'CASE_READINESS', $3, $4)
    `, [facilityId, caseId, userId, readinessState]);

    // Update case attestation state
    await query(`
      UPDATE surgical_case
      SET attestation_state = 'ATTESTED', attestation_void_reason = NULL
      WHERE id = $1
    `, [caseId]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
      VALUES ($1, $2, 'READINESS_ATTESTED', $3, $4, $5, $6)
    `, [caseId, facilityId, userId, userRole, userName, 'Case readiness attested']);

    return ok(reply, { success: true, attestationState: 'ATTESTED' });
  });

  /**
   * POST /case-dashboard/:caseId/void
   * Void attestation (requires reason)
   */
  fastify.post<{ Params: { caseId: string } }>('/:caseId/void', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as { reason?: string };

    if (!body.reason?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'Void reason is required');
    }

    // Verify case exists and is attested
    const caseResult = await query<{ attestation_state: string }>(`
      SELECT attestation_state FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    if (caseResult.rows[0].attestation_state !== 'ATTESTED') {
      return fail(reply, 'VALIDATION_ERROR', 'Case is not currently attested');
    }

    // Void the latest attestation
    await query(`
      UPDATE attestation
      SET voided_at = NOW(), voided_by_user_id = $1
      WHERE case_id = $2 AND voided_at IS NULL
    `, [userId, caseId]);

    // Update case attestation state
    await query(`
      UPDATE surgical_case
      SET attestation_state = 'VOIDED', attestation_void_reason = $1
      WHERE id = $2
    `, [body.reason, caseId]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
      VALUES ($1, $2, 'READINESS_VOIDED', $3, $4, $5, $6)
    `, [caseId, facilityId, userId, userRole, userName, `Attestation voided: ${body.reason}`]);

    return ok(reply, { success: true, attestationState: 'VOIDED' });
  });

  /**
   * PUT /case-dashboard/:caseId/anesthesia
   * Update anesthesia plan
   */
  fastify.put<{ Params: { caseId: string } }>('/:caseId/anesthesia', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      modalities?: string[];
      positioningConsiderations?: string;
      airwayNotes?: string;
      anticoagulationConsiderations?: string;
    };

    // Verify case exists
    const caseResult = await query(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    // Upsert anesthesia plan
    await query(`
      INSERT INTO case_anesthesia_plan (case_id, facility_id, modalities, positioning_considerations, airway_notes, anticoagulation_considerations)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (case_id) DO UPDATE SET
        modalities = COALESCE($3, case_anesthesia_plan.modalities),
        positioning_considerations = COALESCE($4, case_anesthesia_plan.positioning_considerations),
        airway_notes = COALESCE($5, case_anesthesia_plan.airway_notes),
        anticoagulation_considerations = COALESCE($6, case_anesthesia_plan.anticoagulation_considerations),
        updated_at = NOW()
    `, [
      caseId,
      facilityId,
      body.modalities && body.modalities.length > 0 ? body.modalities : null,
      body.positioningConsiderations || null,
      body.airwayNotes || null,
      body.anticoagulationConsiderations || null,
    ]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
      VALUES ($1, $2, 'ANESTHESIA_PLAN_CHANGED', $3, $4, $5, $6)
    `, [caseId, facilityId, userId, userRole, userName, 'Anesthesia plan updated']);

    return ok(reply, { success: true });
  });

  /**
   * PUT /case-dashboard/:caseId/link-case-card
   * Link or relink a case card (snapshot-based, auditable)
   *
   * New body: { caseCardId, reasonCode, reasonNote? }
   * Legacy body: { caseCardVersionId }  (backward compat, no snapshot)
   */
  fastify.put<{ Params: { caseId: string } }>('/:caseId/link-case-card', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      caseCardId?: string;
      caseCardVersionId?: string;
      reasonCode?: string;
      reasonNote?: string;
    };

    // ── New snapshot-based flow ──
    if (body.caseCardId) {
      // Verify case exists and get current link state
      const caseResult = await query<{ case_card_version_id: string | null }>(`
        SELECT case_card_version_id FROM surgical_case WHERE id = $1 AND facility_id = $2
      `, [caseId, facilityId]);

      if (caseResult.rows.length === 0) {
        return fail(reply, 'NOT_FOUND', 'Case not found', 404);
      }

      // Reason is required for relink/change, optional for initial link
      const isRelink = !!caseResult.rows[0].case_card_version_id;
      if (isRelink && !body.reasonCode) {
        return fail(reply, 'VALIDATION_ERROR', 'reasonCode is required when relinking');
      }

      // Resolve ACTIVE version for the case card
      const cardResult = await query<{
        card_id: string;
        procedure_name: string;
        surgeon_id: string;
        surgeon_name: string;
        status: string;
        case_type: string;
        procedure_codes: string[];
        default_duration_minutes: number | null;
        turnover_notes: string | null;
        version_id: string;
        version_number: string;
        header_info: any;
        patient_flags: any;
        instrumentation: any;
        equipment: any;
        supplies: any;
        medications: any;
        setup_positioning: any;
        surgeon_notes: any;
      }>(`
        SELECT
          cc.id as card_id, cc.procedure_name, cc.surgeon_id,
          u.name as surgeon_name, cc.status, cc.case_type,
          cc.procedure_codes, cc.default_duration_minutes, cc.turnover_notes,
          ccv.id as version_id, ccv.version_number,
          ccv.header_info, ccv.patient_flags, ccv.instrumentation,
          ccv.equipment, ccv.supplies, ccv.medications,
          ccv.setup_positioning, ccv.surgeon_notes
        FROM case_card cc
        JOIN app_user u ON cc.surgeon_id = u.id
        JOIN case_card_version ccv ON cc.current_version_id = ccv.id
        WHERE cc.id = $1 AND cc.facility_id = $2 AND cc.status = 'ACTIVE'
      `, [body.caseCardId, facilityId]);

      if (cardResult.rows.length === 0) {
        return fail(reply, 'NOT_FOUND', 'No active case card found for the given ID', 404);
      }

      const card = cardResult.rows[0];
      const previousVersionId = caseResult.rows[0].case_card_version_id;
      const action = previousVersionId ? 'RELINKED' : 'LINKED';

      // Build render-complete snapshot
      const snapshotJson = {
        caseCardId: card.card_id,
        caseCardName: card.procedure_name,
        surgeonId: card.surgeon_id,
        surgeonName: card.surgeon_name,
        caseCardStatus: card.status,
        caseType: card.case_type,
        procedureCodes: card.procedure_codes || [],
        defaultDurationMinutes: card.default_duration_minutes,
        turnoverNotes: card.turnover_notes,
        versionId: card.version_id,
        versionNumber: card.version_number,
        headerInfo: card.header_info || {},
        patientFlags: card.patient_flags || {},
        instrumentation: card.instrumentation || {},
        equipment: card.equipment || {},
        supplies: card.supplies || {},
        medications: card.medications || {},
        setupPositioning: card.setup_positioning || {},
        surgeonNotes: card.surgeon_notes || {},
      };

      await transaction(async (client) => {
        // Update FK for backward compat
        await client.query(`
          UPDATE surgical_case SET case_card_version_id = $1 WHERE id = $2
        `, [card.version_id, caseId]);

        // Write link event with snapshot
        await client.query(`
          INSERT INTO case_card_link_event
            (case_id, facility_id, action, source_case_card_id, source_case_card_version_id,
             snapshot_json, reason_code, reason_note, performed_by_user_id, performed_by_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          caseId, facilityId, action, card.card_id, card.version_id,
          JSON.stringify(snapshotJson), body.reasonCode || 'INITIAL_LINK', body.reasonNote || null,
          userId, userName,
        ]);

        // Log to general event log
        const eventType = previousVersionId ? 'CASE_CARD_CHANGED' : 'CASE_CARD_LINKED';
        await client.query(`
          INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description, case_card_version_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          caseId, facilityId, eventType, userId, userRole, userName,
          `${action === 'RELINKED' ? 'Relinked' : 'Linked'} preference card: ${card.procedure_name} v${card.version_number}${body.reasonCode ? ` (${body.reasonCode})` : ''}`,
          card.version_id,
        ]);
      });

      return ok(reply, { success: true });
    }

    // ── Legacy flow (backward compat) ──
    if (!body.caseCardVersionId) {
      return fail(reply, 'VALIDATION_ERROR', 'caseCardId or caseCardVersionId is required');
    }

    const caseResult = await query<{ case_card_version_id: string | null }>(`
      SELECT case_card_version_id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const previousVersionId = caseResult.rows[0].case_card_version_id;

    const versionResult = await query<{ id: string; procedure_name: string }>(`
      SELECT ccv.id, cc.procedure_name
      FROM case_card_version ccv
      JOIN case_card cc ON ccv.case_card_id = cc.id
      WHERE ccv.id = $1 AND cc.facility_id = $2
    `, [body.caseCardVersionId, facilityId]);

    if (versionResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case card version not found', 404);
    }

    await query(`
      UPDATE surgical_case SET case_card_version_id = $1 WHERE id = $2
    `, [body.caseCardVersionId, caseId]);

    const eventType = previousVersionId ? 'CASE_CARD_CHANGED' : 'CASE_CARD_LINKED';
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description, case_card_version_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      caseId, facilityId, eventType, userId, userRole, userName,
      `Case card ${previousVersionId ? 'changed' : 'linked'}: ${versionResult.rows[0].procedure_name}`,
      body.caseCardVersionId,
    ]);

    return ok(reply, { success: true });
  });

  /**
   * POST /case-dashboard/:caseId/case-card-unlink
   * Unlink the current case card
   */
  fastify.post<{ Params: { caseId: string } }>('/:caseId/case-card-unlink', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as { reasonCode: string; reasonNote?: string };

    if (!body.reasonCode) {
      return fail(reply, 'VALIDATION_ERROR', 'reasonCode is required');
    }

    // Verify case exists and has a linked card
    const caseResult = await query<{ case_card_version_id: string | null }>(`
      SELECT case_card_version_id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    if (!caseResult.rows[0].case_card_version_id) {
      return fail(reply, 'INVALID_REQUEST', 'No case card is currently linked', 400);
    }

    await transaction(async (client) => {
      // Clear FK for backward compat
      await client.query(`
        UPDATE surgical_case SET case_card_version_id = NULL WHERE id = $1
      `, [caseId]);

      // Write unlink event (no snapshot)
      await client.query(`
        INSERT INTO case_card_link_event
          (case_id, facility_id, action, reason_code, reason_note,
           performed_by_user_id, performed_by_name)
        VALUES ($1, $2, 'UNLINKED', $3, $4, $5, $6)
      `, [caseId, facilityId, body.reasonCode, body.reasonNote || null, userId, userName]);

      // Log to general event log (reuse CASE_CARD_CHANGED)
      await client.query(`
        INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
        VALUES ($1, $2, 'CASE_CARD_CHANGED', $3, $4, $5, $6)
      `, [caseId, facilityId, userId, userRole, userName,
        `Unlinked preference card (${body.reasonCode})`]);
    });

    return ok(reply, { success: true });
  });

  /**
   * GET /case-dashboard/:caseId/case-card-link
   * Get current link status + full history
   */
  fastify.get<{ Params: { caseId: string } }>('/:caseId/case-card-link', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId } = request.user;

    // Verify case exists
    const caseResult = await query(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    // Fetch all link events, newest first
    const eventsResult = await query<{
      id: string;
      action: string;
      source_case_card_id: string | null;
      source_case_card_version_id: string | null;
      snapshot_json: any;
      reason_code: string;
      reason_note: string | null;
      performed_by_name: string;
      performed_at: Date;
    }>(`
      SELECT id, action, source_case_card_id, source_case_card_version_id,
             snapshot_json, reason_code, reason_note,
             performed_by_name, performed_at
      FROM case_card_link_event
      WHERE case_id = $1
      ORDER BY performed_at DESC, created_at DESC, id DESC
    `, [caseId]);

    const history = eventsResult.rows.map(e => ({
      id: e.id,
      action: e.action,
      sourceCaseCardId: e.source_case_card_id,
      cardName: e.snapshot_json?.caseCardName || null,
      cardVersion: e.snapshot_json?.versionNumber || null,
      reasonCode: e.reason_code,
      reasonNote: e.reason_note,
      performedByName: e.performed_by_name,
      performedAt: e.performed_at.toISOString(),
    }));

    // Derive currentLink from most recent event
    let currentLink = null;
    if (eventsResult.rows.length > 0) {
      const latest = eventsResult.rows[0];
      if (latest.action !== 'UNLINKED') {
        currentLink = {
          eventId: latest.id,
          caseCardId: latest.source_case_card_id,
          caseCardVersionId: latest.source_case_card_version_id,
          cardName: latest.snapshot_json?.caseCardName || null,
          cardVersion: latest.snapshot_json?.versionNumber || null,
          reasonCode: latest.reason_code,
          reasonNote: latest.reason_note,
          linkedBy: latest.performed_by_name,
          linkedAt: latest.performed_at.toISOString(),
          snapshotJson: latest.snapshot_json,
        };
      }
    }

    return ok(reply, { currentLink, history });
  });

  /**
   * POST /case-dashboard/:caseId/overrides
   * Add a case-specific override
   */
  fastify.post<{ Params: { caseId: string } }>('/:caseId/overrides', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      target: string;
      originalValue?: string;
      overrideValue: string;
      reason: string;
    };

    if (!body.target || !body.overrideValue || !body.reason) {
      return fail(reply, 'VALIDATION_ERROR', 'target, overrideValue, and reason are required');
    }

    // Verify case exists
    const caseResult = await query(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    // Create override
    const overrideResult = await query<{ id: string }>(`
      INSERT INTO case_override (case_id, facility_id, override_target, original_value, override_value, reason, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [caseId, facilityId, body.target, body.originalValue || null, body.overrideValue, body.reason, userId]);

    const overrideId = overrideResult.rows[0].id;

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description, override_id)
      VALUES ($1, $2, 'OVERRIDE_ADDED', $3, $4, $5, $6, $7)
    `, [caseId, facilityId, userId, userRole, userName, `Override added: ${body.target}`, overrideId]);

    return ok(reply, { success: true, overrideId }, 201);
  });

  /**
   * PUT /case-dashboard/:caseId/overrides/:overrideId
   * Modify an existing override
   */
  fastify.put<{ Params: { caseId: string; overrideId: string } }>('/:caseId/overrides/:overrideId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId, overrideId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      overrideValue?: string;
      reason?: string;
    };

    // Verify override exists and belongs to this case
    const overrideResult = await query<{ id: string; override_target: string }>(`
      SELECT id, override_target FROM case_override
      WHERE id = $1 AND case_id = $2 AND facility_id = $3 AND reverted_at IS NULL
    `, [overrideId, caseId, facilityId]);

    if (overrideResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Override not found', 404);
    }

    // Update override
    await query(`
      UPDATE case_override SET
        override_value = COALESCE($1, override_value),
        reason = COALESCE($2, reason)
      WHERE id = $3
    `, [body.overrideValue, body.reason, overrideId]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description, override_id)
      VALUES ($1, $2, 'OVERRIDE_MODIFIED', $3, $4, $5, $6, $7)
    `, [caseId, facilityId, userId, userRole, userName, `Override modified: ${overrideResult.rows[0].override_target}`, overrideId]);

    return ok(reply, { success: true });
  });

  /**
   * DELETE /case-dashboard/:caseId/overrides/:overrideId
   * Revert/remove an override
   */
  fastify.delete<{ Params: { caseId: string; overrideId: string } }>('/:caseId/overrides/:overrideId', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId, overrideId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;

    // Verify override exists
    const overrideResult = await query<{ id: string; override_target: string }>(`
      SELECT id, override_target FROM case_override
      WHERE id = $1 AND case_id = $2 AND facility_id = $3 AND reverted_at IS NULL
    `, [overrideId, caseId, facilityId]);

    if (overrideResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Override not found', 404);
    }

    // Mark as reverted
    await query(`
      UPDATE case_override SET reverted_at = NOW(), reverted_by_user_id = $1 WHERE id = $2
    `, [userId, overrideId]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description, override_id)
      VALUES ($1, $2, 'OVERRIDE_REMOVED', $3, $4, $5, $6, $7)
    `, [caseId, facilityId, userId, userRole, userName, `Override removed: ${overrideResult.rows[0].override_target}`, overrideId]);

    return ok(reply, { success: true });
  });

  /**
   * GET /case-dashboard/:caseId/event-log
   * Get event log for a case
   */
  fastify.get<{ Params: { caseId: string } }>('/:caseId/event-log', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId } = request.user;

    // Verify case exists
    const caseResult = await query(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const result = await query<{
      id: string;
      event_type: string;
      user_id: string;
      user_role: string;
      user_name: string;
      description: string;
      created_at: Date;
    }>(`
      SELECT id, event_type, user_id, user_role, user_name, description, created_at
      FROM case_event_log
      WHERE case_id = $1
      ORDER BY created_at DESC
    `, [caseId]);

    return ok(reply, {
      eventLog: result.rows.map(e => ({
        id: e.id,
        eventType: e.event_type,
        userId: e.user_id,
        userRole: e.user_role,
        userName: e.user_name,
        description: e.description,
        createdAt: e.created_at.toISOString(),
      })),
    });
  });

  /**
   * PUT /case-dashboard/:caseId/case-summary
   * Update case summary fields
   */
  fastify.put<{ Params: { caseId: string } }>('/:caseId/case-summary', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      estimatedDurationMinutes?: number;
      laterality?: string;
      orRoom?: string;
      schedulerNotes?: string;
      caseType?: 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION';
      procedureCodes?: string[];
      patientFlags?: {
        latexAllergy: boolean;
        iodineAllergy: boolean;
        nickelFree: boolean;
        anticoagulation: boolean;
        infectionRisk: boolean;
        neuromonitoringRequired: boolean;
      };
      admissionTypes?: {
        outpatient: boolean;
        twentyThreeHrObs: boolean;
        admin: boolean;
      };
    };

    // Verify case exists
    const caseResult = await query(`
      SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    // Update case
    await query(`
      UPDATE surgical_case SET
        estimated_duration_minutes = COALESCE($1, estimated_duration_minutes),
        laterality = COALESCE($2, laterality),
        or_room = COALESCE($3, or_room),
        scheduler_notes = COALESCE($4, scheduler_notes),
        case_type = COALESCE($5, case_type),
        procedure_codes = COALESCE($6, procedure_codes),
        patient_flags = COALESCE($7, patient_flags),
        admission_types = COALESCE($8, admission_types)
      WHERE id = $9
    `, [
      body.estimatedDurationMinutes,
      body.laterality,
      body.orRoom,
      body.schedulerNotes,
      body.caseType,
      body.procedureCodes,
      body.patientFlags ? JSON.stringify(body.patientFlags) : null,
      body.admissionTypes ? JSON.stringify(body.admissionTypes) : null,
      caseId,
    ]);

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
      VALUES ($1, $2, 'SCHEDULING_CHANGED', $3, $4, $5, $6)
    `, [caseId, facilityId, userId, userRole, userName, 'Case summary updated']);

    return ok(reply, { success: true });
  });

  /**
   * PUT /case-dashboard/:caseId/scheduling
   * Update case scheduled date, time, and OR room
   */
  fastify.put<{ Params: { caseId: string } }>('/:caseId/scheduling', {
    preHandler: [fastify.authenticate, requirePhiAccess('PHI_CLINICAL', { evaluateCase: true })],
  }, async (request, reply) => {
    const { caseId } = request.params;
    const { facilityId, userId, name: userName, role: userRole } = request.user;
    const body = request.body as {
      scheduledDate?: string;
      scheduledTime?: string | null;
      orRoom?: string | null;
    };

    if (!body.scheduledDate && body.scheduledTime === undefined && body.orRoom === undefined) {
      return fail(reply, 'VALIDATION_ERROR', 'At least one field is required');
    }

    // Verify case exists and get current values
    const caseResult = await query<{ scheduled_date: Date; scheduled_time: string | null; or_room: string | null }>(`
      SELECT scheduled_date, scheduled_time, or_room FROM surgical_case WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (caseResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Case not found', 404);
    }

    const previousDate = formatDateLocal(caseResult.rows[0].scheduled_date);
    const previousTime = caseResult.rows[0].scheduled_time;
    const previousRoom = caseResult.rows[0].or_room;

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (body.scheduledDate) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      values.push(body.scheduledDate);
    }
    if (body.scheduledTime !== undefined) {
      updates.push(`scheduled_time = $${paramIndex++}`);
      values.push(body.scheduledTime);
    }
    if (body.orRoom !== undefined) {
      updates.push(`or_room = $${paramIndex++}`);
      values.push(body.orRoom);
    }

    values.push(caseId);

    await query(`
      UPDATE surgical_case SET ${updates.join(', ')} WHERE id = $${paramIndex}
    `, values);

    // Build description
    const changes: string[] = [];
    if (body.scheduledDate && body.scheduledDate !== previousDate) {
      changes.push(`Date: ${previousDate} → ${body.scheduledDate}`);
    }
    if (body.scheduledTime !== undefined && body.scheduledTime !== previousTime) {
      changes.push(`Time: ${previousTime || 'TBD'} → ${body.scheduledTime || 'TBD'}`);
    }
    if (body.orRoom !== undefined && body.orRoom !== previousRoom) {
      changes.push(`OR: ${previousRoom || 'TBD'} → ${body.orRoom || 'TBD'}`);
    }

    // Log event
    await query(`
      INSERT INTO case_event_log (case_id, facility_id, event_type, user_id, user_role, user_name, description)
      VALUES ($1, $2, 'SCHEDULING_CHANGED', $3, $4, $5, $6)
    `, [caseId, facilityId, userId, userRole, userName, changes.join('; ') || 'Scheduling updated']);

    return ok(reply, { success: true });
  });
}
