/**
 * PHI Access Guard — Fastify preHandler middleware
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Access Model
 *
 * Enforces PHI access control:
 * 1. Validates X-Access-Purpose header
 * 2. Resolves user's organization affiliations
 * 3. Checks PHI capability from role
 * 4. Evaluates case-level access (org affiliation, grants, purpose override)
 * 5. Logs every access attempt to phi_access_audit_log
 *
 * Constraints:
 * - Constraint 4: Every attempt logged, including malformed
 * - Constraint 5: Deny if ANY prerequisite unresolvable
 * - Constraint 6: NOT attached to existing endpoints in Phase 1
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  type PhiClassification,
  type AccessPurpose,
  AccessPurpose as AccessPurposeEnum,
  PHI_CLASSIFICATION_TO_CAPABILITY,
  deriveCapabilities,
  type Capability,
} from '@asc/domain';
import { getUserRoles, type JwtPayload } from './auth.js';
import { logPhiAccess, type PhiAccessContext } from '../services/phi-audit.service.js';
import { getOrganizationRepository } from '../repositories/index.js';
import { query } from '../db/index.js';

// ============================================================================
// Request decoration types
// ============================================================================

export interface PhiRequestContext {
  classification: PhiClassification;
  purpose: AccessPurpose;
  organizationIds: string[];
}

// Extend Fastify request with PHI context
declare module 'fastify' {
  interface FastifyRequest {
    phiContext?: PhiRequestContext;
  }
}

// ============================================================================
// Helper: resolve caseId from request params, body, or query
// ============================================================================

function resolveCaseId(request: FastifyRequest): string | null {
  // Check route params
  const params = request.params as Record<string, string> | undefined;
  if (params?.caseId) return params.caseId;
  if (params?.id) {
    // Only use params.id if the route is a case-specific route
    // (checked by caller context, not here)
    return null;
  }

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
  denialReason?: string
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
  };
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
 *   case-level access (org affiliation, grants, purpose override).
 *   Default: false (for Phase 1; Phase 2 will enable on case endpoints).
 */
export function requirePhiAccess(
  classification: PhiClassification,
  options: { evaluateCase?: boolean } = {}
) {
  const { evaluateCase = false } = options;

  return async function phiGuard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;

    // Pre-check: user must be authenticated with facility context
    if (!user || !user.facilityId) {
      // No user or no facility = cannot evaluate PHI access
      // Log with minimal context available
      const minCtx: PhiAccessContext = {
        userId: user?.userId || 'unknown',
        userRoles: [],
        facilityId: '',
        organizationIds: [],
        phiClassification: classification,
        accessPurpose: 'CLINICAL_CARE', // placeholder for malformed
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
        request, user, classification, 'UNKNOWN', [], null, 'DENIED', 'MISSING_PURPOSE_HEADER'
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
        request, user, classification, purposeHeader, [], null, 'DENIED', 'INVALID_PURPOSE'
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
    // Step 2: Resolve user's org affiliations — DENY if none
    // ------------------------------------------------------------------
    const orgRepo = getOrganizationRepository();
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

    const organizationIds = affiliations.map(a => a.organizationId);

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

    // ------------------------------------------------------------------
    // Step 3: Check PHI capability — DENY if missing
    // ------------------------------------------------------------------
    const userCaps = deriveCapabilities(userRoles);
    const requiredCap: Capability = PHI_CLASSIFICATION_TO_CAPABILITY[classification];

    if (!userCaps.includes(requiredCap)) {
      const ctx = buildAuditContext(
        request, user, classification, purpose, organizationIds, null,
        'DENIED', 'MISSING_PHI_CAPABILITY'
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
    // Step 4: Case-level evaluation (full primitives, built now)
    // ------------------------------------------------------------------
    let caseId: string | null = null;

    if (evaluateCase) {
      caseId = resolveCaseId(request);

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
            'DENIED', 'CASE_NOT_FOUND'
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
        if (caseRow.facility_id !== facilityId) {
          const ctx = buildAuditContext(
            request, user, classification, purpose, organizationIds, caseId,
            'DENIED', 'CROSS_FACILITY_ACCESS'
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

    // ------------------------------------------------------------------
    // Step 5: ACCESS ALLOWED — decorate request and log
    // ------------------------------------------------------------------
    request.phiContext = {
      classification,
      purpose,
      organizationIds,
    };

    // ALLOWED: fire-and-forget (non-blocking)
    const allowedCtx = buildAuditContext(
      request, user, classification, purpose, organizationIds, caseId, 'ALLOWED'
    );
    logPhiAccess(allowedCtx).catch(err =>
      request.log.error(err, 'Failed to log ALLOWED PHI access event')
    );
  };
}
