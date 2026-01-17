/**
 * PostgreSQL Inventory Repository Implementation
 */

import { query, transaction } from '../../db/index.js';
import {
  IInventoryRepository,
  InventoryItem,
  InventoryEvent,
  CreateInventoryItemData,
  UpdateInventoryItemData,
  CreateInventoryEventData,
  InventoryItemFilters,
} from '../interfaces/inventory.repository.js';

interface InventoryItemRow {
  id: string;
  facility_id: string;
  catalog_id: string;
  catalog_name?: string;
  category?: string;
  manufacturer?: string;
  serial_number: string | null;
  lot_number: string | null;
  barcode: string | null;
  location_id: string | null;
  location_name?: string | null;
  sterility_status: string;
  sterility_expires_at: Date | null;
  availability_status: string;
  reserved_for_case_id: string | null;
  last_verified_at: Date | null;
  last_verified_by_user_id: string | null;
  last_verified_by_name?: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InventoryEventRow {
  id: string;
  facility_id: string;
  inventory_item_id: string;
  event_type: string;
  case_id: string | null;
  case_name?: string | null;
  location_id: string | null;
  location_name?: string | null;
  previous_location_id: string | null;
  previous_location_name?: string | null;
  sterility_status: string | null;
  notes: string | null;
  performed_by_user_id: string;
  performed_by_name?: string | null;
  device_event_id: string | null;
  occurred_at: Date;
  created_at: Date;
}

function mapItemRow(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    facilityId: row.facility_id,
    catalogId: row.catalog_id,
    catalogName: row.catalog_name,
    category: row.category,
    manufacturer: row.manufacturer,
    serialNumber: row.serial_number,
    lotNumber: row.lot_number,
    barcode: row.barcode,
    locationId: row.location_id,
    locationName: row.location_name,
    sterilityStatus: row.sterility_status as InventoryItem['sterilityStatus'],
    sterilityExpiresAt: row.sterility_expires_at,
    availabilityStatus: row.availability_status as InventoryItem['availabilityStatus'],
    reservedForCaseId: row.reserved_for_case_id,
    lastVerifiedAt: row.last_verified_at,
    lastVerifiedByUserId: row.last_verified_by_user_id,
    lastVerifiedByName: row.last_verified_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row: InventoryEventRow): InventoryEvent {
  return {
    id: row.id,
    facilityId: row.facility_id,
    inventoryItemId: row.inventory_item_id,
    eventType: row.event_type as InventoryEvent['eventType'],
    caseId: row.case_id,
    caseName: row.case_name,
    locationId: row.location_id,
    locationName: row.location_name,
    previousLocationId: row.previous_location_id,
    previousLocationName: row.previous_location_name,
    sterilityStatus: row.sterility_status,
    notes: row.notes,
    performedByUserId: row.performed_by_user_id,
    performedByName: row.performed_by_name,
    deviceEventId: row.device_event_id,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export class PostgresInventoryRepository implements IInventoryRepository {
  async findById(id: string, facilityId: string): Promise<InventoryItem | null> {
    const result = await query<InventoryItemRow>(`
      SELECT i.*, c.name as catalog_name, c.category
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      WHERE i.id = $1 AND i.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapItemRow(result.rows[0]);
  }

  async findByIdWithDetails(id: string, facilityId: string): Promise<InventoryItem | null> {
    const result = await query<InventoryItemRow>(`
      SELECT
        i.*,
        c.name as catalog_name, c.category, c.manufacturer,
        l.name as location_name,
        u.name as last_verified_by_name
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      LEFT JOIN location l ON i.location_id = l.id
      LEFT JOIN app_user u ON i.last_verified_by_user_id = u.id
      WHERE i.id = $1 AND i.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapItemRow(result.rows[0]);
  }

  async findByBarcode(barcode: string, facilityId: string): Promise<InventoryItem | null> {
    const result = await query<InventoryItemRow>(`
      SELECT i.*, c.name as catalog_name, c.category
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      WHERE i.barcode = $1 AND i.facility_id = $2
    `, [barcode, facilityId]);

    if (result.rows.length === 0) return null;
    return mapItemRow(result.rows[0]);
  }

  async findBySerialNumber(serialNumber: string, facilityId: string): Promise<InventoryItem | null> {
    const result = await query<InventoryItemRow>(`
      SELECT i.*, c.name as catalog_name, c.category
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      WHERE i.serial_number = $1 AND i.facility_id = $2
    `, [serialNumber, facilityId]);

    if (result.rows.length === 0) return null;
    return mapItemRow(result.rows[0]);
  }

  async findMany(facilityId: string, filters?: InventoryItemFilters): Promise<InventoryItem[]> {
    let sql = `
      SELECT i.*, c.name as catalog_name, c.category, l.name as location_name
      FROM inventory_item i
      JOIN item_catalog c ON i.catalog_id = c.id
      LEFT JOIN location l ON i.location_id = l.id
      WHERE i.facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (filters?.catalogId) {
      sql += ` AND i.catalog_id = $${params.length + 1}`;
      params.push(filters.catalogId);
    }
    if (filters?.locationId) {
      sql += ` AND i.location_id = $${params.length + 1}`;
      params.push(filters.locationId);
    }
    if (filters?.status) {
      sql += ` AND i.availability_status = $${params.length + 1}`;
      params.push(filters.status);
    }

    sql += ` ORDER BY c.name, i.created_at`;

    const result = await query<InventoryItemRow>(sql, params);
    return result.rows.map(mapItemRow);
  }

  async create(data: CreateInventoryItemData): Promise<InventoryItem> {
    const result = await query<InventoryItemRow>(`
      INSERT INTO inventory_item (
        facility_id, catalog_id, serial_number, lot_number, barcode,
        location_id, sterility_status, sterility_expires_at, availability_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AVAILABLE')
      RETURNING *
    `, [
      data.facilityId,
      data.catalogId,
      data.serialNumber ?? null,
      data.lotNumber ?? null,
      data.barcode ?? null,
      data.locationId ?? null,
      data.sterilityStatus ?? 'UNKNOWN',
      data.sterilityExpiresAt ?? null,
    ]);

    // Fetch with catalog info
    return this.findById(result.rows[0].id, data.facilityId) as Promise<InventoryItem>;
  }

  async update(id: string, facilityId: string, data: UpdateInventoryItemData): Promise<InventoryItem | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.serialNumber !== undefined) {
      updates.push(`serial_number = $${paramIndex++}`);
      values.push(data.serialNumber);
    }
    if (data.lotNumber !== undefined) {
      updates.push(`lot_number = $${paramIndex++}`);
      values.push(data.lotNumber);
    }
    if (data.barcode !== undefined) {
      updates.push(`barcode = $${paramIndex++}`);
      values.push(data.barcode);
    }
    if (data.locationId !== undefined) {
      updates.push(`location_id = $${paramIndex++}`);
      values.push(data.locationId);
    }
    if (data.sterilityStatus !== undefined) {
      updates.push(`sterility_status = $${paramIndex++}`);
      values.push(data.sterilityStatus);
    }
    if (data.sterilityExpiresAt !== undefined) {
      updates.push(`sterility_expires_at = $${paramIndex++}`);
      values.push(data.sterilityExpiresAt);
    }
    if (data.availabilityStatus !== undefined) {
      updates.push(`availability_status = $${paramIndex++}`);
      values.push(data.availabilityStatus);
    }
    if (data.reservedForCaseId !== undefined) {
      updates.push(`reserved_for_case_id = $${paramIndex++}`);
      values.push(data.reservedForCaseId);
    }
    if (data.lastVerifiedAt !== undefined) {
      updates.push(`last_verified_at = $${paramIndex++}`);
      values.push(data.lastVerifiedAt);
    }
    if (data.lastVerifiedByUserId !== undefined) {
      updates.push(`last_verified_by_user_id = $${paramIndex++}`);
      values.push(data.lastVerifiedByUserId);
    }

    if (updates.length === 0) return this.findById(id, facilityId);

    values.push(id, facilityId);

    const result = await query<{ id: string }>(`
      UPDATE inventory_item
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING id
    `, values);

    if (result.rows.length === 0) return null;
    return this.findByIdWithDetails(id, facilityId);
  }

  async barcodeExists(barcode: string, facilityId: string, excludeId?: string): Promise<boolean> {
    let sql = `SELECT id FROM inventory_item WHERE barcode = $1 AND facility_id = $2`;
    const params: unknown[] = [barcode, facilityId];

    if (excludeId) {
      sql += ` AND id != $3`;
      params.push(excludeId);
    }

    const result = await query(sql, params);
    return result.rows.length > 0;
  }

  async createEvent(data: CreateInventoryEventData): Promise<InventoryEvent> {
    // Get previous location for audit trail
    const itemInfo = await query<{ location_id: string | null }>(`
      SELECT location_id FROM inventory_item WHERE id = $1
    `, [data.inventoryItemId]);

    const previousLocationId = data.previousLocationId ?? itemInfo.rows[0]?.location_id ?? null;
    const occurredAt = data.occurredAt ?? new Date();

    const result = await query<InventoryEventRow>(`
      INSERT INTO inventory_event (
        facility_id, inventory_item_id, event_type, case_id, location_id,
        previous_location_id, sterility_status, notes, performed_by_user_id,
        device_event_id, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.facilityId,
      data.inventoryItemId,
      data.eventType,
      data.caseId ?? null,
      data.locationId ?? null,
      previousLocationId,
      data.sterilityStatus ?? null,
      data.notes ?? null,
      data.performedByUserId,
      data.deviceEventId ?? null,
      occurredAt,
    ]);

    return mapEventRow(result.rows[0]);
  }

  async createEventWithItemUpdate(
    eventData: CreateInventoryEventData,
    itemUpdate: UpdateInventoryItemData
  ): Promise<InventoryEvent> {
    return transaction(async (client) => {
      // Get previous location
      const itemInfo = await client.query<{ location_id: string | null }>(`
        SELECT location_id FROM inventory_item WHERE id = $1
      `, [eventData.inventoryItemId]);

      const previousLocationId = eventData.previousLocationId ?? itemInfo.rows[0]?.location_id ?? null;
      const occurredAt = eventData.occurredAt ?? new Date();

      // Insert event
      const eventResult = await client.query<InventoryEventRow>(`
        INSERT INTO inventory_event (
          facility_id, inventory_item_id, event_type, case_id, location_id,
          previous_location_id, sterility_status, notes, performed_by_user_id,
          device_event_id, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        eventData.facilityId,
        eventData.inventoryItemId,
        eventData.eventType,
        eventData.caseId ?? null,
        eventData.locationId ?? null,
        previousLocationId,
        eventData.sterilityStatus ?? null,
        eventData.notes ?? null,
        eventData.performedByUserId,
        eventData.deviceEventId ?? null,
        occurredAt,
      ]);

      // Update item state
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (itemUpdate.locationId !== undefined) {
        updates.push(`location_id = $${paramIndex++}`);
        values.push(itemUpdate.locationId);
      }
      if (itemUpdate.sterilityStatus !== undefined) {
        updates.push(`sterility_status = $${paramIndex++}`);
        values.push(itemUpdate.sterilityStatus);
      }
      if (itemUpdate.availabilityStatus !== undefined) {
        updates.push(`availability_status = $${paramIndex++}`);
        values.push(itemUpdate.availabilityStatus);
      }
      if (itemUpdate.reservedForCaseId !== undefined) {
        updates.push(`reserved_for_case_id = $${paramIndex++}`);
        values.push(itemUpdate.reservedForCaseId);
      }
      if (itemUpdate.lastVerifiedAt !== undefined) {
        updates.push(`last_verified_at = $${paramIndex++}`);
        values.push(itemUpdate.lastVerifiedAt);
      }
      if (itemUpdate.lastVerifiedByUserId !== undefined) {
        updates.push(`last_verified_by_user_id = $${paramIndex++}`);
        values.push(itemUpdate.lastVerifiedByUserId);
      }

      if (updates.length > 0) {
        values.push(eventData.inventoryItemId);
        await client.query(`
          UPDATE inventory_item
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${paramIndex}
        `, values);
      }

      return mapEventRow(eventResult.rows[0]);
    });
  }

  async getItemHistory(itemId: string, facilityId: string, limit = 100): Promise<InventoryEvent[]> {
    // Verify item exists
    const itemCheck = await query(`
      SELECT id FROM inventory_item WHERE id = $1 AND facility_id = $2
    `, [itemId, facilityId]);

    if (itemCheck.rows.length === 0) return [];

    const result = await query<InventoryEventRow>(`
      SELECT
        e.*,
        u.name as performed_by_name,
        l.name as location_name,
        pl.name as previous_location_name,
        c.procedure_name as case_name
      FROM inventory_event e
      LEFT JOIN app_user u ON e.performed_by_user_id = u.id
      LEFT JOIN location l ON e.location_id = l.id
      LEFT JOIN location pl ON e.previous_location_id = pl.id
      LEFT JOIN surgical_case c ON e.case_id = c.id
      WHERE e.inventory_item_id = $1
      ORDER BY e.occurred_at DESC
      LIMIT $2
    `, [itemId, limit]);

    return result.rows.map(mapEventRow);
  }
}
