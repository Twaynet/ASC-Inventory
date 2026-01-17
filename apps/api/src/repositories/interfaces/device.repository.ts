/**
 * Device Repository Interface
 * Abstracts device and device event persistence
 */

export interface Device {
  id: string;
  facilityId: string;
  name: string;
  deviceType: 'barcode' | 'rfid' | 'nfc' | 'other';
  locationId: string | null;
  locationName?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceEvent {
  id: string;
  facilityId: string;
  deviceId: string;
  deviceType: string;
  payloadType: 'scan' | 'presence' | 'input';
  rawValue: string;
  processedItemId: string | null;
  processed: boolean;
  processingError: string | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface CreateDeviceEventData {
  facilityId: string;
  deviceId: string;
  deviceType: string;
  payloadType: 'scan' | 'presence' | 'input';
  rawValue: string;
  processedItemId?: string | null;
  processed?: boolean;
  processingError?: string | null;
  occurredAt?: Date;
}

export interface IDeviceRepository {
  // Device queries
  findById(id: string, facilityId: string): Promise<Device | null>;
  findMany(facilityId: string, activeOnly?: boolean): Promise<Device[]>;

  // Keyboard wedge is a virtual device for USB HID scanners
  findOrCreateKeyboardWedge(facilityId: string): Promise<Device>;

  // Device event operations (append-only)
  createEvent(data: CreateDeviceEventData): Promise<DeviceEvent>;

  // Lookup for processing
  getDeviceLocation(deviceId: string, facilityId: string): Promise<string | null>;
}

// Well-known device ID for keyboard wedge input
export const KEYBOARD_WEDGE_DEVICE_ID = '00000000-0000-0000-0000-000000000000';
