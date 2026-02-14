/**
 * Platform Invariant Regression Tests
 *
 * Proves:
 * 1. "PLATFORM" is rejected as a facility_key at the validation layer.
 * 2. The PLATFORM login path never queries the facility table.
 * 3. (Integration) The DB CHECK constraint rejects facility_key='PLATFORM'.
 *
 * Tests 1-2 are pure unit tests (no DB needed).
 * Test 3 requires a live Postgres connection (skipped when DB is unavailable).
 */

import { describe, it, expect } from 'vitest';
import { assertNotReservedFacilityKey } from '../src/utils/facility-key.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// 1. Validator unit tests
// ---------------------------------------------------------------------------

describe('assertNotReservedFacilityKey', () => {
  it('throws for "PLATFORM" (uppercase)', () => {
    expect(() => assertNotReservedFacilityKey('PLATFORM')).toThrow(
      /reserved/i,
    );
  });

  it('throws for "platform" (lowercase)', () => {
    expect(() => assertNotReservedFacilityKey('platform')).toThrow(
      /reserved/i,
    );
  });

  it('throws for "Platform" (mixed case)', () => {
    expect(() => assertNotReservedFacilityKey('Platform')).toThrow(
      /reserved/i,
    );
  });

  it('does not throw for normal facility keys', () => {
    expect(() => assertNotReservedFacilityKey('ASC-00001')).not.toThrow();
    expect(() => assertNotReservedFacilityKey('FACILITY_A')).not.toThrow();
  });

  it('error has statusCode 400 and code VALIDATION_ERROR', () => {
    try {
      assertNotReservedFacilityKey('PLATFORM');
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Platform login path is facility-table-independent (static analysis)
// ---------------------------------------------------------------------------

describe('Platform login path independence', () => {
  const authSrc = readFileSync(
    resolve(__dirname, '../src/routes/auth.routes.ts'),
    'utf-8',
  );

  it('PLATFORM branch does not query facility table', () => {
    // Extract the PLATFORM login block: from the PLATFORM check to the
    // "Standard tenant login flow" comment.
    const platformBlock = authSrc.slice(
      authSrc.indexOf("facilityKey.toUpperCase() === 'PLATFORM'"),
      authSrc.indexOf('// Standard tenant login flow'),
    );
    expect(platformBlock.length).toBeGreaterThan(0);

    // The platform block must NOT reference the facility table.
    expect(platformBlock).not.toMatch(/FROM\s+facility/i);
    expect(platformBlock).not.toMatch(/JOIN\s+facility/i);
  });

  it('PLATFORM branch issues JWT with facilityId = null', () => {
    const platformBlock = authSrc.slice(
      authSrc.indexOf("facilityKey.toUpperCase() === 'PLATFORM'"),
      authSrc.indexOf('// Standard tenant login flow'),
    );
    // Must contain explicit null assignment for facilityId in JWT payload
    expect(platformBlock).toMatch(/facilityId:\s*null/);
  });

  it('PLATFORM branch queries app_user with facility_id IS NULL', () => {
    const platformBlock = authSrc.slice(
      authSrc.indexOf("facilityKey.toUpperCase() === 'PLATFORM'"),
      authSrc.indexOf('// Standard tenant login flow'),
    );
    expect(platformBlock).toMatch(/facility_id\s+IS\s+NULL/i);
  });
});

// ---------------------------------------------------------------------------
// 3. DB CHECK constraint (integration — requires live Postgres)
// ---------------------------------------------------------------------------

const canConnectToDB = !!process.env.DB_HOST || !!process.env.DATABASE_URL;

describe.skipIf(!canConnectToDB)('DB: facility_key_not_reserved constraint', async () => {
  const pg = await import('pg');
  const pool = new pg.default.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 1,
  });

  it('rejects INSERT with facility_key = PLATFORM', async () => {
    try {
      await pool.query(
        `INSERT INTO facility (name, facility_key) VALUES ('Bad', 'PLATFORM')`,
      );
      expect.unreachable('INSERT should have been rejected by CHECK constraint');
    } catch (err: any) {
      expect(err.message).toMatch(/facility_key_not_reserved/);
    }
  });

  it('allows INSERT with a normal facility_key', async () => {
    const key = `TEST_${Date.now()}`;
    try {
      await pool.query(
        `INSERT INTO facility (name, facility_key) VALUES ('Test Facility', $1) RETURNING id`,
        [key],
      );
      // Clean up
      await pool.query(`DELETE FROM facility WHERE facility_key = $1`, [key]);
    } catch (err: any) {
      // Should not fail
      expect.unreachable(`Normal facility_key should be accepted: ${err.message}`);
    }
  });

  // Cleanup pool after tests
  afterAll(() => pool.end());
});
