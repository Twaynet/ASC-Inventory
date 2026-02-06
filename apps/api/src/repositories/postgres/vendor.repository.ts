/**
 * PostgreSQL Vendor Repository Implementation
 * Wave 1: Financial Attribution
 */

import { query } from '../../db/index.js';
import {
  IVendorRepository,
  Vendor,
  CreateVendorData,
  UpdateVendorData,
  VendorFilters,
} from '../interfaces/vendor.repository.js';

interface VendorRow {
  id: string;
  facility_id: string;
  name: string;
  vendor_type: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapVendorRow(row: VendorRow): Vendor {
  return {
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    vendorType: row.vendor_type as Vendor['vendorType'],
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresVendorRepository implements IVendorRepository {
  async findById(id: string, facilityId: string): Promise<Vendor | null> {
    const result = await query<VendorRow>(`
      SELECT * FROM vendor
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapVendorRow(result.rows[0]);
  }

  async findByName(name: string, facilityId: string): Promise<Vendor | null> {
    const result = await query<VendorRow>(`
      SELECT * FROM vendor
      WHERE LOWER(name) = LOWER($1) AND facility_id = $2
    `, [name, facilityId]);

    if (result.rows.length === 0) return null;
    return mapVendorRow(result.rows[0]);
  }

  async findMany(facilityId: string, filters?: VendorFilters): Promise<Vendor[]> {
    let sql = `SELECT * FROM vendor WHERE facility_id = $1`;
    const params: unknown[] = [facilityId];

    if (filters?.vendorType) {
      sql += ` AND vendor_type = $${params.length + 1}`;
      params.push(filters.vendorType);
    }
    if (filters?.isActive !== undefined) {
      sql += ` AND is_active = $${params.length + 1}`;
      params.push(filters.isActive);
    }
    if (filters?.search) {
      sql += ` AND (LOWER(name) LIKE $${params.length + 1} OR LOWER(contact_name) LIKE $${params.length + 1})`;
      params.push(`%${filters.search.toLowerCase()}%`);
    }

    sql += ` ORDER BY name ASC`;

    const result = await query<VendorRow>(sql, params);
    return result.rows.map(mapVendorRow);
  }

  async create(data: CreateVendorData): Promise<Vendor> {
    const result = await query<VendorRow>(`
      INSERT INTO vendor (
        facility_id, name, vendor_type, contact_name, contact_email, contact_phone, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      data.facilityId,
      data.name,
      data.vendorType,
      data.contactName ?? null,
      data.contactEmail ?? null,
      data.contactPhone ?? null,
      data.notes ?? null,
    ]);

    return mapVendorRow(result.rows[0]);
  }

  async update(id: string, facilityId: string, data: UpdateVendorData): Promise<Vendor | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.vendorType !== undefined) {
      updates.push(`vendor_type = $${paramIndex++}`);
      values.push(data.vendorType);
    }
    if (data.contactName !== undefined) {
      updates.push(`contact_name = $${paramIndex++}`);
      values.push(data.contactName);
    }
    if (data.contactEmail !== undefined) {
      updates.push(`contact_email = $${paramIndex++}`);
      values.push(data.contactEmail);
    }
    if (data.contactPhone !== undefined) {
      updates.push(`contact_phone = $${paramIndex++}`);
      values.push(data.contactPhone);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) {
      return this.findById(id, facilityId);
    }

    values.push(id, facilityId);

    const result = await query<VendorRow>(`
      UPDATE vendor
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) return null;
    return mapVendorRow(result.rows[0]);
  }
}
