/**
 * PostgreSQL Case Repository Implementation
 */

import { query, transaction } from '../../db/index.js';
import {
  ICaseRepository,
  SurgicalCase,
  CaseRequirement,
  CreateCaseData,
  UpdateCaseData,
  ActivateCaseData,
  CaseFilters,
  RequirementItem,
} from '../interfaces/case.repository.js';

interface CaseRow {
  id: string;
  facility_id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  surgeon_id: string;
  surgeon_name?: string;
  procedure_name: string;
  preference_card_version_id: string | null;
  status: string;
  notes: string | null;
  is_active: boolean;
  activated_at: Date | null;
  activated_by_user_id: string | null;
  is_cancelled: boolean;
  cancelled_at: Date | null;
  cancelled_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RequirementRow {
  id: string;
  case_id: string;
  catalog_id: string;
  catalog_name?: string;
  quantity: number;
  is_surgeon_override: boolean;
  notes: string | null;
}

function mapCaseRow(row: CaseRow): SurgicalCase {
  return {
    id: row.id,
    facilityId: row.facility_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    surgeonId: row.surgeon_id,
    surgeonName: row.surgeon_name,
    procedureName: row.procedure_name,
    preferenceCardVersionId: row.preference_card_version_id,
    status: row.status as SurgicalCase['status'],
    notes: row.notes,
    isActive: row.is_active,
    activatedAt: row.activated_at,
    activatedByUserId: row.activated_by_user_id,
    isCancelled: row.is_cancelled,
    cancelledAt: row.cancelled_at,
    cancelledByUserId: row.cancelled_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequirementRow(row: RequirementRow): CaseRequirement {
  return {
    id: row.id,
    caseId: row.case_id,
    catalogId: row.catalog_id,
    catalogName: row.catalog_name,
    quantity: row.quantity,
    isSurgeonOverride: row.is_surgeon_override,
    notes: row.notes,
  };
}

export class PostgresCaseRepository implements ICaseRepository {
  async findById(id: string, facilityId: string): Promise<SurgicalCase | null> {
    const result = await query<CaseRow>(`
      SELECT c.*, u.name as surgeon_name
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.id = $1 AND c.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapCaseRow(result.rows[0]);
  }

  async findMany(facilityId: string, filters?: CaseFilters): Promise<SurgicalCase[]> {
    let sql = `
      SELECT c.*, u.name as surgeon_name
      FROM surgical_case c
      JOIN app_user u ON c.surgeon_id = u.id
      WHERE c.facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (filters?.date) {
      sql += ` AND c.scheduled_date = $${params.length + 1}`;
      params.push(filters.date);
    }
    if (filters?.status) {
      sql += ` AND c.status = $${params.length + 1}`;
      params.push(filters.status);
    }
    if (filters?.active !== undefined) {
      sql += ` AND c.is_active = $${params.length + 1}`;
      params.push(filters.active);
    }
    if (filters?.surgeonId) {
      sql += ` AND c.surgeon_id = $${params.length + 1}`;
      params.push(filters.surgeonId);
    }

    sql += ` ORDER BY c.scheduled_date NULLS LAST, c.scheduled_time NULLS LAST`;

    const result = await query<CaseRow>(sql, params);
    return result.rows.map(mapCaseRow);
  }

  async create(data: CreateCaseData): Promise<SurgicalCase> {
    const result = await query<CaseRow>(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, notes,
        is_active, is_cancelled
      ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, false, false)
      RETURNING *, (SELECT name FROM app_user WHERE id = $4) as surgeon_name
    `, [
      data.facilityId,
      data.scheduledDate ?? null,
      data.scheduledTime ?? null,
      data.surgeonId,
      data.procedureName,
      data.preferenceCardVersionId ?? null,
      data.notes ?? null,
    ]);

    return mapCaseRow(result.rows[0]);
  }

  async update(id: string, facilityId: string, data: UpdateCaseData): Promise<SurgicalCase | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.scheduledDate !== undefined) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      values.push(data.scheduledDate);
    }
    if (data.scheduledTime !== undefined) {
      updates.push(`scheduled_time = $${paramIndex++}`);
      values.push(data.scheduledTime);
    }
    if (data.surgeonId !== undefined) {
      updates.push(`surgeon_id = $${paramIndex++}`);
      values.push(data.surgeonId);
    }
    if (data.procedureName !== undefined) {
      updates.push(`procedure_name = $${paramIndex++}`);
      values.push(data.procedureName);
    }
    if (data.preferenceCardVersionId !== undefined) {
      updates.push(`preference_card_version_id = $${paramIndex++}`);
      values.push(data.preferenceCardVersionId);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) return this.findById(id, facilityId);

    values.push(id, facilityId);

    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, values);

    if (result.rows.length === 0) return null;
    return mapCaseRow(result.rows[0]);
  }

  async activate(
    id: string,
    facilityId: string,
    userId: string,
    data: ActivateCaseData
  ): Promise<SurgicalCase | null> {
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_active = true,
          activated_at = NOW(),
          activated_by_user_id = $3,
          scheduled_date = $4,
          scheduled_time = $5,
          status = 'SCHEDULED',
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId, userId, data.scheduledDate, data.scheduledTime ?? null]);

    if (result.rows.length === 0) return null;
    return mapCaseRow(result.rows[0]);
  }

  async deactivate(id: string, facilityId: string): Promise<SurgicalCase | null> {
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_active = false,
          status = 'DRAFT',
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapCaseRow(result.rows[0]);
  }

  async cancel(
    id: string,
    facilityId: string,
    userId: string,
    reason?: string
  ): Promise<SurgicalCase | null> {
    const result = await query<CaseRow>(`
      UPDATE surgical_case
      SET is_cancelled = true,
          cancelled_at = NOW(),
          cancelled_by_user_id = $3,
          status = 'CANCELLED',
          notes = CASE WHEN $4 IS NOT NULL THEN COALESCE(notes || E'\\n', '') || 'Cancelled: ' || $4 ELSE notes END,
          updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
      RETURNING *, (SELECT name FROM app_user WHERE id = surgeon_id) as surgeon_name
    `, [id, facilityId, userId, reason ?? null]);

    if (result.rows.length === 0) return null;
    return mapCaseRow(result.rows[0]);
  }

  async getRequirements(caseId: string): Promise<CaseRequirement[]> {
    const result = await query<RequirementRow>(`
      SELECT cr.*, ic.name as catalog_name
      FROM case_requirement cr
      JOIN item_catalog ic ON cr.catalog_id = ic.id
      WHERE cr.case_id = $1
    `, [caseId]);

    return result.rows.map(mapRequirementRow);
  }

  async setRequirements(
    caseId: string,
    items: RequirementItem[],
    isSurgeonOverride: boolean
  ): Promise<void> {
    await transaction(async (client) => {
      // Remove existing requirements of the same type
      if (isSurgeonOverride) {
        await client.query(`
          DELETE FROM case_requirement
          WHERE case_id = $1 AND is_surgeon_override = true
        `, [caseId]);
      }

      // Insert new requirements
      for (const item of items) {
        await client.query(`
          INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (case_id, catalog_id)
          DO UPDATE SET quantity = $3, is_surgeon_override = $4, notes = $5
        `, [caseId, item.catalogId, item.quantity, isSurgeonOverride, item.notes ?? null]);
      }
    });
  }

  async clearNonOverrideRequirements(caseId: string): Promise<void> {
    await query(`
      DELETE FROM case_requirement
      WHERE case_id = $1 AND is_surgeon_override = false
    `, [caseId]);
  }

  async copyRequirementsFromVersion(caseId: string, versionId: string): Promise<void> {
    await transaction(async (client) => {
      // Get items from preference card version
      const versionResult = await client.query<{ items: unknown[] }>(`
        SELECT items FROM preference_card_version WHERE id = $1
      `, [versionId]);

      if (versionResult.rows.length === 0) return;

      const items = versionResult.rows[0].items as Array<{
        catalogId: string;
        quantity: number;
        notes?: string;
      }>;

      for (const item of items) {
        await client.query(`
          INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override, notes)
          VALUES ($1, $2, $3, false, $4)
          ON CONFLICT (case_id, catalog_id) DO NOTHING
        `, [caseId, item.catalogId, item.quantity, item.notes ?? null]);
      }
    });
  }

  async getSurgeonId(caseId: string, facilityId: string): Promise<string | null> {
    const result = await query<{ surgeon_id: string }>(`
      SELECT surgeon_id FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [caseId, facilityId]);

    if (result.rows.length === 0) return null;
    return result.rows[0].surgeon_id;
  }

  async getStatus(
    id: string,
    facilityId: string
  ): Promise<{ isActive: boolean; isCancelled: boolean; status: string } | null> {
    const result = await query<{ is_active: boolean; is_cancelled: boolean; status: string }>(`
      SELECT is_active, is_cancelled, status FROM surgical_case
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return {
      isActive: result.rows[0].is_active,
      isCancelled: result.rows[0].is_cancelled,
      status: result.rows[0].status,
    };
  }
}
