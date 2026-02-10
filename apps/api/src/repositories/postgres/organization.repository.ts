/**
 * PostgreSQL Organization Repository Implementation
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Organization, Affiliation, Case Attribution
 */

import { query, transaction } from '../../db/index.js';
import type {
  IOrganizationRepository,
  Organization,
  UserAffiliation,
  CaseAccessGrant,
  CreateOrganizationData,
  UpdateOrganizationData,
  CreateAffiliationData,
  CreateAccessGrantData,
} from '../interfaces/organization.repository.js';

// ============================================================================
// Row mappers
// ============================================================================

interface OrgRow {
  id: string;
  facility_id: string;
  name: string;
  organization_type: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AffiliationRow {
  id: string;
  user_id: string;
  organization_id: string;
  organization_name: string;
  organization_type: string;
  affiliation_type: string;
  is_active: boolean;
  granted_at: Date;
  granted_by_user_id: string | null;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  created_at: Date;
}

interface GrantRow {
  id: string;
  facility_id: string;
  case_id: string;
  granted_to_user_id: string;
  granted_by_user_id: string;
  reason: string;
  granted_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  created_at: Date;
}

function mapOrgRow(row: OrgRow): Organization {
  return {
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    organizationType: row.organization_type as Organization['organizationType'],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAffiliationRow(row: AffiliationRow): UserAffiliation {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationType: row.organization_type as UserAffiliation['organizationType'],
    affiliationType: row.affiliation_type as UserAffiliation['affiliationType'],
    isActive: row.is_active,
    grantedAt: row.granted_at,
    grantedByUserId: row.granted_by_user_id,
    revokedAt: row.revoked_at,
    revokedByUserId: row.revoked_by_user_id,
    createdAt: row.created_at,
  };
}

function mapGrantRow(row: GrantRow): CaseAccessGrant {
  return {
    id: row.id,
    facilityId: row.facility_id,
    caseId: row.case_id,
    grantedToUserId: row.granted_to_user_id,
    grantedByUserId: row.granted_by_user_id,
    reason: row.reason,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedByUserId: row.revoked_by_user_id,
    createdAt: row.created_at,
  };
}

// ============================================================================
// Repository Implementation
// ============================================================================

export class PostgresOrganizationRepository implements IOrganizationRepository {

  // --------------------------------------------------------------------------
  // Organization CRUD
  // --------------------------------------------------------------------------

  async findById(id: string, facilityId: string): Promise<Organization | null> {
    const result = await query<OrgRow>(
      `SELECT * FROM organization WHERE id = $1 AND facility_id = $2`,
      [id, facilityId]
    );
    if (result.rows.length === 0) return null;
    return mapOrgRow(result.rows[0]);
  }

  async findByFacility(facilityId: string): Promise<Organization[]> {
    const result = await query<OrgRow>(
      `SELECT * FROM organization WHERE facility_id = $1 ORDER BY organization_type, name`,
      [facilityId]
    );
    return result.rows.map(mapOrgRow);
  }

  async findAscOrganization(facilityId: string): Promise<Organization | null> {
    const result = await query<OrgRow>(
      `SELECT * FROM organization
       WHERE facility_id = $1 AND organization_type = 'ASC' AND is_active = true`,
      [facilityId]
    );
    if (result.rows.length === 0) return null;
    return mapOrgRow(result.rows[0]);
  }

  async create(data: CreateOrganizationData): Promise<Organization> {
    const result = await query<OrgRow>(
      `INSERT INTO organization (facility_id, name, organization_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.facilityId, data.name, data.organizationType]
    );
    return mapOrgRow(result.rows[0]);
  }

  async update(id: string, facilityId: string, data: UpdateOrganizationData): Promise<Organization | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) return this.findById(id, facilityId);

    values.push(id, facilityId);

    const result = await query<OrgRow>(
      `UPDATE organization
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;
    return mapOrgRow(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // User Affiliations
  // --------------------------------------------------------------------------

  async getUserAffiliations(userId: string, facilityId: string): Promise<UserAffiliation[]> {
    const result = await query<AffiliationRow>(
      `SELECT a.*, o.name as organization_name, o.organization_type
       FROM user_organization_affiliation a
       JOIN organization o ON a.organization_id = o.id
       WHERE a.user_id = $1 AND o.facility_id = $2 AND a.is_active = true`,
      [userId, facilityId]
    );
    return result.rows.map(mapAffiliationRow);
  }

  async getOrganizationMembers(orgId: string): Promise<UserAffiliation[]> {
    const result = await query<AffiliationRow>(
      `SELECT a.*, o.name as organization_name, o.organization_type
       FROM user_organization_affiliation a
       JOIN organization o ON a.organization_id = o.id
       WHERE a.organization_id = $1 AND a.is_active = true
       ORDER BY a.granted_at`,
      [orgId]
    );
    return result.rows.map(mapAffiliationRow);
  }

  async addAffiliation(data: CreateAffiliationData): Promise<UserAffiliation> {
    const result = await query<AffiliationRow>(
      `INSERT INTO user_organization_affiliation
         (user_id, organization_id, affiliation_type, granted_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *,
         (SELECT name FROM organization WHERE id = $2) as organization_name,
         (SELECT organization_type FROM organization WHERE id = $2) as organization_type`,
      [data.userId, data.organizationId, data.affiliationType, data.grantedByUserId]
    );
    return mapAffiliationRow(result.rows[0]);
  }

  async revokeAffiliation(id: string, revokedByUserId: string): Promise<void> {
    await query(
      `UPDATE user_organization_affiliation
       SET is_active = false, revoked_at = NOW(), revoked_by_user_id = $2
       WHERE id = $1 AND is_active = true`,
      [id, revokedByUserId]
    );
  }

  // --------------------------------------------------------------------------
  // Case Attribution
  // --------------------------------------------------------------------------

  async getCaseOrganization(caseId: string): Promise<Organization | null> {
    const result = await query<OrgRow>(
      `SELECT o.* FROM organization o
       JOIN surgical_case sc ON sc.primary_organization_id = o.id
       WHERE sc.id = $1`,
      [caseId]
    );
    if (result.rows.length === 0) return null;
    return mapOrgRow(result.rows[0]);
  }

  async setCaseOrganization(
    caseId: string,
    organizationId: string,
    changedByUserId: string,
    justification: string
  ): Promise<void> {
    await transaction(async (client) => {
      // Get previous organization
      const prev = await client.query<{ primary_organization_id: string | null }>(
        `SELECT primary_organization_id FROM surgical_case WHERE id = $1`,
        [caseId]
      );
      const previousOrgId = prev.rows[0]?.primary_organization_id ?? null;

      // Update case
      await client.query(
        `UPDATE surgical_case SET primary_organization_id = $2, updated_at = NOW() WHERE id = $1`,
        [caseId, organizationId]
      );

      // Record attribution event (append-only)
      await client.query(
        `INSERT INTO case_attribution_event
           (case_id, previous_organization_id, new_organization_id, changed_by_user_id, justification)
         VALUES ($1, $2, $3, $4, $5)`,
        [caseId, previousOrgId, organizationId, changedByUserId, justification]
      );

      // Constraint 3: Invalidate existing access grants when attribution changes
      if (previousOrgId && previousOrgId !== organizationId) {
        await client.query(
          `UPDATE case_access_grant
           SET revoked_at = NOW(), revoked_by_user_id = $2
           WHERE case_id = $1 AND revoked_at IS NULL`,
          [caseId, changedByUserId]
        );
      }
    });
  }

  // --------------------------------------------------------------------------
  // Cross-Organization Access Grants
  // --------------------------------------------------------------------------

  async getActiveCaseGrants(caseId: string): Promise<CaseAccessGrant[]> {
    const result = await query<GrantRow>(
      `SELECT * FROM case_access_grant
       WHERE case_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY granted_at DESC`,
      [caseId]
    );
    return result.rows.map(mapGrantRow);
  }

  async getUserActiveGrants(userId: string): Promise<CaseAccessGrant[]> {
    const result = await query<GrantRow>(
      `SELECT * FROM case_access_grant
       WHERE granted_to_user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY granted_at DESC`,
      [userId]
    );
    return result.rows.map(mapGrantRow);
  }

  async createAccessGrant(data: CreateAccessGrantData): Promise<CaseAccessGrant> {
    const result = await query<GrantRow>(
      `INSERT INTO case_access_grant
         (facility_id, case_id, granted_to_user_id, granted_by_user_id, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.facilityId, data.caseId, data.grantedToUserId, data.grantedByUserId, data.reason, data.expiresAt]
    );
    return mapGrantRow(result.rows[0]);
  }

  async revokeAccessGrant(grantId: string, revokedByUserId: string): Promise<void> {
    await query(
      `UPDATE case_access_grant
       SET revoked_at = NOW(), revoked_by_user_id = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [grantId, revokedByUserId]
    );
  }
}
