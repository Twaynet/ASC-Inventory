/**
 * PHI Retention Service
 *
 * Phase 4: ADVISORY ONLY retention status — NO DELETES.
 *
 * Evaluates retention status for surgical cases based on configurable
 * retention periods (billing, clinical, audit). Determines whether a
 * case's PHI data is theoretically eligible for purging, but performs
 * no destructive operations.
 *
 * LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Time-Based Constraints
 *
 * Retention reasons:
 *   ACTIVE_CASE     — Case is still open (not COMPLETED or CANCELLED)
 *   BILLING_HOLD    — Within billing retention window post-completion
 *   AUDIT_RETENTION — Within audit retention window after last audit access
 *
 * Config keys (all per-facility overrideable):
 *   phi.retention.billing_years   (default 7)
 *   phi.retention.audit_years     (default 7)
 *   phi.retention.clinical_years  (default 7)
 */

import { query } from '../db/index.js';
import { getEffectiveConfigValue } from './config.service.js';
import { PHI_RETENTION_DEFAULTS } from '@asc/domain';

// ============================================================================
// Types
// ============================================================================

/** Why a case's PHI data must be retained. */
export type RetentionReason = 'ACTIVE_CASE' | 'BILLING_HOLD' | 'AUDIT_RETENTION';

/**
 * Full retention evaluation for a single surgical case.
 *
 * `isPurgeable` is advisory — no delete action is ever taken.
 */
export interface RetentionStatus {
  entityType: 'SURGICAL_CASE';
  entityId: string;
  facilityId: string;
  isPurgeable: boolean;
  earliestPurgeAt: Date | null;  // null = not purgeable (active case)
  retentionReasons: RetentionReason[];
  retentionDetails: RetentionDetail[];
  evaluatedAt: Date;
}

/** Detail for a single retention reason with expiry information. */
export interface RetentionDetail {
  reason: RetentionReason;
  description: string;
  expiresAt: Date | null;  // null = indefinite hold
}

/** Aggregate retention summary for a facility. */
export interface RetentionSummary {
  facilityId: string;
  totalCases: number;
  activeCases: number;
  billingHoldCases: number;
  auditRetentionCases: number;
  purgeableCases: number;
  evaluatedAt: Date;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Safely parse a config value to a number, falling back to the provided default.
 *
 * `getEffectiveConfigValue` returns `string | boolean | number | object | null`.
 * For NUMBER-typed config keys it returns a number directly, but we defend
 * against unexpected types.
 */
function parseRetentionYears(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

/**
 * Add years to a Date, returning a new Date.
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Load all three retention periods for a facility, resolving config overrides
 * with safe fallback to PHI_RETENTION_DEFAULTS.
 */
async function loadRetentionConfig(facilityId: string): Promise<{
  billingYears: number;
  clinicalYears: number;
  auditYears: number;
}> {
  const [billingRaw, clinicalRaw, auditRaw] = await Promise.all([
    getEffectiveConfigValue('phi.retention.billing_years', facilityId),
    getEffectiveConfigValue('phi.retention.clinical_years', facilityId),
    getEffectiveConfigValue('phi.retention.audit_years', facilityId),
  ]);

  return {
    billingYears: parseRetentionYears(billingRaw, PHI_RETENTION_DEFAULTS.billingYears),
    clinicalYears: parseRetentionYears(clinicalRaw, PHI_RETENTION_DEFAULTS.clinicalYears),
    auditYears: parseRetentionYears(auditRaw, PHI_RETENTION_DEFAULTS.auditYears),
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Evaluate retention status for a single surgical case.
 *
 * Logic:
 * 1. If case status is NOT COMPLETED or CANCELLED → ACTIVE_CASE (indefinite hold).
 * 2. Find terminal event timestamp from surgical_case_status_event.
 * 3. Compute billing hold: terminalDate + billing_years.
 * 4. Compute clinical hold: terminalDate + clinical_years.
 * 5. Check phi_access_audit_log for latest audit access → audit hold: lastAudit + audit_years.
 * 6. earliestPurgeAt = max of all hold expiries.
 * 7. isPurgeable = now > earliestPurgeAt AND no ACTIVE_CASE reason.
 *
 * @param entityId  - The surgical_case.id (UUID)
 * @param facilityId - The facility_id to resolve config overrides
 * @returns Full retention status for the case
 * @throws Error if the case is not found
 */
export async function getRetentionStatus(
  entityId: string,
  facilityId: string
): Promise<RetentionStatus> {
  const now = new Date();
  const retentionReasons: RetentionReason[] = [];
  const retentionDetails: RetentionDetail[] = [];

  // 1. Query case status
  const caseResult = await query<{ id: string; status: string; facility_id: string }>(
    `SELECT id, status, facility_id
     FROM surgical_case
     WHERE id = $1 AND facility_id = $2`,
    [entityId, facilityId]
  );

  if (caseResult.rows.length === 0) {
    throw new Error(`Surgical case not found: ${entityId} in facility ${facilityId}`);
  }

  const caseRow = caseResult.rows[0];
  const isTerminal = caseRow.status === 'COMPLETED' || caseRow.status === 'CANCELLED';

  // 2. If case is still active, it gets an indefinite hold
  if (!isTerminal) {
    retentionReasons.push('ACTIVE_CASE');
    retentionDetails.push({
      reason: 'ACTIVE_CASE',
      description: `Case is in ${caseRow.status} status — PHI retained indefinitely until case reaches terminal state.`,
      expiresAt: null,
    });

    return {
      entityType: 'SURGICAL_CASE',
      entityId,
      facilityId,
      isPurgeable: false,
      earliestPurgeAt: null,
      retentionReasons,
      retentionDetails,
      evaluatedAt: now,
    };
  }

  // 3. Find terminal event timestamp
  const terminalEventResult = await query<{ created_at: Date }>(
    `SELECT created_at
     FROM surgical_case_status_event
     WHERE surgical_case_id = $1
       AND to_status IN ('COMPLETED', 'CANCELLED')
     ORDER BY created_at DESC
     LIMIT 1`,
    [entityId]
  );

  // Fallback: if no event found (data inconsistency), use current time as conservative default
  const terminalDate = terminalEventResult.rows.length > 0
    ? new Date(terminalEventResult.rows[0].created_at)
    : now;

  // 4. Load retention config
  const config = await loadRetentionConfig(facilityId);

  // 5. Compute billing hold
  const billingExpiresAt = addYears(terminalDate, config.billingYears);
  if (now < billingExpiresAt) {
    retentionReasons.push('BILLING_HOLD');
  }
  retentionDetails.push({
    reason: 'BILLING_HOLD',
    description: `Billing retention: ${config.billingYears} years from terminal event (${terminalDate.toISOString()}).`,
    expiresAt: billingExpiresAt,
  });

  // 6. Compute clinical hold
  const clinicalExpiresAt = addYears(terminalDate, config.clinicalYears);
  // Clinical hold contributes to earliest purge date but uses the same
  // billing/clinical window concept. We track it as part of billing hold
  // detail since it extends from the same terminal event. The max of
  // billing and clinical is what matters.

  // 7. Check audit log for last access referencing this case
  const auditResult = await query<{ last_access: Date }>(
    `SELECT MAX(created_at) AS last_access
     FROM phi_access_audit_log
     WHERE case_id = $1`,
    [entityId]
  );

  const lastAuditAccess = auditResult.rows[0]?.last_access
    ? new Date(auditResult.rows[0].last_access)
    : null;

  let auditExpiresAt: Date | null = null;
  if (lastAuditAccess) {
    auditExpiresAt = addYears(lastAuditAccess, config.auditYears);
    if (now < auditExpiresAt) {
      retentionReasons.push('AUDIT_RETENTION');
    }
    retentionDetails.push({
      reason: 'AUDIT_RETENTION',
      description: `Audit retention: ${config.auditYears} years from last PHI access (${lastAuditAccess.toISOString()}).`,
      expiresAt: auditExpiresAt,
    });
  }

  // 8. Compute earliest purge date = max of all hold expiries
  const allExpiries = [billingExpiresAt, clinicalExpiresAt];
  if (auditExpiresAt) allExpiries.push(auditExpiresAt);

  const earliestPurgeAt = allExpiries.reduce((max, d) => (d > max ? d : max));

  // 9. isPurgeable = now past all hold periods
  const isPurgeable = now >= earliestPurgeAt && retentionReasons.length === 0;

  return {
    entityType: 'SURGICAL_CASE',
    entityId,
    facilityId,
    isPurgeable,
    earliestPurgeAt,
    retentionReasons,
    retentionDetails,
    evaluatedAt: now,
  };
}

/**
 * Get aggregate retention summary for a facility.
 *
 * Uses SQL-level computation for active vs. completed/cancelled counts,
 * and estimates billing hold using the configured retention period.
 *
 * Note: audit retention requires per-case evaluation (join with
 * phi_access_audit_log), so the purgeableCases count is an approximation.
 * For exact counts, use getRetentionEligibility with onlyPurgeable.
 *
 * @param facilityId - The facility to summarize
 * @returns Aggregate retention counts
 */
export async function getRetentionSummary(facilityId: string): Promise<RetentionSummary> {
  const now = new Date();
  const config = await loadRetentionConfig(facilityId);

  // Use the maximum of billing and clinical years as the primary retention window
  const maxRetentionYears = Math.max(config.billingYears, config.clinicalYears);

  const result = await query<{
    total_cases: string;
    active_cases: string;
    billing_hold_cases: string;
    past_billing_hold_cases: string;
  }>(
    `SELECT
       COUNT(*) AS total_cases,
       COUNT(*) FILTER (
         WHERE status NOT IN ('COMPLETED', 'CANCELLED')
       ) AS active_cases,
       COUNT(*) FILTER (
         WHERE status IN ('COMPLETED', 'CANCELLED')
           AND EXISTS (
             SELECT 1 FROM surgical_case_status_event e
             WHERE e.surgical_case_id = sc.id
               AND e.to_status IN ('COMPLETED', 'CANCELLED')
               AND e.created_at + make_interval(years => $2) > NOW()
           )
       ) AS billing_hold_cases,
       COUNT(*) FILTER (
         WHERE status IN ('COMPLETED', 'CANCELLED')
           AND NOT EXISTS (
             SELECT 1 FROM surgical_case_status_event e
             WHERE e.surgical_case_id = sc.id
               AND e.to_status IN ('COMPLETED', 'CANCELLED')
               AND e.created_at + make_interval(years => $2) > NOW()
           )
       ) AS past_billing_hold_cases
     FROM surgical_case sc
     WHERE sc.facility_id = $1`,
    [facilityId, maxRetentionYears]
  );

  const row = result.rows[0];
  const totalCases = parseInt(row.total_cases, 10);
  const activeCases = parseInt(row.active_cases, 10);
  const billingHoldCases = parseInt(row.billing_hold_cases, 10);
  const pastBillingHoldCases = parseInt(row.past_billing_hold_cases, 10);

  // For cases past billing hold, check audit retention via SQL
  // Cases with recent audit access within audit_years are still retained
  const auditRetentionResult = await query<{ audit_hold_cases: string }>(
    `SELECT COUNT(*) AS audit_hold_cases
     FROM surgical_case sc
     WHERE sc.facility_id = $1
       AND sc.status IN ('COMPLETED', 'CANCELLED')
       AND NOT EXISTS (
         SELECT 1 FROM surgical_case_status_event e
         WHERE e.surgical_case_id = sc.id
           AND e.to_status IN ('COMPLETED', 'CANCELLED')
           AND e.created_at + make_interval(years => $2) > NOW()
       )
       AND EXISTS (
         SELECT 1 FROM phi_access_audit_log pal
         WHERE pal.case_id = sc.id
           AND pal.created_at + make_interval(years => $3) > NOW()
       )`,
    [facilityId, maxRetentionYears, config.auditYears]
  );

  const auditRetentionCases = parseInt(auditRetentionResult.rows[0].audit_hold_cases, 10);
  const purgeableCases = pastBillingHoldCases - auditRetentionCases;

  return {
    facilityId,
    totalCases,
    activeCases,
    billingHoldCases,
    auditRetentionCases,
    purgeableCases: Math.max(0, purgeableCases),
    evaluatedAt: now,
  };
}

/**
 * Get paginated retention eligibility list for a facility.
 *
 * Evaluates retention status for each case individually to produce
 * exact results (including audit retention checks).
 *
 * @param facilityId     - The facility to query
 * @param options.limit  - Page size (default 50)
 * @param options.offset - Page offset (default 0)
 * @param options.onlyPurgeable - If true, only return cases where isPurgeable = true
 * @returns Paginated list of RetentionStatus objects and total count
 */
export async function getRetentionEligibility(
  facilityId: string,
  options?: { limit?: number; offset?: number; onlyPurgeable?: boolean }
): Promise<{ cases: RetentionStatus[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const onlyPurgeable = options?.onlyPurgeable ?? false;

  // Get all case IDs for the facility (terminal cases first if filtering for purgeable)
  const caseListResult = await query<{ id: string; total: string }>(
    `SELECT id, COUNT(*) OVER() AS total
     FROM surgical_case
     WHERE facility_id = $1
     ORDER BY
       CASE WHEN status IN ('COMPLETED', 'CANCELLED') THEN 0 ELSE 1 END,
       scheduled_date DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [facilityId, onlyPurgeable ? 1000 : limit, onlyPurgeable ? 0 : offset]
  );

  if (caseListResult.rows.length === 0) {
    return { cases: [], total: 0 };
  }

  // Evaluate retention for each case
  const statuses: RetentionStatus[] = [];
  for (const row of caseListResult.rows) {
    try {
      const status = await getRetentionStatus(row.id, facilityId);
      if (!onlyPurgeable || status.isPurgeable) {
        statuses.push(status);
      }
    } catch {
      // Skip cases that fail evaluation (e.g., data inconsistencies)
      // In production, this would be logged for investigation
    }
  }

  // If filtering for purgeable, apply pagination after filtering
  if (onlyPurgeable) {
    const total = statuses.length;
    const paged = statuses.slice(offset, offset + limit);
    return { cases: paged, total };
  }

  const total = caseListResult.rows.length > 0
    ? parseInt(caseListResult.rows[0].total, 10)
    : 0;

  return { cases: statuses, total };
}
