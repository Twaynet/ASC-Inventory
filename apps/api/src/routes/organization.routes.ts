/**
 * Organization Routes
 * PHI Phase 1: Organization management and user affiliations
 *
 * Admin-only endpoints for managing organizations within a facility,
 * user affiliations, and case attribution.
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Organization, Affiliation, Case Attribution
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';
import { getOrganizationRepository } from '../repositories/index.js';
import { OrganizationType, AffiliationType } from '@asc/domain';
import type { Organization, UserAffiliation } from '../repositories/interfaces/organization.repository.js';

const ORGANIZATION_TYPES = OrganizationType.options;
const AFFILIATION_TYPES = AffiliationType.options;

function formatOrganization(org: Organization) {
  return {
    id: org.id,
    facilityId: org.facilityId,
    name: org.name,
    organizationType: org.organizationType,
    isActive: org.isActive,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

function formatAffiliation(aff: UserAffiliation) {
  return {
    id: aff.id,
    userId: aff.userId,
    organizationId: aff.organizationId,
    organizationName: aff.organizationName,
    organizationType: aff.organizationType,
    affiliationType: aff.affiliationType,
    isActive: aff.isActive,
    grantedAt: aff.grantedAt.toISOString(),
    grantedByUserId: aff.grantedByUserId,
    revokedAt: aff.revokedAt?.toISOString() ?? null,
    createdAt: aff.createdAt.toISOString(),
  };
}

export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  const orgRepo = getOrganizationRepository();

  // ==========================================================================
  // Organization CRUD
  // ==========================================================================

  /**
   * GET /organizations
   * List all organizations for the current facility
   */
  fastify.get('/', {
    preHandler: [requireCapabilities('ORG_MANAGE')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const orgs = await orgRepo.findByFacility(facilityId);
    return ok(reply, { organizations: orgs.map(formatOrganization) });
  });

  /**
   * POST /organizations
   * Create a new organization within the facility
   */
  fastify.post<{
    Body: {
      name: string;
      organizationType: string;
    };
  }>('/', {
    preHandler: [requireCapabilities('ORG_MANAGE')],
  }, async (request: FastifyRequest<{
    Body: {
      name: string;
      organizationType: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const { name, organizationType } = request.body;

    if (!name?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'Name is required');
    }

    if (!OrganizationType.safeParse(organizationType).success) {
      return fail(reply, 'VALIDATION_ERROR', `Invalid organizationType. Must be one of: ${ORGANIZATION_TYPES.join(', ')}`);
    }

    // ASC organizations are created by migration backfill only
    if (organizationType === 'ASC') {
      return fail(reply, 'VALIDATION_ERROR', 'ASC organizations are created automatically per facility');
    }

    try {
      const org = await orgRepo.create({
        facilityId,
        name: name.trim(),
        organizationType: organizationType as Organization['organizationType'],
      });
      return ok(reply, { organization: formatOrganization(org) }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('unique')) {
        return fail(reply, 'DUPLICATE', 'An organization with this name already exists in this facility');
      }
      throw err;
    }
  });

  /**
   * PATCH /organizations/:id
   * Update an organization
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      isActive?: boolean;
    };
  }>('/:id', {
    preHandler: [requireCapabilities('ORG_MANAGE')],
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      name?: string;
      isActive?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const { id } = request.params;
    const { name, isActive } = request.body;

    // Check org exists
    const existing = await orgRepo.findById(id, facilityId);
    if (!existing) {
      return fail(reply, 'NOT_FOUND', 'Organization not found', 404);
    }

    // Cannot deactivate the ASC organization
    if (existing.organizationType === 'ASC' && isActive === false) {
      return fail(reply, 'VALIDATION_ERROR', 'Cannot deactivate the facility ASC organization');
    }

    const updated = await orgRepo.update(id, facilityId, {
      name: name?.trim(),
      isActive,
    });

    if (!updated) {
      return fail(reply, 'NOT_FOUND', 'Organization not found', 404);
    }

    return ok(reply, { organization: formatOrganization(updated) });
  });

  // ==========================================================================
  // Affiliations
  // ==========================================================================

  /**
   * GET /organizations/:id/members
   * List active members of an organization
   */
  fastify.get<{ Params: { id: string } }>('/:id/members', {
    preHandler: [requireCapabilities('ORG_AFFILIATION_MANAGE')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const { id } = request.params;

    // Verify org exists in this facility
    const org = await orgRepo.findById(id, facilityId);
    if (!org) {
      return fail(reply, 'NOT_FOUND', 'Organization not found', 404);
    }

    const members = await orgRepo.getOrganizationMembers(id);
    return ok(reply, { members: members.map(formatAffiliation) });
  });

  /**
   * POST /organizations/:id/affiliations
   * Add a user affiliation to an organization
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      userId: string;
      affiliationType?: string;
    };
  }>('/:id/affiliations', {
    preHandler: [requireCapabilities('ORG_AFFILIATION_MANAGE')],
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      userId: string;
      affiliationType?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId, userId: actorId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const { id: orgId } = request.params;
    const { userId, affiliationType } = request.body;

    if (!userId?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'userId is required');
    }

    // Validate affiliation type
    const affType = affiliationType || 'PRIMARY';
    if (!AffiliationType.safeParse(affType).success) {
      return fail(reply, 'VALIDATION_ERROR', `Invalid affiliationType. Must be one of: ${AFFILIATION_TYPES.join(', ')}`);
    }

    // Verify org exists in this facility
    const org = await orgRepo.findById(orgId, facilityId);
    if (!org) {
      return fail(reply, 'NOT_FOUND', 'Organization not found', 404);
    }

    try {
      const affiliation = await orgRepo.addAffiliation({
        userId,
        organizationId: orgId,
        affiliationType: affType as UserAffiliation['affiliationType'],
        grantedByUserId: actorId,
      });
      return ok(reply, { affiliation: formatAffiliation(affiliation) }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('unique')) {
        return fail(reply, 'DUPLICATE', 'User already has an active affiliation with this organization');
      }
      throw err;
    }
  });

  /**
   * DELETE /organizations/:id/affiliations/:affiliationId
   * Revoke a user's affiliation with an organization
   */
  fastify.delete<{
    Params: { id: string; affiliationId: string };
  }>('/:id/affiliations/:affiliationId', {
    preHandler: [requireCapabilities('ORG_AFFILIATION_MANAGE')],
  }, async (request: FastifyRequest<{
    Params: { id: string; affiliationId: string };
  }>, reply: FastifyReply) => {
    const { facilityId, userId: actorId } = request.user;
    if (!facilityId) return fail(reply, 'FORBIDDEN', 'Requires facility context', 403);

    const { affiliationId } = request.params;

    await orgRepo.revokeAffiliation(affiliationId, actorId);
    return ok(reply, { revoked: true });
  });
}
