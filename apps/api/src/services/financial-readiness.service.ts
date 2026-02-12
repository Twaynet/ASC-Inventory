/**
 * Financial Readiness Service (Phase 2)
 *
 * Observational, admin-only financial risk tracking.
 * Append-only event recording with deterministic cache recomputation.
 *
 * TRANSACTION DISCIPLINE:
 * All DB writes must use the passed transaction client (pg.PoolClient).
 * Do NOT call the pooled `query()` function inside a transaction path.
 * The global `query()` import is used ONLY by read-only query functions.
 */

import { transaction, query } from '../db/index.js';
import { computeFinancialRisk } from '@asc/domain';
import type { ClinicFinancialState, AscFinancialState, OverrideState, FinancialRiskState } from '@asc/domain';
import type pg from 'pg';

// ============================================================================
// ROW TYPES
// ============================================================================

export interface FinancialReadinessCacheRow {
  surgery_request_id: string;
  target_facility_id: string;
  clinic_state: ClinicFinancialState;
  asc_state: AscFinancialState;
  override_state: OverrideState;
  risk_state: FinancialRiskState;
  last_clinic_declaration_id: string | null;
  last_asc_verification_id: string | null;
  last_override_id: string | null;
  recomputed_at: string;
  created_at: string;
  updated_at: string;
}

export interface DeclarationRow {
  id: string;
  surgery_request_id: string;
  state: ClinicFinancialState;
  reason_codes: string[];
  note: string | null;
  actor_clinic_id: string;
  recorded_by_user_id: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface VerificationRow {
  id: string;
  surgery_request_id: string;
  state: AscFinancialState;
  reason_codes: string[];
  note: string | null;
  verified_by_user_id: string;
  verified_by_name?: string;
  created_at: string;
}

export interface OverrideRow {
  id: string;
  surgery_request_id: string;
  state: OverrideState;
  reason_code: string | null;
  note: string | null;
  overridden_by_user_id: string;
  overridden_by_name?: string;
  created_at: string;
}

export interface DashboardRow {
  surgery_request_id: string;
  procedure_name: string;
  surgeon_name: string | null;
  clinic_name: string | null;
  patient_display_name: string | null;
  scheduled_date: string | null;
  request_status: string;
  risk_state: FinancialRiskState;
  clinic_state: ClinicFinancialState;
  asc_state: AscFinancialState;
  override_state: OverrideState;
  recomputed_at: string | null;
}

interface RequestScopeRow {
  id: string;
  target_facility_id: string;
  source_clinic_id: string;
}

// ============================================================================
// WRITE: RECORD CLINIC DECLARATION
// ============================================================================

export async function recordClinicDeclaration(
  facilityId: string,
  userId: string,
  requestId: string,
  state: string,
  reasonCodes: string[],
  note?: string,
): Promise<FinancialReadinessCacheRow> {
  return transaction(async (client) => {
    const req = await loadAndVerifyScope(client, requestId, facilityId);

    await client.query(`
      INSERT INTO clinic_financial_declaration
        (surgery_request_id, state, reason_codes, note, actor_clinic_id, recorded_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [requestId, state, reasonCodes, note ?? null, req.source_clinic_id, userId]);

    return recomputeCache(client, requestId, facilityId);
  });
}

// ============================================================================
// WRITE: RECORD ASC VERIFICATION
// ============================================================================

export async function recordAscVerification(
  facilityId: string,
  userId: string,
  requestId: string,
  state: string,
  reasonCodes: string[],
  note?: string,
): Promise<FinancialReadinessCacheRow> {
  return transaction(async (client) => {
    await loadAndVerifyScope(client, requestId, facilityId);

    await client.query(`
      INSERT INTO asc_financial_verification
        (surgery_request_id, state, reason_codes, note, verified_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [requestId, state, reasonCodes, note ?? null, userId]);

    return recomputeCache(client, requestId, facilityId);
  });
}

// ============================================================================
// WRITE: RECORD OVERRIDE
// ============================================================================

export async function recordOverride(
  facilityId: string,
  userId: string,
  requestId: string,
  state: string,
  reasonCode: string | null,
  note?: string,
): Promise<FinancialReadinessCacheRow> {
  return transaction(async (client) => {
    await loadAndVerifyScope(client, requestId, facilityId);

    await client.query(`
      INSERT INTO financial_override
        (surgery_request_id, state, reason_code, note, overridden_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [requestId, state, reasonCode, note ?? null, userId]);

    return recomputeCache(client, requestId, facilityId);
  });
}

// ============================================================================
// CACHE RECOMPUTATION (transactional — uses client)
// ============================================================================

async function recomputeCache(
  client: pg.PoolClient,
  requestId: string,
  facilityId: string,
): Promise<FinancialReadinessCacheRow> {
  // Latest clinic declaration
  const declResult = await client.query<{ id: string; state: ClinicFinancialState }>(`
    SELECT id, state FROM clinic_financial_declaration
    WHERE surgery_request_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [requestId]);

  // Latest ASC verification
  const verResult = await client.query<{ id: string; state: AscFinancialState }>(`
    SELECT id, state FROM asc_financial_verification
    WHERE surgery_request_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [requestId]);

  // Latest override
  const overResult = await client.query<{ id: string; state: OverrideState }>(`
    SELECT id, state FROM financial_override
    WHERE surgery_request_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [requestId]);

  const clinicState = declResult.rows[0]?.state ?? 'UNKNOWN';
  const ascState = verResult.rows[0]?.state ?? 'UNKNOWN';
  const overrideState = overResult.rows[0]?.state ?? 'NONE';

  const riskState = computeFinancialRisk({ clinicState, ascState, overrideState });

  const cacheResult = await client.query<FinancialReadinessCacheRow>(`
    INSERT INTO financial_readiness_cache (
      surgery_request_id, target_facility_id,
      clinic_state, asc_state, override_state, risk_state,
      last_clinic_declaration_id, last_asc_verification_id, last_override_id,
      recomputed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (surgery_request_id) DO UPDATE SET
      clinic_state = EXCLUDED.clinic_state,
      asc_state = EXCLUDED.asc_state,
      override_state = EXCLUDED.override_state,
      risk_state = EXCLUDED.risk_state,
      last_clinic_declaration_id = EXCLUDED.last_clinic_declaration_id,
      last_asc_verification_id = EXCLUDED.last_asc_verification_id,
      last_override_id = EXCLUDED.last_override_id,
      recomputed_at = EXCLUDED.recomputed_at
    RETURNING *
  `, [
    requestId, facilityId,
    clinicState, ascState, overrideState, riskState,
    declResult.rows[0]?.id ?? null,
    verResult.rows[0]?.id ?? null,
    overResult.rows[0]?.id ?? null,
  ]);

  return cacheResult.rows[0];
}

// ============================================================================
// QUERIES (read-only, global query())
// ============================================================================

export async function getDashboard(
  facilityId: string,
  filters: {
    riskState?: string;
    clinicId?: string;
    surgeonId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: DashboardRow[]; total: number }> {
  const params: unknown[] = [facilityId];
  let where = `WHERE sr.target_facility_id = $1`;

  if (filters.riskState) {
    params.push(filters.riskState);
    where += ` AND COALESCE(frc.risk_state, 'UNKNOWN') = $${params.length}`;
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

  // Count
  const countResult = await query<{ count: string }>(`
    SELECT COUNT(*) AS count
    FROM surgery_request sr
    LEFT JOIN financial_readiness_cache frc ON frc.surgery_request_id = sr.id
    ${where}
  `, params);
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch page
  const dataParams = [...params, filters.limit, filters.offset];
  const result = await query<DashboardRow>(`
    SELECT
      sr.id AS surgery_request_id,
      sr.procedure_name,
      u.name AS surgeon_name,
      c.name AS clinic_name,
      pr.display_name AS patient_display_name,
      sr.scheduled_date,
      sr.status AS request_status,
      COALESCE(frc.risk_state, 'UNKNOWN') AS risk_state,
      COALESCE(frc.clinic_state, 'UNKNOWN') AS clinic_state,
      COALESCE(frc.asc_state, 'UNKNOWN') AS asc_state,
      COALESCE(frc.override_state, 'NONE') AS override_state,
      frc.recomputed_at
    FROM surgery_request sr
    LEFT JOIN financial_readiness_cache frc ON frc.surgery_request_id = sr.id
    JOIN clinic c ON c.id = sr.source_clinic_id
    LEFT JOIN app_user u ON u.id = sr.surgeon_id
    JOIN patient_ref pr ON pr.id = sr.patient_ref_id
    ${where}
    ORDER BY sr.scheduled_date ASC NULLS LAST, sr.last_submitted_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `, dataParams);

  return { rows: result.rows, total };
}

export interface DetailResult {
  request: {
    id: string;
    procedure_name: string;
    surgeon_name: string | null;
    clinic_name: string | null;
    patient_display_name: string | null;
    scheduled_date: string | null;
    status: string;
  };
  cache: {
    risk_state: FinancialRiskState;
    clinic_state: ClinicFinancialState;
    asc_state: AscFinancialState;
    override_state: OverrideState;
    recomputed_at: string | null;
  };
  declarations: DeclarationRow[];
  verifications: VerificationRow[];
  overrides: OverrideRow[];
}

export async function getDetail(
  facilityId: string,
  requestId: string,
): Promise<DetailResult | null> {
  // Request summary with cache (LEFT JOIN)
  const reqResult = await query<{
    id: string;
    procedure_name: string;
    surgeon_name: string | null;
    clinic_name: string | null;
    patient_display_name: string | null;
    scheduled_date: string | null;
    status: string;
    risk_state: FinancialRiskState | null;
    clinic_state: ClinicFinancialState | null;
    asc_state: AscFinancialState | null;
    override_state: OverrideState | null;
    recomputed_at: string | null;
  }>(`
    SELECT
      sr.id, sr.procedure_name, sr.scheduled_date, sr.status,
      u.name AS surgeon_name,
      c.name AS clinic_name,
      pr.display_name AS patient_display_name,
      frc.risk_state, frc.clinic_state, frc.asc_state, frc.override_state, frc.recomputed_at
    FROM surgery_request sr
    LEFT JOIN financial_readiness_cache frc ON frc.surgery_request_id = sr.id
    JOIN clinic c ON c.id = sr.source_clinic_id
    LEFT JOIN app_user u ON u.id = sr.surgeon_id
    JOIN patient_ref pr ON pr.id = sr.patient_ref_id
    WHERE sr.id = $1 AND sr.target_facility_id = $2
  `, [requestId, facilityId]);

  if (reqResult.rows.length === 0) return null;
  const row = reqResult.rows[0];

  // Declarations
  const declResult = await query<DeclarationRow>(`
    SELECT d.*, u.name AS recorded_by_name
    FROM clinic_financial_declaration d
    LEFT JOIN app_user u ON u.id = d.recorded_by_user_id
    WHERE d.surgery_request_id = $1 ORDER BY d.created_at ASC
  `, [requestId]);

  // Verifications
  const verResult = await query<VerificationRow>(`
    SELECT v.*, u.name AS verified_by_name
    FROM asc_financial_verification v
    LEFT JOIN app_user u ON u.id = v.verified_by_user_id
    WHERE v.surgery_request_id = $1 ORDER BY v.created_at ASC
  `, [requestId]);

  // Overrides
  const overResult = await query<OverrideRow>(`
    SELECT o.*, u.name AS overridden_by_name
    FROM financial_override o
    LEFT JOIN app_user u ON u.id = o.overridden_by_user_id
    WHERE o.surgery_request_id = $1 ORDER BY o.created_at ASC
  `, [requestId]);

  return {
    request: {
      id: row.id,
      procedure_name: row.procedure_name,
      surgeon_name: row.surgeon_name,
      clinic_name: row.clinic_name,
      patient_display_name: row.patient_display_name,
      scheduled_date: row.scheduled_date,
      status: row.status,
    },
    cache: {
      risk_state: row.risk_state ?? 'UNKNOWN',
      clinic_state: row.clinic_state ?? 'UNKNOWN',
      asc_state: row.asc_state ?? 'UNKNOWN',
      override_state: row.override_state ?? 'NONE',
      recomputed_at: row.recomputed_at,
    },
    declarations: declResult.rows,
    verifications: verResult.rows,
    overrides: overResult.rows,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function loadAndVerifyScope(
  client: pg.PoolClient,
  requestId: string,
  facilityId: string,
): Promise<RequestScopeRow> {
  const result = await client.query<RequestScopeRow>(`
    SELECT id, target_facility_id, source_clinic_id
    FROM surgery_request
    WHERE id = $1 AND target_facility_id = $2
  `, [requestId, facilityId]);

  if (result.rows.length === 0) {
    const err = new Error('Surgery request not found');
    (err as Error & { statusCode: number; code: string }).statusCode = 404;
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return result.rows[0];
}
