/**
 * Organization Repository Interface
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Organization, Affiliation, Case Attribution
 *
 * Abstracts persistence for organizations, user affiliations,
 * case attribution, and cross-org access grants.
 */

import type { OrganizationType, AffiliationType } from '@asc/domain';

// ============================================================================
// Entity types
// ============================================================================

export interface Organization {
  id: string;
  facilityId: string;
  name: string;
  organizationType: OrganizationType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAffiliation {
  id: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  affiliationType: AffiliationType;
  isActive: boolean;
  grantedAt: Date;
  grantedByUserId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
}

export interface CaseAccessGrant {
  id: string;
  facilityId: string;
  caseId: string;
  grantedToUserId: string;
  grantedByUserId: string;
  reason: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
}

// ============================================================================
// Input types
// ============================================================================

export interface CreateOrganizationData {
  facilityId: string;
  name: string;
  organizationType: OrganizationType;
}

export interface UpdateOrganizationData {
  name?: string;
  isActive?: boolean;
}

export interface CreateAffiliationData {
  userId: string;
  organizationId: string;
  affiliationType: AffiliationType;
  grantedByUserId: string;
}

export interface CreateAccessGrantData {
  facilityId: string;
  caseId: string;
  grantedToUserId: string;
  grantedByUserId: string;
  reason: string;
  expiresAt: Date;
}

// ============================================================================
// Interface
// ============================================================================

export interface IOrganizationRepository {
  // Organization CRUD
  findById(id: string, facilityId: string): Promise<Organization | null>;
  findByFacility(facilityId: string): Promise<Organization[]>;
  findAscOrganization(facilityId: string): Promise<Organization | null>;
  create(data: CreateOrganizationData): Promise<Organization>;
  update(id: string, facilityId: string, data: UpdateOrganizationData): Promise<Organization | null>;

  // User affiliations
  getUserAffiliations(userId: string, facilityId: string): Promise<UserAffiliation[]>;
  getOrganizationMembers(orgId: string): Promise<UserAffiliation[]>;
  addAffiliation(data: CreateAffiliationData): Promise<UserAffiliation>;
  revokeAffiliation(id: string, revokedByUserId: string): Promise<void>;

  // Case attribution
  getCaseOrganization(caseId: string): Promise<Organization | null>;
  setCaseOrganization(
    caseId: string,
    organizationId: string,
    changedByUserId: string,
    justification: string
  ): Promise<void>;

  // Cross-org access grants
  getActiveCaseGrants(caseId: string): Promise<CaseAccessGrant[]>;
  getUserActiveGrants(userId: string): Promise<CaseAccessGrant[]>;
  createAccessGrant(data: CreateAccessGrantData): Promise<CaseAccessGrant>;
  revokeAccessGrant(grantId: string, revokedByUserId: string): Promise<void>;
}
