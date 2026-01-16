/**
 * Scanner Pipeline Test
 *
 * Tests the device event → inventory event pipeline logic
 * without requiring a database connection.
 */

import { describe, it, expect } from 'vitest';

// Mock data constants
const FACILITY_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const DEVICE_ID = '33333333-3333-3333-3333-333333333333';
const KEYBOARD_WEDGE_DEVICE_ID = '00000000-0000-0000-0000-000000000000';

// Simulated database types
interface MockDevice {
  id: string;
  facility_id: string;
  location_id: string | null;
  active: boolean;
}

interface MockInventoryItem {
  id: string;
  facility_id: string;
  barcode: string | null;
  serial_number: string | null;
  location_id: string | null;
}

interface MockDeviceEvent {
  id: string;
  device_id: string;
  raw_value: string;
  processed: boolean;
  processed_item_id: string | null;
  processing_error: string | null;
}

interface MockInventoryEvent {
  id: string;
  inventory_item_id: string;
  event_type: string;
  device_event_id: string;
}

interface MockDb {
  devices: Map<string, MockDevice>;
  inventoryItems: Map<string, MockInventoryItem>;
  deviceEvents: MockDeviceEvent[];
  inventoryEvents: MockInventoryEvent[];
}

// Scanner Pipeline Logic (extracted from route handler)
interface DeviceEventInput {
  deviceId: string;
  deviceType: 'barcode' | 'rfid' | 'nfc' | 'other';
  payloadType: 'scan' | 'presence' | 'input';
  rawValue: string;
}

interface DeviceEventResult {
  deviceEventId: string;
  processed: boolean;
  processedItemId: string | null;
  error: string | null;
}

function processDeviceEvent(
  db: MockDb,
  facilityId: string,
  userId: string,
  input: DeviceEventInput
): DeviceEventResult {
  const isKeyboardWedge = input.deviceId === KEYBOARD_WEDGE_DEVICE_ID;
  let actualDeviceId = input.deviceId;
  let deviceLocationId: string | null = null;

  // Handle keyboard wedge virtual device
  if (isKeyboardWedge) {
    actualDeviceId = 'virtual-keyboard-wedge-' + facilityId;
  } else {
    // Verify device exists
    const device = db.devices.get(input.deviceId);
    if (!device || device.facility_id !== facilityId || !device.active) {
      throw new Error('Device not found or inactive');
    }
    deviceLocationId = device.location_id;
  }

  // Try to resolve barcode to inventory item
  let processedItemId: string | null = null;
  let processingError: string | null = null;

  // Search by barcode
  for (const [id, item] of db.inventoryItems) {
    if (item.facility_id === facilityId && item.barcode === input.rawValue) {
      processedItemId = id;
      break;
    }
  }

  // If not found by barcode, try serial number
  if (!processedItemId) {
    for (const [id, item] of db.inventoryItems) {
      if (item.facility_id === facilityId && item.serial_number === input.rawValue) {
        processedItemId = id;
        break;
      }
    }
  }

  if (!processedItemId) {
    processingError = 'No matching inventory item found';
  }

  // Create device event
  const deviceEventId = `device-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.deviceEvents.push({
    id: deviceEventId,
    device_id: actualDeviceId,
    raw_value: input.rawValue,
    processed: processedItemId !== null,
    processed_item_id: processedItemId,
    processing_error: processingError,
  });

  // If item found and it's a scan, create VERIFIED inventory event
  if (processedItemId && input.payloadType === 'scan') {
    db.inventoryEvents.push({
      id: `inv-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      inventory_item_id: processedItemId,
      event_type: 'VERIFIED',
      device_event_id: deviceEventId,
    });
  }

  return {
    deviceEventId,
    processed: processedItemId !== null,
    processedItemId,
    error: processingError,
  };
}

// Test utilities
function createDb(): MockDb {
  const db: MockDb = {
    devices: new Map(),
    inventoryItems: new Map(),
    deviceEvents: [],
    inventoryEvents: [],
  };

  // Add test device
  db.devices.set(DEVICE_ID, {
    id: DEVICE_ID,
    facility_id: FACILITY_ID,
    location_id: 'location-1',
    active: true,
  });

  // Add test inventory items
  db.inventoryItems.set('item-1', {
    id: 'item-1',
    facility_id: FACILITY_ID,
    barcode: 'HS12-001',
    serial_number: null,
    location_id: 'location-1',
  });

  db.inventoryItems.set('item-2', {
    id: 'item-2',
    facility_id: FACILITY_ID,
    barcode: null,
    serial_number: 'SN-12345',
    location_id: 'location-2',
  });

  return db;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// Test runner
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error}`);
  }
}

// Vitest wrapper
describe('Scanner Pipeline', () => {
  it('runs all scanner pipeline tests', () => {
    // Tests
    console.log('\n🔬 Scanner Pipeline Tests\n');
    console.log('Device Event Processing:');

test('should process a valid barcode scan and create VERIFIED event', () => {
  const db = createDb();
  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: DEVICE_ID,
    deviceType: 'barcode',
    payloadType: 'scan',
    rawValue: 'HS12-001',
  });

  assert(result.processed === true, 'Expected processed to be true');
  assert(result.processedItemId === 'item-1', 'Expected processedItemId to be item-1');
  assert(result.error === null, 'Expected no error');
  assert(db.deviceEvents.length === 1, 'Expected 1 device event');
  assert(db.deviceEvents[0].processed === true, 'Expected device event processed to be true');
  assert(db.inventoryEvents.length === 1, 'Expected 1 inventory event');
  assert(db.inventoryEvents[0].event_type === 'VERIFIED', 'Expected VERIFIED event type');
  assert(db.inventoryEvents[0].inventory_item_id === 'item-1', 'Expected inventory event for item-1');
});

test('should match by serial number when barcode not found', () => {
  const db = createDb();
  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: DEVICE_ID,
    deviceType: 'barcode',
    payloadType: 'scan',
    rawValue: 'SN-12345',
  });

  assert(result.processed === true, 'Expected processed to be true');
  assert(result.processedItemId === 'item-2', 'Expected processedItemId to be item-2');
});

test('should return error for unknown barcode', () => {
  const db = createDb();
  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: DEVICE_ID,
    deviceType: 'barcode',
    payloadType: 'scan',
    rawValue: 'UNKNOWN-BARCODE',
  });

  assert(result.processed === false, 'Expected processed to be false');
  assert(result.processedItemId === null, 'Expected processedItemId to be null');
  assert(result.error === 'No matching inventory item found', 'Expected error message');
  assert(db.deviceEvents.length === 1, 'Expected 1 device event (for audit trail)');
  assert(db.deviceEvents[0].processed === false, 'Expected device event processed to be false');
  assert(db.inventoryEvents.length === 0, 'Expected no inventory event');
});

test('should handle keyboard wedge virtual device', () => {
  const db = createDb();
  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: KEYBOARD_WEDGE_DEVICE_ID,
    deviceType: 'barcode',
    payloadType: 'scan',
    rawValue: 'HS12-001',
  });

  assert(result.processed === true, 'Expected processed to be true');
  assert(result.processedItemId === 'item-1', 'Expected processedItemId to be item-1');
  assert(db.deviceEvents[0].device_id.includes('virtual-keyboard-wedge'), 'Expected virtual device ID');
});

test('should reject inactive device', () => {
  const db = createDb();
  db.devices.get(DEVICE_ID)!.active = false;

  let threw = false;
  try {
    processDeviceEvent(db, FACILITY_ID, USER_ID, {
      deviceId: DEVICE_ID,
      deviceType: 'barcode',
      payloadType: 'scan',
      rawValue: 'HS12-001',
    });
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error && err.message === 'Device not found or inactive',
      'Expected "Device not found or inactive" error'
    );
  }
  assert(threw, 'Expected an error to be thrown');
});

test('should reject device from different facility', () => {
  const db = createDb();

  let threw = false;
  try {
    processDeviceEvent(db, 'different-facility', USER_ID, {
      deviceId: DEVICE_ID,
      deviceType: 'barcode',
      payloadType: 'scan',
      rawValue: 'HS12-001',
    });
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Expected an error to be thrown');
});

test('should not create inventory event for non-scan payload types', () => {
  const db = createDb();
  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: DEVICE_ID,
    deviceType: 'rfid',
    payloadType: 'presence',
    rawValue: 'HS12-001',
  });

  assert(result.processed === true, 'Expected processed to be true');
  assert(db.deviceEvents.length === 1, 'Expected 1 device event');
  assert(db.inventoryEvents.length === 0, 'Expected no inventory event for presence payload');
});

console.log('\nItem Isolation:');

test('should not match items from different facility', () => {
  const db = createDb();
  db.inventoryItems.set('item-other-facility', {
    id: 'item-other-facility',
    facility_id: 'other-facility',
    barcode: 'SHARED-BARCODE',
    serial_number: null,
    location_id: 'location-x',
  });

  const result = processDeviceEvent(db, FACILITY_ID, USER_ID, {
    deviceId: DEVICE_ID,
    deviceType: 'barcode',
    payloadType: 'scan',
    rawValue: 'SHARED-BARCODE',
  });

  assert(result.processed === false, 'Expected processed to be false (item is in different facility)');
  assert(result.error === 'No matching inventory item found', 'Expected error message');
});

// Summary
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      throw new Error(`${failed} test(s) failed`);
    } else {
      console.log('\n✅ All tests passed!');
    }

    expect(failed).toBe(0);
  });
});
