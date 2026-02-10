/**
 * PHI Access Audit Service
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Logging & Audit Requirements
 *
 * Every PHI access event must record: user ID, role, organization(s),
 * case ID, PHI classification, purpose of access, timestamp, outcome.
 *
 * Constraint 4: Every attempt is logged, including malformed/missing purpose.
 * DENIED outcomes are logged synchronously (fail closed).
 * ALLOWED outcomes are logged fire-and-forget (non-blocking).
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
  createdAt: Date;
}

export interface PhiAccessFilters {
  facilityId?: string;
  userId?: string;
  caseId?: string;
  phiClassification?: PhiClassificationType;
  outcome?: AccessOutcome;
  limit?: number;
  offset?: number;
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
 */
export async function logPhiAccess(context: PhiAccessContext): Promise<void> {
  await query(
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
      http_method
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
    ]
  );
}

/**
 * Query PHI access audit log with filters
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

  if (filters.outcome) {
    conditions.push(`outcome = $${paramIndex}`);
    params.push(filters.outcome);
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
    createdAt: row.created_at,
  }));

  return { entries, total };
}
