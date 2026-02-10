/**
 * PHI Access Guard — Fastify preHandler middleware
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Access Model
 * PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW — Phase 3
 *
 * Enforces PHI access control:
 * 1. Validates X-Access-Purpose header
 * 1b. Emergency handling (justification, rate limit, bypass flags)
 * 2. Resolves user's organization affiliations (skipped for EMERGENCY)
 * 3. Checks PHI capability from role
 * 3.5. Clinical care window enforcement (Phase 3)
 * 4. Evaluates case-level access (org affiliation, grants, purpose override)
 * 5. Logs every access attempt to phi_access_audit_log
 *
 * Constraints:
 * - Constraint 4: Every attempt logged, including malformed
 * - Constraint 5: Deny if ANY prerequisite unresolvable
 * - Phase 3: Time reduces access, never expands it
 * - Phase 3: Emergency bypasses org + time, NOT facility + capability
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  type PhiClassification,
  type AccessPurpose,
  AccessPurpose as AccessPurposeEnum,
  PHI_CLASSIFICATION_TO_CAPABILITY,
  CLINICAL_CARE_WINDOW_DEFAULTS,
  deriveCapabilities,
  type Capability,
} from '@asc/domain';
import { getUserRoles, type JwtPayload } from './auth.js';
import { logPhiAccess, logPhiExport, type PhiAccessContext } from '../services/phi-audit.service.js';
import { getOrganizationRepository } from '../repositories/index.js';
import { query } from '../db/index.js';
import { getEffectiveConfigValue } from '../services/config.service.js';

// ============================================================================
// Request decoration types
// ============================================================================

export interface PhiRequestContext {
  classification: PhiClassification;
  purpose: AccessPurpose;
  organizationIds: string[];
  isEmergency: boolean;
  /** Audit log entry ID — used by export logging */
  auditLogId?: string;
  /** Promise that resolves to audit log ID — awaited by logExportEvent to avoid race */
  auditLogReady?: Promise<string | undefined>;
}

// Extend Fastify request with PHI context
declare module 'fastify' {
  interface FastifyRequest {
    phiContext?: PhiRequestContext;
  }
}

// ============================================================================
// Emergency rate limiting (in-memory, per user per hour)
// ============================================================================

const EMERGENCY_RATE_LIMIT = 10; // max emergency accesses per user per hour
const emergencyRateMap = new Map<string, { count: number; resetAt: number }>();

function checkEmergencyRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = emergencyRateMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    emergencyRateMap.set(userId, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= EMERGENCY_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================================
// Helper: resolve caseId from request params, body, or query
// ============================================================================

function resolveCaseId(request: FastifyRequest, caseIdFrom?: string): string | null {
  const params = request.params as Record<string, string> | undefined;

  // If caller specifies param name, use that (e.g. 'id' for /cases/:id/*)
  if (caseIdFrom && params?.[caseIdFrom]) return params[caseIdFrom];

  // Default: check params.caseId
  if (params?.caseId) return params.caseId;

  // Check body
  const body = request.body as Record<string, unknown> | undefined;
  if (body?.caseId && typeof body.caseId === 'string') return body.caseId;

  // Check query
  const queryParams = request.query as Record<string, string> | undefined;
  if (queryParams?.caseId) return queryParams.caseId;

  return null;
}

// ============================================================================
// Helper: build audit context for logging
// ============================================================================

function buildAuditContext(
  request: FastifyRequest,
  user: JwtPayload,
  classification: PhiClassification,
  purpose: string,
  organizationIds: string[],
  caseId: string | null,
  outcome: 'ALLOWED' | 'DENIED',
  denialReason?: string,
  isEmergency?: boolean,
  emergencyJustification?: string
): PhiAccessContext {
  return {
    userId: user.userId,
    userRoles: getUserRoles(user),
    facilityId: user.facilityId || '',
    organizationIds,
    caseId,
    phiClassification: classification,
    accessPurpose: purpose as PhiAccessContext['accessPurpose'],
    outcome,
    denialReason: denialReason || null,
    requestId: request.requestId,
    endpoint: request.url,
    httpMethod: request.method,
    isEmergency: isEmergency || false,
    emergencyJustification: emergencyJustification || null,
  };
}

// ============================================================================
// Helper: clinical care window evaluation (Phase 3)
// ============================================================================

async function evaluateClinicalCareWindow(
  caseId: string,
  facilityId: string
): Promise<{ allowed: boolean }> {
  const now = new Date();

  // Get case scheduled_date
  const caseResult = await query<{
    scheduled_date: Date | null;
  }>(
    `SELECT scheduled_date FROM surgical_case WHERE id = $1 AND facility_id = $2`,
    [caseId, facilityId]
  );

  if (caseResult.rows.length === 0) {
    // Case not found — caller already handles this; but defensive return
    return { allowed: false };
  }

  const scheduledDate = caseResult.rows[0].scheduled_date;

  // Use same query pattern as getStatusEvents (case-status.service.ts)
  // Find COMPLETED status event for this case
  const completionResult = await query<{ created_at: Date }>(
    `SELECT created_at FROM surgical_case_status_event
     WHERE surgical_case_id = $1 AND to_status = 'COMPLETED'
     ORDER BY created_at DESC LIMIT 1`,
    [caseId]
  );

  const completionTimestamp = completionResult.rows.length > 0
    ? completionResult.rows[0].created_at
    : null;

  // Resolve facility config overrides, falling back to defaults
  let preOpDays: number = CLINICAL_CARE_WINDOW_DEFAULTS.preOpDays;
  let postCompletionDays: number = CLINICAL_CARE_WINDOW_DEFAULTS.postCompletionDays;

  try {
    const preOpOverride = await getEffectiveConfigValue(
      'phi.clinical_care_window.pre_op_days', facilityId
    );
    if (typeof preOpOverride === 'number' && preOpOverride > 0) {
      preOpDays = preOpOverride;
    }

    const postCompletionOverride = await getEffectiveConfigValue(
      'phi.clinical_care_window.post_completion_days', facilityId
    );
    if (typeof postCompletionOverride === 'number' && postCompletionOverride > 0) {
      postCompletionDays = postCompletionOverride;
    }
  } catch {
    // Config lookup failure → use defaults (don't block access for config issues)
  }

  // Evaluate window: [scheduledDate - preOpDays, completionTimestamp + postCompletionDays]

  // Check pre-op boundary (if scheduledDate exists)
  if (scheduledDate) {
    const windowStart = new Date(scheduledDate);
    windowStart.setDate(windowStart.getDate() - preOpDays);
    if (now < windowStart) {
      return { allowed: false };
    }
  }
  // If scheduledDate is NULL: start is unbounded — no pre-op denial

  // Check post-completion boundary (if case is completed)
  if (completionTimestamp) {
    const windowEnd = new Date(completionTimestamp);
    windowEnd.setDate(windowEnd.getDate() + postCompletionDays);
    if (now > windowEnd) {
      return { allowed: false };
    }
  }
  // If completionTimestamp is NULL: case is not completed — end is unbounded

  return { allowed: true };
}

// ============================================================================
// Export purpose enforcement (centralized for all export endpoints)
// ============================================================================

const VALID_EXPORT_PURPOSES: AccessPurpose[] = ['AUDIT', 'BILLING'];

/**
 * Check if the current request's PHI purpose is valid for export.
 * Returns null if valid, or an error message if invalid.
 */
export function validateExportPurpose(request: FastifyRequest): string | null {
  const purpose = request.phiContext?.purpose;
  if (!purpose) return 'No PHI context available';

  if (!VALID_EXPORT_PURPOSES.includes(purpose)) {
    return `Export requires AUDIT or BILLING purpose; received ${purpose}`;
  }

  return null;
}

/**
 * Log export metadata after a successful export response.
 * Best-effort: errors are caught internally and do not break the response.
 */
export async function logExportEvent(
  request: FastifyRequest,
  format: string,
  rowCount: number
): Promise<void> {
  try {
    // Await the audit log promise to ensure the audit log ID is available
    // (guards against race between fire-and-forget audit log and route handler)
    const auditLogId = request.phiContext?.auditLogReady
      ? await request.phiContext.auditLogReady
      : request.phiContext?.auditLogId;
    if (!auditLogId) return;
    await logPhiExport(auditLogId, format, rowCount);
  } catch (err) {
    request.log.error(err, 'Failed to log PHI export event (best-effort)');
  }
}

// ============================================================================
// Main guard: requirePhiAccess
// ============================================================================

/**
 * Require PHI access for a given classification.
 *
 * Must be used AFTER fastify.authenticate (JWT must be verified).
 *
 * Options:
 * - evaluateCase: if true, resolves caseId from request and evaluates
 *   case-level access (org affiliation, grants, purpose override, time window).
 * - caseIdFrom: custom param name to resolve caseId from (e.g. 'id').
 */
export function requirePhiAccess(
  classification: PhiClassification,
  options: { evaluateCase?: boolean; caseIdFrom?: string } = {}
) {
  const { evaluateCase = false, caseIdFrom } = options;

  return async function phiGuard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;

    // Pre-check: user must be authenticated with facility context
    if (!user || !user.facilityId) {
      const minCtx: PhiAccessContext = {
        userId: user?.userId || 'unknown',
        userRoles: [],
        facilityId: '',
        organizationIds: [],
        phiClassification: classification,
        accessPurpose: 'CLINICAL_CARE',
        outcome: 'DENIED',
        denialReason: 'NO_FACILITY_CONTEXT',
        requestId: request.requestId,
        endpoint: request.url,
        httpMethod: request.method,
      };
      await logPhiAccess(minCtx);
      return reply.status(403).send({
        error: {
          code: 'PHI_ACCESS_DENIED',
          message: 'PHI access requires authenticated facility context',
          requestId: request.requestId,
        },
      });
    }

    const facilityId = user.facilityId;
    const userRoles = getUserRoles(user);

    // ------------------------------------------------------------------
    // Step 1: Extract and validate purpose — DENY if missing/invalid
    // ------------------------------------------------------------------
    const purposeHeader = request.headers['x-access-purpose'] as string | undefined;
    if (!purposeHeader) {
      const ctx = buildAuditContext(
        request, user, classification, 'CLINICAL_CARE', [], null, 'DENIED', 'MISSING_PURPOSE_HEADER'
      );
      await logPhiAccess(ctx);
      return reply.status(403).send({
        error: {
          code: 'PHI_ACCESS_DENIED',
          message: 'X-Access-Purpose header is required for PHI access',
          requestId: request.requestId,
        },
      });
    }

    const purposeResult = AccessPurposeEnum.safeParse(purposeHeader);
    if (!purposeResult.success) {
      const ctx = buildAuditContext(
        request, user, classification, 'CLINICAL_CARE', [], null,
        'DENIED', `INVALID_PURPOSE:${purposeHeader}`
      );
      await logPhiAccess(ctx);
      return reply.status(403).send({
        error: {
          code: 'PHI_ACCESS_DENIED',
          message: `Invalid X-Access-Purpose: ${purposeHeader}`,
          requestId: request.requestId,
        },
      });
    }

    const purpose = purposeResult.data;

    // ------------------------------------------------------------------
    // Step 1b: Emergency handling (Phase 3)
    // ------------------------------------------------------------------
    let isEmergency = false;
    let emergencyJustification: string | undefined;

    if (purpose === 'EMERGENCY') {
      // Extract justification
      const justification = request.headers['x-emergency-justification'] as string | undefined;
      if (!justification || justification.trim().length < 10) {
        const ctx = buildAuditContext(
          request, user, classification, purpose, [], null,
          'DENIED', 'EMERGENCY_JUSTIFICATION_REQUIRED', true, justification
        );
        await logPhiAccess(ctx);
        return reply.status(403).send({
          error: {
            code: 'PHI_ACCESS_DENIED',
            message: 'Emergency access requires X-Emergency-Justification header (minimum 10 characters)',
            requestId: request.requestId,
          },
        });
      }

      // Rate limit check
      if (!checkEmergencyRateLimit(user.userId)) {
        const ctx = buildAuditContext(
          request, user, classification, purpose, [], null,
          'DENIED', 'EMERGENCY_RATE_LIMIT', true, justification
        );
        await logPhiAccess(ctx);
        return reply.status(429).send({
          error: {
            code: 'PHI_ACCESS_DENIED',
            message: 'Emergency access rate limit exceeded. Maximum 10 per hour.',
            requestId: request.requestId,
          },
        });
      }

      isEmergency = true;
      emergencyJustification = justification.trim();
    }

    // ------------------------------------------------------------------
    // Step 2: Resolve user's org affiliations — DENY if none
    // (SKIPPED for EMERGENCY — emergency bypasses org affiliation)
    // ------------------------------------------------------------------
    const orgRepo = getOrganizationRepository();
    let organizationIds: string[] = [];

    if (!isEmergency) {
      let affiliations;
      try {
        affiliations = await orgRepo.getUserAffiliations(user.userId, facilityId);
      } catch (err) {
        request.log.error(err, 'Failed to resolve user org affiliations');
        const ctx = buildAuditContext(
          request, user, classification, purpose, [], null, 'DENIED', 'AFFILIATION_RESOLUTION_ERROR'
        );
        await logPhiAccess(ctx);
        return reply.status(403).send({
          error: {
            code: 'PHI_ACCESS_DENIED',
            message: 'Unable to resolve organizational affiliations',
            requestId: request.requestId,
          },
        });
      }

      organizationIds = affiliations.map(a => a.organizationId);

      if (affiliations.length === 0) {
        const ctx = buildAuditContext(
          request, user, classification, purpose, [], null, 'DENIED', 'NO_ORG_AFFILIATIONS'
        );
        await logPhiAccess(ctx);
        return reply.status(403).send({
          error: {
            code: 'PHI_ACCESS_DENIED',
            message: 'User has no active organizational affiliations',
            requestId: request.requestId,
          },
        });
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Check PHI capability — DENY if missing
    // (NOT skipped for emergency — LAW §4.1: EMERGENCY does not bypass capability)
    // ------------------------------------------------------------------
    const userCaps = deriveCapabilities(userRoles);
    const requiredCap: Capability = PHI_CLASSIFICATION_TO_CAPABILITY[classification];

    if (!userCaps.includes(requiredCap)) {
      const ctx = buildAuditContext(
        request, user, classification, purpose, organizationIds, null,
        'DENIED', 'MISSING_PHI_CAPABILITY', isEmergency, emergencyJustification
      );
      await logPhiAccess(ctx);
      return reply.status(403).send({
        error: {
          code: 'PHI_ACCESS_DENIED',
          message: `Missing required capability: ${requiredCap}`,
          requestId: request.requestId,
        },
      });
    }

    // ------------------------------------------------------------------
    // Step 4: Case-level evaluation (includes time window)
    // ------------------------------------------------------------------
    let caseId: string | null = null;

    if (evaluateCase) {
      caseId = resolveCaseId(request, caseIdFrom);

      if (caseId) {
        // Resolve case's primary_organization_id and verify same facility
        const caseResult = await query<{
          primary_organization_id: string | null;
          facility_id: string;
        }>(
          `SELECT primary_organization_id, facility_id FROM surgical_case WHERE id = $1`,
          [caseId]
        );

        if (caseResult.rows.length === 0) {
          const ctx = buildAuditContext(
            request, user, classification, purpose, organizationIds, caseId,
            'DENIED', 'CASE_NOT_FOUND', isEmergency, emergencyJustification
          );
          await logPhiAccess(ctx);
          return reply.status(403).send({
            error: {
              code: 'PHI_ACCESS_DENIED',
              message: 'Case not found',
              requestId: request.requestId,
            },
          });
        }

        const caseRow = caseResult.rows[0];

        // Verify case belongs to same facility
        // (NOT bypassed by EMERGENCY — LAW §4.1)
        if (caseRow.facility_id !== facilityId) {
          const ctx = buildAuditContext(
            request, user, classification, purpose, organizationIds, caseId,
            'DENIED', 'CROSS_FACILITY_ACCESS', isEmergency, emergencyJustification
          );
          await logPhiAccess(ctx);
          return reply.status(403).send({
            error: {
              code: 'PHI_ACCESS_DENIED',
              message: 'Cross-facility PHI access is prohibited',
              requestId: request.requestId,
            },
          });
        }

        // ----------------------------------------------------------------
        // Step 3.5: Clinical care window enforcement (Phase 3)
        // Applies to PHI_CLINICAL with CLINICAL_CARE or SCHEDULING purpose.
        // EMERGENCY bypasses time window.
        // BILLING and AUDIT are not affected by time window.
        // ----------------------------------------------------------------
        if (
          !isEmergency &&
          classification === 'PHI_CLINICAL' &&
          (purpose === 'CLINICAL_CARE' || purpose === 'SCHEDULING')
        ) {
          const windowResult = await evaluateClinicalCareWindow(caseId, facilityId);

          if (!windowResult.allowed) {
            const ctx = buildAuditContext(
              request, user, classification, purpose, organizationIds, caseId,
              'DENIED', 'OUTSIDE_CLINICAL_WINDOW'
            );
            await logPhiAccess(ctx);
            return reply.status(403).send({
              error: {
                code: 'PHI_ACCESS_DENIED',
                message: 'Access denied: outside clinical care window',
                denialReason: 'OUTSIDE_CLINICAL_WINDOW',
                requestId: request.requestId,
              },
            });
          }
        }

        // ----------------------------------------------------------------
        // Case-level org evaluation (SKIPPED for EMERGENCY)
        // ----------------------------------------------------------------
        if (!isEmergency) {
          // If attribution missing/unresolvable → DENY + log
          if (!caseRow.primary_organization_id) {
            const ctx = buildAuditContext(
              request, user, classification, purpose, organizationIds, caseId,
              'DENIED', 'CASE_ATTRIBUTION_MISSING'
            );
            await logPhiAccess(ctx);
            return reply.status(403).send({
              error: {
                code: 'PHI_ACCESS_DENIED',
                message: 'Case has no primary organization attribution',
                requestId: request.requestId,
              },
            });
          }

          const caseOrgId = caseRow.primary_organization_id;

          // Evaluate access:
          // ALLOW if (user affiliated with primary org)
          //     OR (has active case_access_grant for that case)
          //     OR (purpose=BILLING/AUDIT with appropriate capability)
          const isAffiliated = organizationIds.includes(caseOrgId);

          let hasGrant = false;
          if (!isAffiliated) {
            const grants = await orgRepo.getActiveCaseGrants(caseId);
            hasGrant = grants.some(g => g.grantedToUserId === user.userId);
          }

          const isPurposeOverride =
            (purpose === 'BILLING' && userCaps.includes('PHI_BILLING_ACCESS')) ||
            (purpose === 'AUDIT' && userCaps.includes('PHI_AUDIT_ACCESS'));

          if (!isAffiliated && !hasGrant && !isPurposeOverride) {
            const ctx = buildAuditContext(
              request, user, classification, purpose, organizationIds, caseId,
              'DENIED', 'NO_CASE_ACCESS'
            );
            await logPhiAccess(ctx);
            return reply.status(403).send({
              error: {
                code: 'PHI_ACCESS_DENIED',
                message: 'User is not authorized to access PHI for this case',
                requestId: request.requestId,
              },
            });
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 5: ACCESS ALLOWED — decorate request and log
    // ------------------------------------------------------------------
    const allowedCtx = buildAuditContext(
      request, user, classification, purpose, organizationIds, caseId,
      'ALLOWED', undefined, isEmergency, emergencyJustification
    );

    // Set phiContext FIRST so it's available immediately to route handlers
    request.phiContext = {
      classification,
      purpose,
      organizationIds,
      isEmergency,
    };

    // ALLOWED: fire-and-forget (non-blocking), but capture audit log ID for export linking
    const auditPromise = logPhiAccess(allowedCtx)
      .then(auditLogId => {
        if (request.phiContext) {
          request.phiContext.auditLogId = auditLogId;
        }
        return auditLogId;
      })
      .catch(err => {
        request.log.error(err, 'Failed to log ALLOWED PHI access event');
        return undefined;
      });

    request.phiContext.auditLogReady = auditPromise;
  };
}
