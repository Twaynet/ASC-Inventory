/**
 * PHI Audit Analytics Service — Phase 4
 *
 * Server-side computed summaries over phi_access_audit_log.
 * Provides session reconstruction, excessive-denial detection, and
 * aggregated analytics for compliance dashboards.
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Analytics & Anomaly Detection
 *
 * Key design decisions:
 * - Session gap threshold is config-driven (phi.audit.session_gap_minutes)
 * - Excessive denial threshold is config-driven (phi.audit.excessive_denial_threshold)
 * - All queries are facility-scoped
 * - No UI concerns; pure data service
 */

import { query } from '../db/index.js';
import { getEffectiveConfigValue } from './config.service.js';

// ============================================================================
// Types
// ============================================================================

/** A reconstructed user session derived from audit log access timestamps. */
export interface AuditSession {
  userId: string;
  userName: string;
  sessionStart: Date;
  sessionEnd: Date;
  accessCount: number;
  denialCount: number;
  emergencyCount: number;
  classifications: string[];
  purposes: string[];
  caseIds: string[];
  isSuspicious: boolean;
  suspiciousReasons: string[];
}

/** A single hourly bucket where a user exceeded the denial threshold. */
export interface ExcessiveDenialEntry {
  userId: string;
  userName: string;
  hourBucket: Date;
  denialCount: number;
  denialReasons: string[];
  threshold: number;
}

/** High-level analytics summary across audit sessions. */
export interface AuditAnalyticsSummary {
  totalSessions: number;
  suspiciousSessionCount: number;
  excessiveDenialCount: number;
  topUsers: Array<{ userId: string; userName: string; accessCount: number }>;
}

/** Options for filtering audit sessions. */
export interface AuditSessionOptions {
  userId?: string;
  startDate?: string;
  endDate?: string;
  onlySuspicious?: boolean;
  limit?: number;
  offset?: number;
}

/** Options for filtering excessive denial queries. */
export interface ExcessiveDenialOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// ============================================================================
// Config helpers
// ============================================================================

const DEFAULT_SESSION_GAP_MINUTES = 15;
const DEFAULT_EXCESSIVE_DENIAL_THRESHOLD = 10;

/**
 * Resolve the session gap threshold (in minutes) from the config registry.
 * Falls back to 15 minutes if the key is missing or unparseable.
 */
async function resolveSessionGapMinutes(facilityId: string): Promise<number> {
  const raw = await getEffectiveConfigValue('phi.audit.session_gap_minutes', facilityId);
  if (raw === null || raw === undefined) return DEFAULT_SESSION_GAP_MINUTES;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_GAP_MINUTES;
}

/**
 * Resolve the excessive denial threshold from the config registry.
 * Falls back to 10 if the key is missing or unparseable.
 */
async function resolveExcessiveDenialThreshold(facilityId: string): Promise<number> {
  const raw = await getEffectiveConfigValue('phi.audit.excessive_denial_threshold', facilityId);
  if (raw === null || raw === undefined) return DEFAULT_EXCESSIVE_DENIAL_THRESHOLD;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXCESSIVE_DENIAL_THRESHOLD;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Reconstruct user access sessions from the PHI audit log.
 *
 * Uses a SQL LAG() window function to detect temporal gaps between
 * consecutive access events per user. When the gap exceeds the
 * configured threshold (default 15 min), a new session boundary is
 * created. Each session is then aggregated with counts, distinct
 * classifications, purposes, case IDs, and suspicious-activity flags.
 *
 * Suspicious session heuristics:
 * 1. Session includes emergency access AND any OUTSIDE_CLINICAL_WINDOW denial
 * 2. Session includes emergency access AND at least one denial
 * 3. Session includes >5 distinct case IDs accessed via EMERGENCY purpose
 *
 * @param facilityId - Facility to scope the query
 * @param options    - Optional filters: userId, date range, suspicious-only, pagination
 * @returns Object with `sessions` array and `total` count (before pagination)
 */
export async function getAuditSessions(
  facilityId: string,
  options: AuditSessionOptions = {}
): Promise<{ sessions: AuditSession[]; total: number }> {
  const gapMinutes = await resolveSessionGapMinutes(facilityId);

  // -- Build optional WHERE conditions for the inner query --
  const innerConditions: string[] = ['a.facility_id = $1'];
  const params: unknown[] = [facilityId];
  let paramIndex = 2;

  if (options.userId) {
    innerConditions.push(`a.user_id = $${paramIndex}`);
    params.push(options.userId);
    paramIndex++;
  }

  if (options.startDate) {
    innerConditions.push(`a.created_at >= $${paramIndex}::date`);
    params.push(options.startDate);
    paramIndex++;
  }

  if (options.endDate) {
    innerConditions.push(`a.created_at < ($${paramIndex}::date + interval '1 day')`);
    params.push(options.endDate);
    paramIndex++;
  }

  const innerWhere = innerConditions.join(' AND ');

  // -- Gap threshold parameter --
  const gapParamIdx = paramIndex;
  params.push(gapMinutes);
  paramIndex++;

  // -- Outer filters for suspicious-only --
  const outerConditions: string[] = [];
  if (options.onlySuspicious) {
    outerConditions.push('s.is_suspicious = true');
  }
  const outerWhere = outerConditions.length > 0
    ? `WHERE ${outerConditions.join(' AND ')}`
    : '';

  // The CTE reconstructs sessions using window functions:
  // Step 1: LAG to find previous access time per user
  // Step 2: Mark session boundaries when gap exceeds threshold
  // Step 3: Running SUM to assign session IDs
  // Step 4: Aggregate per (user, session)
  const sessionCte = `
    WITH ordered_access AS (
      SELECT
        a.user_id,
        a.created_at,
        a.outcome,
        a.denial_reason,
        a.is_emergency,
        a.phi_classification,
        a.access_purpose,
        a.case_id,
        LAG(a.created_at) OVER (
          PARTITION BY a.user_id ORDER BY a.created_at
        ) AS prev_created_at
      FROM phi_access_audit_log a
      WHERE ${innerWhere}
    ),
    with_boundaries AS (
      SELECT
        *,
        CASE
          WHEN prev_created_at IS NULL THEN 1
          WHEN EXTRACT(EPOCH FROM (created_at - prev_created_at)) / 60 > $${gapParamIdx} THEN 1
          ELSE 0
        END AS is_new_session
      FROM ordered_access
    ),
    with_session_id AS (
      SELECT
        *,
        SUM(is_new_session) OVER (
          PARTITION BY user_id ORDER BY created_at
          ROWS UNBOUNDED PRECEDING
        ) AS session_id
      FROM with_boundaries
    ),
    sessions AS (
      SELECT
        ws.user_id,
        ws.session_id,
        MIN(ws.created_at) AS session_start,
        MAX(ws.created_at) AS session_end,
        COUNT(*)::int AS access_count,
        COUNT(*) FILTER (WHERE ws.outcome = 'DENIED')::int AS denial_count,
        COUNT(*) FILTER (WHERE ws.is_emergency = true)::int AS emergency_count,
        ARRAY_AGG(DISTINCT ws.phi_classification) AS classifications,
        ARRAY_AGG(DISTINCT ws.access_purpose) AS purposes,
        ARRAY_AGG(DISTINCT ws.case_id) FILTER (WHERE ws.case_id IS NOT NULL) AS case_ids,
        -- Suspicious: emergency + OUTSIDE_CLINICAL_WINDOW denial
        (
          COUNT(*) FILTER (WHERE ws.is_emergency = true) > 0
          AND COUNT(*) FILTER (WHERE ws.denial_reason = 'OUTSIDE_CLINICAL_WINDOW') > 0
        ) AS suspicious_emergency_outside_window,
        -- Suspicious: emergency + any denial
        (
          COUNT(*) FILTER (WHERE ws.is_emergency = true) > 0
          AND COUNT(*) FILTER (WHERE ws.outcome = 'DENIED') > 0
        ) AS suspicious_emergency_with_denial,
        -- Suspicious: >5 distinct cases via emergency
        (
          COUNT(DISTINCT ws.case_id) FILTER (WHERE ws.access_purpose = 'EMERGENCY') > 5
        ) AS suspicious_excessive_emergency_cases
      FROM with_session_id ws
      GROUP BY ws.user_id, ws.session_id
    ),
    flagged_sessions AS (
      SELECT
        s.*,
        u.name AS user_name,
        (
          s.suspicious_emergency_outside_window
          OR s.suspicious_emergency_with_denial
          OR s.suspicious_excessive_emergency_cases
        ) AS is_suspicious
      FROM sessions s
      LEFT JOIN app_user u ON u.id = s.user_id
    )
  `;

  // -- Total count (respecting outer filters) --
  const countSql = `
    ${sessionCte}
    SELECT COUNT(*)::int AS total
    FROM flagged_sessions s
    ${outerWhere}
  `;

  const countResult = await query<{ total: number }>(countSql, params);
  const total = countResult.rows[0]?.total ?? 0;

  // -- Paginated result --
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const limitParamIdx = paramIndex;
  params.push(limit);
  paramIndex++;

  const offsetParamIdx = paramIndex;
  params.push(offset);
  paramIndex++;

  const dataSql = `
    ${sessionCte}
    SELECT
      s.user_id,
      s.user_name,
      s.session_start,
      s.session_end,
      s.access_count,
      s.denial_count,
      s.emergency_count,
      s.classifications,
      s.purposes,
      COALESCE(s.case_ids, ARRAY[]::uuid[]) AS case_ids,
      s.is_suspicious,
      s.suspicious_emergency_outside_window,
      s.suspicious_emergency_with_denial,
      s.suspicious_excessive_emergency_cases
    FROM flagged_sessions s
    ${outerWhere}
    ORDER BY s.session_start DESC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  const dataResult = await query(dataSql, params);

  const sessions: AuditSession[] = dataResult.rows.map((row) => {
    const suspiciousReasons: string[] = [];
    if (row.suspicious_emergency_outside_window) {
      suspiciousReasons.push('Emergency access with OUTSIDE_CLINICAL_WINDOW denial');
    }
    if (row.suspicious_emergency_with_denial) {
      suspiciousReasons.push('Emergency access with denied request(s)');
    }
    if (row.suspicious_excessive_emergency_cases) {
      suspiciousReasons.push('More than 5 distinct cases accessed via EMERGENCY in one session');
    }

    return {
      userId: row.user_id,
      userName: row.user_name ?? 'Unknown',
      sessionStart: row.session_start,
      sessionEnd: row.session_end,
      accessCount: row.access_count,
      denialCount: row.denial_count,
      emergencyCount: row.emergency_count,
      classifications: row.classifications ?? [],
      purposes: row.purposes ?? [],
      caseIds: (row.case_ids ?? []).map((id: string) => id),
      isSuspicious: row.is_suspicious ?? false,
      suspiciousReasons,
    };
  });

  return { sessions, total };
}

/**
 * Detect hourly buckets where a user received an excessive number of
 * PHI access denials.
 *
 * Groups denials by user and hour (date_trunc), then filters to only
 * those buckets exceeding the configured threshold (default 10).
 *
 * @param facilityId - Facility to scope the query
 * @param options    - Optional date range and limit
 * @returns Array of ExcessiveDenialEntry, most recent first
 */
export async function getExcessiveDenials(
  facilityId: string,
  options: ExcessiveDenialOptions = {}
): Promise<ExcessiveDenialEntry[]> {
  const threshold = await resolveExcessiveDenialThreshold(facilityId);

  const conditions: string[] = [
    'a.facility_id = $1',
    "a.outcome = 'DENIED'",
  ];
  const params: unknown[] = [facilityId];
  let paramIndex = 2;

  if (options.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}::date`);
    params.push(options.startDate);
    paramIndex++;
  }

  if (options.endDate) {
    conditions.push(`a.created_at < ($${paramIndex}::date + interval '1 day')`);
    params.push(options.endDate);
    paramIndex++;
  }

  const thresholdParamIdx = paramIndex;
  params.push(threshold);
  paramIndex++;

  const limit = options.limit ?? 100;
  const limitParamIdx = paramIndex;
  params.push(limit);
  paramIndex++;

  const sql = `
    SELECT
      a.user_id,
      u.name AS user_name,
      date_trunc('hour', a.created_at) AS hour_bucket,
      COUNT(*)::int AS denial_count,
      ARRAY_AGG(DISTINCT a.denial_reason) FILTER (WHERE a.denial_reason IS NOT NULL) AS denial_reasons
    FROM phi_access_audit_log a
    LEFT JOIN app_user u ON u.id = a.user_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY a.user_id, u.name, date_trunc('hour', a.created_at)
    HAVING COUNT(*) > $${thresholdParamIdx}
    ORDER BY hour_bucket DESC
    LIMIT $${limitParamIdx}
  `;

  const result = await query(sql, params);

  return result.rows.map((row) => ({
    userId: row.user_id,
    userName: row.user_name ?? 'Unknown',
    hourBucket: row.hour_bucket,
    denialCount: row.denial_count,
    denialReasons: row.denial_reasons ?? [],
    threshold,
  }));
}

/**
 * Compute a high-level analytics summary for a facility's PHI audit data.
 *
 * Aggregates session and denial data by calling getAuditSessions and
 * getExcessiveDenials internally, then derives:
 * - Total session count
 * - Suspicious session count
 * - Excessive denial bucket count
 * - Top 5 users by access count in the date range
 *
 * @param facilityId - Facility to scope the query
 * @param startDate  - Optional start date (inclusive)
 * @param endDate    - Optional end date (inclusive)
 * @returns AuditAnalyticsSummary
 */
export async function getAuditAnalytics(
  facilityId: string,
  startDate?: string,
  endDate?: string
): Promise<AuditAnalyticsSummary> {
  // Fetch all sessions (unpaginated) for the date range
  const [sessionsResult, excessiveDenials] = await Promise.all([
    getAuditSessions(facilityId, {
      startDate,
      endDate,
      limit: 10000, // High limit to capture all sessions for summary
      offset: 0,
    }),
    getExcessiveDenials(facilityId, { startDate, endDate }),
  ]);

  const { sessions, total: totalSessions } = sessionsResult;

  const suspiciousSessionCount = sessions.filter((s) => s.isSuspicious).length;

  // Build top 5 users by total access count across their sessions
  const userAccessMap = new Map<string, { userName: string; accessCount: number }>();
  for (const session of sessions) {
    const existing = userAccessMap.get(session.userId);
    if (existing) {
      existing.accessCount += session.accessCount;
    } else {
      userAccessMap.set(session.userId, {
        userName: session.userName,
        accessCount: session.accessCount,
      });
    }
  }

  const topUsers = Array.from(userAccessMap.entries())
    .map(([userId, data]) => ({
      userId,
      userName: data.userName,
      accessCount: data.accessCount,
    }))
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 5);

  return {
    totalSessions,
    suspiciousSessionCount,
    excessiveDenialCount: excessiveDenials.length,
    topUsers,
  };
}
