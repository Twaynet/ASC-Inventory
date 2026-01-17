/**
 * PostgreSQL Device Repository Implementation
 */

import { query } from '../../db/index.js';
import {
  IDeviceRepository,
  Device,
  DeviceEvent,
  CreateDeviceEventData,
  KEYBOARD_WEDGE_DEVICE_ID,
} from '../interfaces/device.repository.js';

interface DeviceRow {
  id: string;
  facility_id: string;
  name: string;
  device_type: string;
  location_id: string | null;
  location_name?: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DeviceEventRow {
  id: string;
  facility_id: string;
  device_id: string;
  device_type: string;
  payload_type: string;
  raw_value: string;
  processed_item_id: string | null;
  processed: boolean;
  processing_error: string | null;
  occurred_at: Date;
  created_at: Date;
}

function mapDeviceRow(row: DeviceRow): Device {
  return {
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    deviceType: row.device_type as Device['deviceType'],
    locationId: row.location_id,
    locationName: row.location_name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeviceEventRow(row: DeviceEventRow): DeviceEvent {
  return {
    id: row.id,
    facilityId: row.facility_id,
    deviceId: row.device_id,
    deviceType: row.device_type,
    payloadType: row.payload_type as DeviceEvent['payloadType'],
    rawValue: row.raw_value,
    processedItemId: row.processed_item_id,
    processed: row.processed,
    processingError: row.processing_error,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export class PostgresDeviceRepository implements IDeviceRepository {
  async findById(id: string, facilityId: string): Promise<Device | null> {
    const result = await query<DeviceRow>(`
      SELECT d.*, l.name as location_name
      FROM device d
      LEFT JOIN location l ON d.location_id = l.id
      WHERE d.id = $1 AND d.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) return null;
    return mapDeviceRow(result.rows[0]);
  }

  async findMany(facilityId: string, activeOnly = true): Promise<Device[]> {
    let sql = `
      SELECT d.*, l.name as location_name
      FROM device d
      LEFT JOIN location l ON d.location_id = l.id
      WHERE d.facility_id = $1
    `;
    const params: unknown[] = [facilityId];

    if (activeOnly) {
      sql += ` AND d.active = true`;
    }

    sql += ` ORDER BY d.name`;

    const result = await query<DeviceRow>(sql, params);
    return result.rows.map(mapDeviceRow);
  }

  async findOrCreateKeyboardWedge(facilityId: string): Promise<Device> {
    // Check if virtual keyboard wedge device exists for this facility
    const existingResult = await query<DeviceRow>(`
      SELECT d.*, l.name as location_name
      FROM device d
      LEFT JOIN location l ON d.location_id = l.id
      WHERE d.facility_id = $1 AND d.name = 'Keyboard Wedge (Virtual)'
    `, [facilityId]);

    if (existingResult.rows.length > 0) {
      return mapDeviceRow(existingResult.rows[0]);
    }

    // Create the virtual keyboard wedge device for this facility
    const newResult = await query<DeviceRow>(`
      INSERT INTO device (facility_id, name, device_type, active)
      VALUES ($1, 'Keyboard Wedge (Virtual)', 'barcode', true)
      RETURNING *
    `, [facilityId]);

    return mapDeviceRow(newResult.rows[0]);
  }

  async createEvent(data: CreateDeviceEventData): Promise<DeviceEvent> {
    const occurredAt = data.occurredAt ?? new Date();

    const result = await query<DeviceEventRow>(`
      INSERT INTO device_event (
        facility_id, device_id, device_type, payload_type, raw_value,
        processed_item_id, processed, processing_error, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      data.facilityId,
      data.deviceId,
      data.deviceType,
      data.payloadType,
      data.rawValue,
      data.processedItemId ?? null,
      data.processed ?? false,
      data.processingError ?? null,
      occurredAt,
    ]);

    return mapDeviceEventRow(result.rows[0]);
  }

  async getDeviceLocation(deviceId: string, facilityId: string): Promise<string | null> {
    const result = await query<{ location_id: string | null }>(`
      SELECT location_id FROM device
      WHERE id = $1 AND facility_id = $2 AND active = true
    `, [deviceId, facilityId]);

    if (result.rows.length === 0) return null;
    return result.rows[0].location_id;
  }

  isKeyboardWedgeRequest(deviceId: string): boolean {
    return deviceId === KEYBOARD_WEDGE_DEVICE_ID;
  }
}
