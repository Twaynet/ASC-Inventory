/**
 * PHI Access Audit Service
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Logging & Audit Requirements
 * PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW — Emergency & Export Audit (Phase 3)
 *
 * Every PHI access event must record: user ID, role, organization(s),
 * case ID, PHI classification, purpose of access, timestamp, outcome.
 *
 * Constraint 4: Every attempt is logged, including malformed/missing purpose.
 * DENIED outcomes are logged synchronously (fail closed).
 * ALLOWED outcomes are logged fire-and-forget (non-blocking).
 *
 * Phase 3 additions:
 * - Emergency access: is_emergency flag + justification text
 * - Export audit: separate phi_export_audit_log table linked by phi_access_audit_log.id
 */

import { query } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

export type PhiClassificationType = 'PHI_CLINICAL' | 'PHI_BILLING' | 'PHI_AUDIT';
export type AccessPurposeType = 'CLINICAL_CARE' | 'SCHEDULING' | 'BILLING' | 'AUDIT' | 'EMERGENCY';
export type AccessOutcome = 'ALLOWED' | 'DENIED';

export interface PhiAccessContext {
  userId: string;
  userRoles: string[];
  facilityId: string;
  organizationIds: string[];
  caseId?: string | null;
  phiClassification: PhiClassificationType;
  accessPurpose: AccessPurposeType;
  outcome: AccessOutcome;
  denialReason?: string | null;
  requestId?: string;
  endpoint?: string;
  httpMethod?: string;
  // Phase 3: Emergency
  isEmergency?: boolean;
  emergencyJustification?: string | null;
}

export interface PhiAccessLogEntry {
  id: string;
  userId: string;
  userRoles: string[];
  facilityId: string;
  organizationIds: string[];
  caseId: string | null;
  phiClassification: PhiClassificationType;
  accessPurpose: AccessPurposeType;
  outcome: AccessOutcome;
  denialReason: string | null;
  requestId: string | null;
  endpoint: string | null;
  httpMethod: string | null;
  isEmergency: boolean;
  emergencyJustification: string | null;
  createdAt: Date;
}

export interface PhiAccessFilters {
  facilityId?: string;
  userId?: string;
  caseId?: string;
  phiClassification?: PhiClassificationType;
  accessPurpose?: AccessPurposeType;
  outcome?: AccessOutcome;
  isEmergency?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface PhiExportLogEntry {
  id: string;
  phiAccessLogId: string;
  exportFormat: string;
  exportRowCount: number;
  createdAt: Date;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Log a PHI access event (PHI LAW — Logging & Audit Requirements)
 *
 * This function is called:
 * - Synchronously (awaited) for DENIED outcomes → fail closed
 * - Fire-and-forget for ALLOWED outcomes → non-blocking
 *
 * Returns the generated audit log ID for linking export records.
 */
export async function logPhiAccess(context: PhiAccessContext): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO phi_access_audit_log (
      user_id,
      user_roles,
      facility_id,
      organization_ids,
      case_id,
      phi_classification,
      access_purpose,
      outcome,
      denial_reason,
      request_id,
      endpoint,
      http_method,
      is_emergency,
      emergency_justification
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id`,
    [
      context.userId,
      context.userRoles,
      context.facilityId,
      context.organizationIds,
      context.caseId || null,
      context.phiClassification,
      context.accessPurpose,
      context.outcome,
      context.denialReason || null,
      context.requestId || null,
      context.endpoint || null,
      context.httpMethod || null,
      context.isEmergency || false,
      context.emergencyJustification || null,
    ]
  );
  return result.rows[0].id;
}

/**
 * Log a PHI export event (Phase 3 — Export Controls)
 *
 * Links to an existing phi_access_audit_log entry.
 * Best-effort: errors are caught and logged, never break the response.
 */
export async function logPhiExport(
  phiAccessLogId: string,
  exportFormat: string,
  exportRowCount: number
): Promise<void> {
  await query(
    `INSERT INTO phi_export_audit_log (
      phi_access_log_id,
      export_format,
      export_row_count
    ) VALUES ($1, $2, $3)`,
    [phiAccessLogId, exportFormat, exportRowCount]
  );
}

/**
 * Query PHI access audit log with filters (Phase 3 extended)
 */
export async function getPhiAccessLog(
  filters: PhiAccessFilters = {}
): Promise<{ entries: PhiAccessLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.facilityId) {
    conditions.push(`facility_id = $${paramIndex}`);
    params.push(filters.facilityId);
    paramIndex++;
  }

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(filters.userId);
    paramIndex++;
  }

  if (filters.caseId) {
    conditions.push(`case_id = $${paramIndex}`);
    params.push(filters.caseId);
    paramIndex++;
  }

  if (filters.phiClassification) {
    conditions.push(`phi_classification = $${paramIndex}`);
    params.push(filters.phiClassification);
    paramIndex++;
  }

  if (filters.accessPurpose) {
    conditions.push(`access_purpose = $${paramIndex}`);
    params.push(filters.accessPurpose);
    paramIndex++;
  }

  if (filters.outcome) {
    conditions.push(`outcome = $${paramIndex}`);
    params.push(filters.outcome);
    paramIndex++;
  }

  if (filters.isEmergency !== undefined) {
    conditions.push(`is_emergency = $${paramIndex}`);
    params.push(filters.isEmergency);
    paramIndex++;
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex}::date`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    conditions.push(`created_at < ($${paramIndex}::date + interval '1 day')`);
    params.push(filters.endDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM phi_access_audit_log ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Get entries
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const result = await query(
    `SELECT
      id,
      user_id,
      user_roles,
      facility_id,
      organization_ids,
      case_id,
      phi_classification,
      access_purpose,
      outcome,
      denial_reason,
      request_id,
      endpoint,
      http_method,
      is_emergency,
      emergency_justification,
      created_at
    FROM phi_access_audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const entries: PhiAccessLogEntry[] = result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userRoles: row.user_roles,
    facilityId: row.facility_id,
    organizationIds: row.organization_ids,
    caseId: row.case_id,
    phiClassification: row.phi_classification,
    accessPurpose: row.access_purpose,
    outcome: row.outcome,
    denialReason: row.denial_reason,
    requestId: row.request_id,
    endpoint: row.endpoint,
    httpMethod: row.http_method,
    isEmergency: row.is_emergency,
    emergencyJustification: row.emergency_justification,
    createdAt: row.created_at,
  }));

  return { entries, total };
}

/**
 * Get a single PHI access audit log entry by ID (Phase 3 — Audit UX)
 */
export async function getPhiAccessLogEntry(
  id: string,
  facilityId: string
): Promise<PhiAccessLogEntry | null> {
  const result = await query(
    `SELECT
      id,
      user_id,
      user_roles,
      facility_id,
      organization_ids,
      case_id,
      phi_classification,
      access_purpose,
      outcome,
      denial_reason,
      request_id,
      endpoint,
      http_method,
      is_emergency,
      emergency_justification,
      created_at
    FROM phi_access_audit_log
    WHERE id = $1 AND facility_id = $2`,
    [id, facilityId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    userRoles: row.user_roles,
    facilityId: row.facility_id,
    organizationIds: row.organization_ids,
    caseId: row.case_id,
    phiClassification: row.phi_classification,
    accessPurpose: row.access_purpose,
    outcome: row.outcome,
    denialReason: row.denial_reason,
    requestId: row.request_id,
    endpoint: row.endpoint,
    httpMethod: row.http_method,
    isEmergency: row.is_emergency,
    emergencyJustification: row.emergency_justification,
    createdAt: row.created_at,
  };
}

/**
 * Get PHI access audit stats (Phase 3 — Audit UX)
 */
export async function getPhiAccessStats(
  facilityId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  total: number;
  byOutcome: Record<string, number>;
  byPurpose: Record<string, number>;
  emergencyCount: number;
  exportCount: number;
}> {
  const conditions = ['facility_id = $1'];
  const params: unknown[] = [facilityId];
  let paramIndex = 2;

  if (startDate) {
    conditions.push(`created_at >= $${paramIndex}::date`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`created_at < ($${paramIndex}::date + interval '1 day')`);
    params.push(endDate);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Total + emergency count
  const totalResult = await query<{ total: string; emergency_count: string }>(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_emergency = true) as emergency_count
     FROM phi_access_audit_log ${whereClause}`,
    params
  );

  // By outcome
  const outcomeResult = await query<{ outcome: string; count: string }>(
    `SELECT outcome, COUNT(*) as count
     FROM phi_access_audit_log ${whereClause}
     GROUP BY outcome`,
    params
  );

  // By purpose
  const purposeResult = await query<{ access_purpose: string; count: string }>(
    `SELECT access_purpose, COUNT(*) as count
     FROM phi_access_audit_log ${whereClause}
     GROUP BY access_purpose`,
    params
  );

  // Export count
  const exportResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM phi_export_audit_log pel
     JOIN phi_access_audit_log pal ON pel.phi_access_log_id = pal.id
     ${whereClause.replace(/facility_id/g, 'pal.facility_id').replace(/created_at/g, 'pal.created_at')}`,
    params
  );

  const byOutcome: Record<string, number> = {};
  for (const row of outcomeResult.rows) {
    byOutcome[row.outcome] = parseInt(row.count, 10);
  }

  const byPurpose: Record<string, number> = {};
  for (const row of purposeResult.rows) {
    byPurpose[row.access_purpose] = parseInt(row.count, 10);
  }

  return {
    total: parseInt(totalResult.rows[0].total, 10),
    byOutcome,
    byPurpose,
    emergencyCount: parseInt(totalResult.rows[0].emergency_count, 10),
    exportCount: parseInt(exportResult.rows[0].count, 10),
  };
}
