/**
 * Surgery Request Service (Phase 1 Readiness)
 *
 * Business logic for clinic submissions and ASC review/conversion.
 * All state transitions are enforced here via the SURGERY_REQUEST_TRANSITIONS map.
 */

import { transaction, query } from '../db/index.js';
import {
  type SurgeryRequestStatus,
  SURGERY_REQUEST_TRANSITIONS,
} from '@asc/domain';
import type pg from 'pg';

/** Typed submit request body (matches SubmitRequestBodySchema output) */
export interface SubmitRequestBody {
  targetFacilityId: string;
  sourceRequestId: string;
  submittedAt: string;
  procedureName: string;
  surgeonId?: string;
  surgeonUsername?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  patient: {
    clinicPatientKey: string;
    displayName?: string;
    birthYear?: number;
  };
  checklist?: {
    templateVersionId: string;
    responses: { itemKey: string; response: Record<string, unknown> }[];
  };
}

// ============================================================================
// ROW TYPES
// ============================================================================

export interface SurgeryRequestRow {
  id: string;
  target_facility_id: string;
  source_clinic_id: string;
  source_request_id: string;
  status: SurgeryRequestStatus;
  procedure_name: string;
  surgeon_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  patient_ref_id: string;
  submitted_at: string;
  last_submitted_at: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  clinic_name?: string;
  surgeon_name?: string;
  patient_display_name?: string;
  patient_clinic_key?: string;
  patient_birth_year?: number;
}

export interface SubmissionRow {
  id: string;
  request_id: string;
  submission_seq: number;
  submitted_at: string;
  received_at: string;
  payload_version: number;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  request_id: string;
  submission_id: string | null;
  event_type: string;
  actor_type: string;
  actor_clinic_id: string | null;
  actor_user_id: string | null;
  reason_code: string | null;
  note: string | null;
  created_at: string;
  actor_name?: string;
}

export interface ChecklistResponseRow {
  id: string;
  instance_id: string;
  item_key: string;
  response: unknown;
  actor_type: string;
  actor_clinic_id: string | null;
  actor_user_id: string | null;
  created_at: string;
}

export interface ChecklistInstanceRow {
  id: string;
  request_id: string;
  submission_id: string;
  template_version_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  template_name?: string;
  template_version?: number;
}

// ============================================================================
// STATE MACHINE
// ============================================================================

function assertTransition(
  current: SurgeryRequestStatus,
  target: SurgeryRequestStatus,
): void {
  const allowed = SURGERY_REQUEST_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    const err = new Error(
      `Invalid status transition: ${current} → ${target}`,
    );
    (err as Error & { statusCode: number; code: string }).statusCode = 409;
    (err as Error & { code: string }).code = 'INVALID_TRANSITION';
    throw err;
  }
}

// ============================================================================
// CLINIC: SUBMIT / RESUBMIT
// ============================================================================

export interface SubmitResult {
  request: SurgeryRequestRow;
  created: boolean; // true = new, false = existing (idempotent return)
  resubmitted: boolean; // true = was RETURNED, now resubmitted
}

export async function submitOrResubmit(
  clinicId: string,
  body: SubmitRequestBody,
): Promise<SubmitResult> {
  return transaction(async (client) => {
    // Check for existing request by (clinic_id, source_request_id)
    const existing = await client.query<SurgeryRequestRow>(`
      SELECT * FROM surgery_request
      WHERE source_clinic_id = $1 AND source_request_id = $2
      FOR UPDATE
    `, [clinicId, body.sourceRequestId]);

    if (existing.rows.length > 0) {
      const req = existing.rows[0];

      // If RETURNED_TO_CLINIC, resubmit
      if (req.status === 'RETURNED_TO_CLINIC') {
        return await resubmitExisting(client, req, clinicId, body);
      }

      // Otherwise return existing (idempotent, no duplicate)
      return { request: req, created: false, resubmitted: false };
    }

    // New request
    return await createNewRequest(client, clinicId, body);
  });
}

async function createNewRequest(
  client: pg.PoolClient,
  clinicId: string,
  body: SubmitRequestBody,
): Promise<SubmitResult> {
  // 1. Upsert patient_ref
  const patientRefId = await upsertPatientRef(client, clinicId, body.patient);

  // 2. Resolve surgeon (best-effort)
  const surgeonId = await resolveSurgeon(client, body.targetFacilityId, body.surgeonId, body.surgeonUsername);

  // 3. Create surgery_request
  const reqResult = await client.query<SurgeryRequestRow>(`
    INSERT INTO surgery_request (
      target_facility_id, source_clinic_id, source_request_id,
      status, procedure_name, surgeon_id,
      scheduled_date, scheduled_time, patient_ref_id,
      submitted_at, last_submitted_at
    ) VALUES ($1, $2, $3, 'SUBMITTED', $4, $5, $6, $7, $8, $9, NOW())
    RETURNING *
  `, [
    body.targetFacilityId, clinicId, body.sourceRequestId,
    body.procedureName, surgeonId,
    body.scheduledDate ?? null, body.scheduledTime ?? null,
    patientRefId, body.submittedAt,
  ]);
  const request = reqResult.rows[0];

  // 4. Create submission (seq=1)
  const subResult = await client.query<{ id: string }>(`
    INSERT INTO surgery_request_submission (request_id, submission_seq, submitted_at)
    VALUES ($1, 1, $2) RETURNING id
  `, [request.id, body.submittedAt]);
  const submissionId = subResult.rows[0].id;

  // 5. Create checklist instance + responses (if provided)
  if (body.checklist) {
    await createChecklistData(client, request.id, submissionId, clinicId, body.checklist);
  }

  // 6. Audit event
  await insertAuditEvent(client, {
    requestId: request.id,
    submissionId,
    eventType: 'SUBMITTED',
    actorType: 'CLINIC',
    actorClinicId: clinicId,
  });

  return { request, created: true, resubmitted: false };
}

async function resubmitExisting(
  client: pg.PoolClient,
  existing: SurgeryRequestRow,
  clinicId: string,
  body: SubmitRequestBody,
): Promise<SubmitResult> {
  assertTransition(existing.status, 'SUBMITTED');

  // 1. Upsert patient_ref
  await upsertPatientRef(client, clinicId, body.patient);

  // 2. Resolve surgeon (best-effort)
  const surgeonId = await resolveSurgeon(client, body.targetFacilityId, body.surgeonId, body.surgeonUsername);

  // 3. Determine next submission_seq
  const seqResult = await client.query<{ max_seq: number }>(`
    SELECT COALESCE(MAX(submission_seq), 0) AS max_seq
    FROM surgery_request_submission WHERE request_id = $1
  `, [existing.id]);
  const nextSeq = seqResult.rows[0].max_seq + 1;

  // 4. Create new submission
  const subResult = await client.query<{ id: string }>(`
    INSERT INTO surgery_request_submission (request_id, submission_seq, submitted_at)
    VALUES ($1, $2, $3) RETURNING id
  `, [existing.id, nextSeq, body.submittedAt]);
  const submissionId = subResult.rows[0].id;

  // 5. Update request status back to SUBMITTED
  const updResult = await client.query<SurgeryRequestRow>(`
    UPDATE surgery_request
    SET status = 'SUBMITTED',
        procedure_name = $2,
        surgeon_id = $3,
        scheduled_date = $4,
        scheduled_time = $5,
        last_submitted_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    existing.id,
    body.procedureName,
    surgeonId,
    body.scheduledDate ?? null,
    body.scheduledTime ?? null,
  ]);
  const request = updResult.rows[0];

  // 6. Checklist instance + responses
  if (body.checklist) {
    await createChecklistData(client, existing.id, submissionId, clinicId, body.checklist);
  }

  // 7. Audit event
  await insertAuditEvent(client, {
    requestId: existing.id,
    submissionId,
    eventType: 'RESUBMITTED',
    actorType: 'CLINIC',
    actorClinicId: clinicId,
  });

  return { request, created: false, resubmitted: true };
}

// ============================================================================
// CLINIC: WITHDRAW
// ============================================================================

export async function withdraw(
  clinicId: string,
  requestId: string,
): Promise<SurgeryRequestRow> {
  return transaction(async (client) => {
    const existing = await client.query<SurgeryRequestRow>(`
      SELECT * FROM surgery_request
      WHERE id = $1 AND source_clinic_id = $2
      FOR UPDATE
    `, [requestId, clinicId]);

    if (existing.rows.length === 0) {
      const err = new Error('Surgery request not found');
      (err as Error & { statusCode: number; code: string }).statusCode = 404;
      (err as Error & { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    assertTransition(existing.rows[0].status, 'WITHDRAWN');

    const updated = await client.query<SurgeryRequestRow>(`
      UPDATE surgery_request SET status = 'WITHDRAWN' WHERE id = $1 RETURNING *
    `, [requestId]);

    await insertAuditEvent(client, {
      requestId,
      eventType: 'WITHDRAWN',
      actorType: 'CLINIC',
      actorClinicId: clinicId,
    });

    return updated.rows[0];
  });
}

// ============================================================================
// ASC: RETURN TO CLINIC
// ============================================================================

export async function returnToClinic(
  facilityId: string,
  userId: string,
  requestId: string,
  reasonCode: string,
  note?: string,
): Promise<SurgeryRequestRow> {
  return transaction(async (client) => {
    const req = await loadAndLock(client, requestId, facilityId);
    assertTransition(req.status, 'RETURNED_TO_CLINIC');

    const updated = await client.query<SurgeryRequestRow>(`
      UPDATE surgery_request SET status = 'RETURNED_TO_CLINIC' WHERE id = $1 RETURNING *
    `, [requestId]);

    await insertAuditEvent(client, {
      requestId,
      eventType: 'RETURNED',
      actorType: 'ASC',
      actorUserId: userId,
      reasonCode,
      note,
    });

    return updated.rows[0];
  });
}

// ============================================================================
// ASC: ACCEPT
// ============================================================================

export async function accept(
  facilityId: string,
  userId: string,
  requestId: string,
  note?: string,
): Promise<SurgeryRequestRow> {
  return transaction(async (client) => {
    const req = await loadAndLock(client, requestId, facilityId);
    assertTransition(req.status, 'ACCEPTED');

    const updated = await client.query<SurgeryRequestRow>(`
      UPDATE surgery_request SET status = 'ACCEPTED' WHERE id = $1 RETURNING *
    `, [requestId]);

    await insertAuditEvent(client, {
      requestId,
      eventType: 'ACCEPTED',
      actorType: 'ASC',
      actorUserId: userId,
      note,
    });

    return updated.rows[0];
  });
}

// ============================================================================
// ASC: REJECT
// ============================================================================

export async function reject(
  facilityId: string,
  userId: string,
  requestId: string,
  reasonCode: string,
  note?: string,
): Promise<SurgeryRequestRow> {
  return transaction(async (client) => {
    const req = await loadAndLock(client, requestId, facilityId);
    assertTransition(req.status, 'REJECTED');

    const updated = await client.query<SurgeryRequestRow>(`
      UPDATE surgery_request SET status = 'REJECTED' WHERE id = $1 RETURNING *
    `, [requestId]);

    await insertAuditEvent(client, {
      requestId,
      eventType: 'REJECTED',
      actorType: 'ASC',
      actorUserId: userId,
      reasonCode,
      note,
    });

    return updated.rows[0];
  });
}

// ============================================================================
// ASC: CONVERT (ACCEPTED → CONVERTED, creates surgical_case)
// ============================================================================

export interface ConvertResult {
  request: SurgeryRequestRow;
  surgicalCaseId: string;
}

export async function convert(
  facilityId: string,
  userId: string,
  requestId: string,
): Promise<ConvertResult> {
  return transaction(async (client) => {
    const req = await loadAndLock(client, requestId, facilityId);
    assertTransition(req.status, 'CONVERTED');

    // Create surgical_case from request data
    const caseResult = await client.query<{ id: string; status: string }>(`
      INSERT INTO surgical_case (
        facility_id, case_number, scheduled_date, scheduled_time,
        surgeon_id, procedure_name, status,
        is_active, is_cancelled
      ) VALUES ($1, generate_case_number($1), $2, $3, $4, $5, 'REQUESTED', false, false)
      RETURNING id, status
    `, [
      facilityId,
      req.scheduled_date,
      req.scheduled_time,
      req.surgeon_id,
      req.procedure_name,
    ]);
    const surgicalCase = caseResult.rows[0];

    // Record case status event (inline — must use same transaction client)
    await client.query(`
      INSERT INTO surgical_case_status_event
        (surgical_case_id, from_status, to_status, reason, context, actor_user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      surgicalCase.id,
      null,
      surgicalCase.status,
      null,
      JSON.stringify({ source: 'surgery_request_conversion', surgeryRequestId: requestId }),
      userId,
    ]);

    // Create conversion bridge record
    await client.query(`
      INSERT INTO surgery_request_conversion (request_id, surgical_case_id, converted_by_user_id)
      VALUES ($1, $2, $3)
    `, [requestId, surgicalCase.id, userId]);

    // Update request status to CONVERTED
    const updated = await client.query<SurgeryRequestRow>(`
      UPDATE surgery_request SET status = 'CONVERTED' WHERE id = $1 RETURNING *
    `, [requestId]);

    // Audit event
    await insertAuditEvent(client, {
      requestId,
      eventType: 'CONVERTED',
      actorType: 'ASC',
      actorUserId: userId,
    });

    return { request: updated.rows[0], surgicalCaseId: surgicalCase.id };
  });
}

// ============================================================================
// QUERIES
// ============================================================================

export async function findByClinic(
  clinicId: string,
  filters: { status?: string; since?: string; limit: number },
): Promise<SurgeryRequestRow[]> {
  const params: unknown[] = [clinicId];
  let sql = `
    SELECT sr.*,
           c.name AS clinic_name,
           u.name AS surgeon_name,
           pr.display_name AS patient_display_name,
           pr.clinic_patient_key AS patient_clinic_key,
           pr.birth_year AS patient_birth_year
    FROM surgery_request sr
    JOIN clinic c ON c.id = sr.source_clinic_id
    LEFT JOIN app_user u ON u.id = sr.surgeon_id
    JOIN patient_ref pr ON pr.id = sr.patient_ref_id
    WHERE sr.source_clinic_id = $1
  `;

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND sr.status = $${params.length}`;
  }
  if (filters.since) {
    params.push(filters.since);
    sql += ` AND sr.last_submitted_at >= $${params.length}`;
  }

  params.push(filters.limit);
  sql += ` ORDER BY sr.last_submitted_at DESC LIMIT $${params.length}`;

  const result = await query<SurgeryRequestRow>(sql, params);
  return result.rows;
}

export async function findByFacility(
  facilityId: string,
  filters: {
    status?: string;
    clinicId?: string;
    surgeonId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: SurgeryRequestRow[]; total: number }> {
  const params: unknown[] = [facilityId];
  let where = `WHERE sr.target_facility_id = $1`;

  if (filters.status) {
    params.push(filters.status);
    where += ` AND sr.status = $${params.length}`;
  }
  if (filters.clinicId) {
    params.push(filters.clinicId);
    where += ` AND sr.source_clinic_id = $${params.length}`;
  }
  if (filters.surgeonId) {
    params.push(filters.surgeonId);
    where += ` AND sr.surgeon_id = $${params.length}`;
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    where += ` AND sr.scheduled_date >= $${params.length}`;
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    where += ` AND sr.scheduled_date <= $${params.length}`;
  }

  // Count total
  const countResult = await query<{ count: string }>(`
    SELECT COUNT(*) AS count FROM surgery_request sr ${where}
  `, params);
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch page
  const dataParams = [...params, filters.limit, filters.offset];
  const result = await query<SurgeryRequestRow>(`
    SELECT sr.*,
           c.name AS clinic_name,
           u.name AS surgeon_name,
           pr.display_name AS patient_display_name,
           pr.clinic_patient_key AS patient_clinic_key,
           pr.birth_year AS patient_birth_year
    FROM surgery_request sr
    JOIN clinic c ON c.id = sr.source_clinic_id
    LEFT JOIN app_user u ON u.id = sr.surgeon_id
    JOIN patient_ref pr ON pr.id = sr.patient_ref_id
    ${where}
    ORDER BY sr.last_submitted_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `, dataParams);

  return { rows: result.rows, total };
}

export async function findById(
  requestId: string,
  scope: { clinicId?: string; facilityId?: string },
): Promise<SurgeryRequestRow | null> {
  const params: unknown[] = [requestId];
  let sql = `
    SELECT sr.*,
           c.name AS clinic_name,
           u.name AS surgeon_name,
           pr.display_name AS patient_display_name,
           pr.clinic_patient_key AS patient_clinic_key,
           pr.birth_year AS patient_birth_year
    FROM surgery_request sr
    JOIN clinic c ON c.id = sr.source_clinic_id
    LEFT JOIN app_user u ON u.id = sr.surgeon_id
    JOIN patient_ref pr ON pr.id = sr.patient_ref_id
    WHERE sr.id = $1
  `;

  if (scope.clinicId) {
    params.push(scope.clinicId);
    sql += ` AND sr.source_clinic_id = $${params.length}`;
  }
  if (scope.facilityId) {
    params.push(scope.facilityId);
    sql += ` AND sr.target_facility_id = $${params.length}`;
  }

  const result = await query<SurgeryRequestRow>(sql, params);
  return result.rows[0] ?? null;
}

export async function getSubmissions(requestId: string): Promise<SubmissionRow[]> {
  const result = await query<SubmissionRow>(`
    SELECT * FROM surgery_request_submission
    WHERE request_id = $1 ORDER BY submission_seq ASC
  `, [requestId]);
  return result.rows;
}

export async function getAuditEvents(requestId: string): Promise<AuditEventRow[]> {
  const result = await query<AuditEventRow>(`
    SELECT e.*, u.name AS actor_name
    FROM surgery_request_audit_event e
    LEFT JOIN app_user u ON u.id = e.actor_user_id
    WHERE e.request_id = $1 ORDER BY e.created_at ASC
  `, [requestId]);
  return result.rows;
}

export async function getChecklistInstances(requestId: string): Promise<ChecklistInstanceRow[]> {
  const result = await query<ChecklistInstanceRow>(`
    SELECT ci.*, tv.name AS template_name, tv.version AS template_version
    FROM surgery_request_checklist_instance ci
    JOIN surgery_request_checklist_template_version tv ON tv.id = ci.template_version_id
    WHERE ci.request_id = $1 ORDER BY ci.created_at ASC
  `, [requestId]);
  return result.rows;
}

export async function getChecklistResponses(instanceId: string): Promise<ChecklistResponseRow[]> {
  const result = await query<ChecklistResponseRow>(`
    SELECT * FROM surgery_request_checklist_response
    WHERE instance_id = $1 ORDER BY created_at ASC
  `, [instanceId]);
  return result.rows;
}

export async function getConversion(requestId: string): Promise<{ surgical_case_id: string; converted_at: string; converted_by_user_id: string } | null> {
  const result = await query<{ surgical_case_id: string; converted_at: string; converted_by_user_id: string }>(`
    SELECT * FROM surgery_request_conversion WHERE request_id = $1
  `, [requestId]);
  return result.rows[0] ?? null;
}

export async function listClinics(facilityId?: string): Promise<{ id: string; name: string }[]> {
  let sql = `SELECT DISTINCT c.id, c.name FROM clinic c`;
  const params: unknown[] = [];
  if (facilityId) {
    sql += ` JOIN surgery_request sr ON sr.source_clinic_id = c.id WHERE sr.target_facility_id = $1`;
    params.push(facilityId);
  }
  sql += ` ORDER BY c.name`;
  const result = await query<{ id: string; name: string }>(sql, params);
  return result.rows;
}

// ============================================================================
// HELPERS
// ============================================================================

async function loadAndLock(
  client: pg.PoolClient,
  requestId: string,
  facilityId: string,
): Promise<SurgeryRequestRow> {
  const result = await client.query<SurgeryRequestRow>(`
    SELECT * FROM surgery_request
    WHERE id = $1 AND target_facility_id = $2
    FOR UPDATE
  `, [requestId, facilityId]);

  if (result.rows.length === 0) {
    const err = new Error('Surgery request not found');
    (err as Error & { statusCode: number; code: string }).statusCode = 404;
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return result.rows[0];
}

async function upsertPatientRef(
  client: pg.PoolClient,
  clinicId: string,
  patient: { clinicPatientKey: string; displayName?: string; birthYear?: number },
): Promise<string> {
  const result = await client.query<{ id: string }>(`
    INSERT INTO patient_ref (clinic_id, clinic_patient_key, display_name, birth_year)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (clinic_id, clinic_patient_key)
    DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, patient_ref.display_name),
                  birth_year = COALESCE(EXCLUDED.birth_year, patient_ref.birth_year)
    RETURNING id
  `, [clinicId, patient.clinicPatientKey, patient.displayName ?? null, patient.birthYear ?? null]);
  return result.rows[0].id;
}

async function resolveSurgeon(
  client: pg.PoolClient,
  facilityId: string,
  surgeonId?: string,
  surgeonUsername?: string,
): Promise<string | null> {
  if (surgeonId) {
    // Verify surgeon exists in facility
    const result = await client.query<{ id: string }>(`
      SELECT id FROM app_user
      WHERE id = $1 AND facility_id = $2 AND 'SURGEON' = ANY(roles)
    `, [surgeonId, facilityId]);
    return result.rows[0]?.id ?? null;
  }
  if (surgeonUsername) {
    const result = await client.query<{ id: string }>(`
      SELECT id FROM app_user
      WHERE LOWER(username) = LOWER($1) AND facility_id = $2 AND 'SURGEON' = ANY(roles)
    `, [surgeonUsername, facilityId]);
    return result.rows[0]?.id ?? null;
  }
  return null;
}

async function createChecklistData(
  client: pg.PoolClient,
  requestId: string,
  submissionId: string,
  clinicId: string,
  checklist: { templateVersionId: string; responses: { itemKey: string; response: Record<string, unknown> }[] },
): Promise<void> {
  // Create instance
  const instResult = await client.query<{ id: string }>(`
    INSERT INTO surgery_request_checklist_instance
      (request_id, submission_id, template_version_id, status)
    VALUES ($1, $2, $3, 'PENDING')
    RETURNING id
  `, [requestId, submissionId, checklist.templateVersionId]);
  const instanceId = instResult.rows[0].id;

  // Insert responses
  for (const resp of checklist.responses) {
    await client.query(`
      INSERT INTO surgery_request_checklist_response
        (instance_id, item_key, response, actor_type, actor_clinic_id)
      VALUES ($1, $2, $3, 'CLINIC', $4)
    `, [instanceId, resp.itemKey, JSON.stringify(resp.response), clinicId]);
  }
}

async function insertAuditEvent(
  client: pg.PoolClient,
  event: {
    requestId: string;
    submissionId?: string;
    eventType: string;
    actorType: string;
    actorClinicId?: string;
    actorUserId?: string;
    reasonCode?: string;
    note?: string;
  },
): Promise<void> {
  await client.query(`
    INSERT INTO surgery_request_audit_event
      (request_id, submission_id, event_type, actor_type, actor_clinic_id, actor_user_id, reason_code, note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    event.requestId,
    event.submissionId ?? null,
    event.eventType,
    event.actorType,
    event.actorClinicId ?? null,
    event.actorUserId ?? null,
    event.reasonCode ?? null,
    event.note ?? null,
  ]);
}
