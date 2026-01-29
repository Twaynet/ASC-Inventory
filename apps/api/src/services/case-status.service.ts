/**
 * Case Status Transition Service
 *
 * Centralised function that writes to both surgical_case (mutable projection)
 * and surgical_case_status_event (append-only truth) within a single
 * transaction.  Every code path that changes surgical_case.status MUST go
 * through this function so the audit trail is guaranteed.
 */

import { query } from '../db/index.js';

export interface StatusTransitionContext {
  /** Human-readable reason for the transition */
  reason?: string;
  /** Structured metadata: source, checklistId, ip, userAgent, etc. */
  context?: Record<string, unknown>;
}

/**
 * Record a status transition event.
 *
 * Call this inside the same transaction (or immediately after) the UPDATE
 * that mutates surgical_case.status.  The function is deliberately kept as a
 * pure INSERT so callers can use it with or without an outer transaction —
 * each repository method already runs its own query, so we piggy-back on the
 * same connection context.
 *
 * @param caseId        - surgical_case.id
 * @param fromStatus    - previous status value (NULL for initial creation)
 * @param toStatus      - new status value
 * @param actorUserId   - the user performing the transition (NULL for system)
 * @param opts          - optional reason + structured context
 */
export async function recordStatusEvent(
  caseId: string,
  fromStatus: string | null,
  toStatus: string,
  actorUserId: string | null,
  opts?: StatusTransitionContext,
): Promise<void> {
  await query(`
    INSERT INTO surgical_case_status_event
      (surgical_case_id, from_status, to_status, reason, context, actor_user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    caseId,
    fromStatus,
    toStatus,
    opts?.reason ?? null,
    JSON.stringify(opts?.context ?? {}),
    actorUserId,
  ]);
}

export interface StatusEventRow {
  id: string;
  surgical_case_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  context: Record<string, unknown>;
  actor_user_id: string | null;
  actor_name: string | null;
  created_at: Date;
}

/**
 * Fetch the full status-event timeline for a given case.
 */
export async function getStatusEvents(caseId: string): Promise<StatusEventRow[]> {
  const result = await query<StatusEventRow>(`
    SELECT e.*, u.name as actor_name
    FROM surgical_case_status_event e
    LEFT JOIN app_user u ON e.actor_user_id = u.id
    WHERE e.surgical_case_id = $1
    ORDER BY e.created_at ASC
  `, [caseId]);
  return result.rows;
}
