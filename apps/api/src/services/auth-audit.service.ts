/**
 * Authentication Audit Service
 *
 * LAW §11.1: All Control Plane mutations emit immutable audit events
 * LAW §11.2: Audit events include request correlation ID
 */

import { query } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

export type AuthEventType = 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT';

export type AuthFailureReason =
  | 'user_not_found'
  | 'bad_password'
  | 'account_disabled'
  | 'facility_not_found'
  | 'invalid_token';

export interface AuthAuditContext {
  eventType: AuthEventType;
  facilityId?: string | null;
  userId?: string | null;
  username: string;
  userRoles?: string[] | null;
  success: boolean;
  failureReason?: AuthFailureReason | null;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthAuditLogEntry {
  id: string;
  eventType: AuthEventType;
  facilityId: string | null;
  facilityName: string | null;
  userId: string | null;
  username: string;
  userRoles: string[] | null;
  success: boolean;
  failureReason: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuthAuditFilters {
  facilityId?: string | null;  // null means platform-only, undefined means all
  eventType?: AuthEventType;
  success?: boolean;
  userId?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Log an authentication event (LAW §11.1)
 */
export async function logAuthEvent(context: AuthAuditContext): Promise<void> {
  await query(
    `INSERT INTO auth_audit_log (
      event_type,
      facility_id,
      user_id,
      username,
      user_roles,
      success,
      failure_reason,
      request_id,
      ip_address,
      user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      context.eventType,
      context.facilityId || null,
      context.userId || null,
      context.username,
      context.userRoles || null,
      context.success,
      context.failureReason || null,
      context.requestId || null,
      context.ipAddress || null,
      context.userAgent || null,
    ]
  );
}

/**
 * Query authentication audit log with filters
 */
export async function getAuthAuditLog(
  filters: AuthAuditFilters = {}
): Promise<{ entries: AuthAuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Filter by facility
  if (filters.facilityId === null) {
    // Platform-only logins (facility_id IS NULL)
    conditions.push('a.facility_id IS NULL');
  } else if (filters.facilityId !== undefined) {
    conditions.push(`a.facility_id = $${paramIndex}`);
    params.push(filters.facilityId);
    paramIndex++;
  }

  // Filter by event type
  if (filters.eventType) {
    conditions.push(`a.event_type = $${paramIndex}`);
    params.push(filters.eventType);
    paramIndex++;
  }

  // Filter by success
  if (filters.success !== undefined) {
    conditions.push(`a.success = $${paramIndex}`);
    params.push(filters.success);
    paramIndex++;
  }

  // Filter by user
  if (filters.userId) {
    conditions.push(`a.user_id = $${paramIndex}`);
    params.push(filters.userId);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM auth_audit_log a ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Get entries with facility name join
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const result = await query(
    `SELECT
      a.id,
      a.event_type,
      a.facility_id,
      f.name as facility_name,
      a.user_id,
      a.username,
      a.user_roles,
      a.success,
      a.failure_reason,
      a.request_id,
      a.ip_address,
      a.user_agent,
      a.created_at
    FROM auth_audit_log a
    LEFT JOIN facility f ON a.facility_id = f.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const entries: AuthAuditLogEntry[] = result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    userId: row.user_id,
    username: row.username,
    userRoles: row.user_roles,
    success: row.success,
    failureReason: row.failure_reason,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));

  return { entries, total };
}
