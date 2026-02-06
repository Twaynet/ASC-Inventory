/**
 * PostgreSQL Loaner Set Repository Implementation
 * Wave 1: Financial Attribution
 */

import { query } from '../../db/index.js';
import {
  ILoanerSetRepository,
  LoanerSet,
  CreateLoanerSetData,
  MarkLoanerSetReturnedData,
  LoanerSetFilters,
} from '../interfaces/loaner-set.repository.js';

interface LoanerSetRow {
  id: string;
  facility_id: string;
  vendor_id: string;
  vendor_name?: string;
  set_identifier: string;
  description: string | null;
  case_id: string | null;
  case_name?: string | null;
  received_at: Date;
  received_by_user_id: string;
  received_by_user_name?: string;
  expected_return_date: Date | null;
  returned_at: Date | null;
  returned_by_user_id: string | null;
  returned_by_user_name?: string | null;
  item_count: number | null;
  notes: string | null;
  created_at: Date;
}

function mapLoanerSetRow(row: LoanerSetRow): LoanerSet {
  return {
    id: row.id,
    facilityId: row.facility_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    setIdentifier: row.set_identifier,
    description: row.description,
    caseId: row.case_id,
    caseName: row.case_name,
    receivedAt: row.received_at,
    receivedByUserId: row.received_by_user_id,
    receivedByUserName: row.received_by_user_name,
    expectedReturnDate: row.expected_return_date,
    returnedAt: row.returned_at,
    returnedByUserId: row.returned_by_user_id,
    returnedByUserName: row.returned_by_user_name,
    itemCount: row.item_count,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_JOINS = `
  SELECT
    ls.*,
    v.name AS vendor_name,
    sc.procedure_name AS case_name,
    ru.name AS received_by_user_name,
    retu.name AS returned_by_user_name
  FROM loaner_set ls
  JOIN vendor v ON ls.vendor_id = v.id
  LEFT JOIN surgical_case sc ON ls.case_id = sc.id
  JOIN app_user ru ON ls.received_by_user_id = ru.id
  LEFT JOIN app_user retu ON ls.returned_by_user_id = retu.id
`;

export class PostgresLoanerSetRepository implements ILoanerSetRepository {
  async findById(id: string, facilityId: string): Promise<LoanerSet | null> {
    const result = await query<LoanerSetRow>(`
      ${SELECT_WITH_JOINS}
      WHERE ls.id = $1 AND ls.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapLoanerSetRow(result.rows[0]);
  }

  async findMany(facilityId: string, filters?: LoanerSetFilters): Promise<LoanerSet[]> {
    let sql = `${SELECT_WITH_JOINS} WHERE ls.facility_id = $1`;
    const params: unknown[] = [facilityId];

    if (filters?.vendorId) {
      sql += ` AND ls.vendor_id = $${params.length + 1}`;
      params.push(filters.vendorId);
    }
    if (filters?.caseId) {
      sql += ` AND ls.case_id = $${params.length + 1}`;
      params.push(filters.caseId);
    }
    if (filters?.isOpen === true) {
      sql += ` AND ls.returned_at IS NULL`;
    }
    if (filters?.isOpen === false) {
      sql += ` AND ls.returned_at IS NOT NULL`;
    }
    if (filters?.isOverdue === true) {
      sql += ` AND ls.returned_at IS NULL AND ls.expected_return_date < CURRENT_DATE`;
    }

    sql += ` ORDER BY ls.received_at DESC`;

    const result = await query<LoanerSetRow>(sql, params);
    return result.rows.map(mapLoanerSetRow);
  }

  async findOpenSets(facilityId: string): Promise<LoanerSet[]> {
    const result = await query<LoanerSetRow>(`
      ${SELECT_WITH_JOINS}
      WHERE ls.facility_id = $1 AND ls.returned_at IS NULL
      ORDER BY ls.expected_return_date ASC NULLS LAST, ls.received_at ASC
    `, [facilityId]);

    return result.rows.map(mapLoanerSetRow);
  }

  async findOverdueSets(facilityId: string): Promise<LoanerSet[]> {
    const result = await query<LoanerSetRow>(`
      ${SELECT_WITH_JOINS}
      WHERE ls.facility_id = $1
        AND ls.returned_at IS NULL
        AND ls.expected_return_date < CURRENT_DATE
      ORDER BY ls.expected_return_date ASC
    `, [facilityId]);

    return result.rows.map(mapLoanerSetRow);
  }

  async create(data: CreateLoanerSetData): Promise<LoanerSet> {
    const result = await query<LoanerSetRow>(`
      INSERT INTO loaner_set (
        facility_id, vendor_id, set_identifier, description, case_id,
        received_at, received_by_user_id, expected_return_date, item_count, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      data.facilityId,
      data.vendorId,
      data.setIdentifier,
      data.description ?? null,
      data.caseId ?? null,
      data.receivedAt,
      data.receivedByUserId,
      data.expectedReturnDate ?? null,
      data.itemCount ?? null,
      data.notes ?? null,
    ]);

    // Fetch with joins
    return this.findById(result.rows[0].id, data.facilityId) as Promise<LoanerSet>;
  }

  async markReturned(
    id: string,
    facilityId: string,
    data: MarkLoanerSetReturnedData
  ): Promise<LoanerSet | null> {
    // First check if already returned
    const existing = await this.findById(id, facilityId);
    if (!existing) return null;
    if (existing.returnedAt) {
      throw new Error('Loaner set is already marked as returned');
    }

    const result = await query<{ id: string }>(`
      UPDATE loaner_set
      SET returned_at = $1, returned_by_user_id = $2, notes = COALESCE($3, notes)
      WHERE id = $4 AND facility_id = $5 AND returned_at IS NULL
      RETURNING id
    `, [
      data.returnedAt,
      data.returnedByUserId,
      data.notes ?? null,
      id,
      facilityId,
    ]);

    if (result.rows.length === 0) return null;
    return this.findById(id, facilityId);
  }
}
