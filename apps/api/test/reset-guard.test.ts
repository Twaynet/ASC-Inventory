/**
 * Reset Guard Tests
 *
 * Proves the deadman's switch blocks destructive resets in unsafe contexts
 * and allows them in safe contexts. No DB required.
 */

import { describe, it, expect } from 'vitest';
import {
  assertResetAllowed,
  assertFacilityCountSafe,
  isLocalDb,
  ResetBlockedError,
  type DbConfig,
  type ResetEnv,
} from '../db/reset-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const localConfig: DbConfig = { host: 'localhost', dbName: 'asc_inventory', user: 'postgres', ssl: false };
const remoteConfig: DbConfig = { host: '10.0.1.50', dbName: 'asc_inventory', user: 'postgres', ssl: false };
const remoteSslConfig: DbConfig = { host: 'db.neon.tech', dbName: 'asc_prod', user: 'admin', ssl: true };

// ---------------------------------------------------------------------------
// isLocalDb
// ---------------------------------------------------------------------------

describe('isLocalDb', () => {
  it('returns true for localhost', () => {
    expect(isLocalDb(localConfig)).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    expect(isLocalDb({ ...localConfig, host: '127.0.0.1' })).toBe(true);
  });

  it('returns true for empty host (defaults to localhost)', () => {
    expect(isLocalDb({ ...localConfig, host: '' })).toBe(true);
  });

  it('returns false for remote host', () => {
    expect(isLocalDb(remoteConfig)).toBe(false);
  });

  it('returns false for localhost with SSL (likely tunneled to remote)', () => {
    expect(isLocalDb({ ...localConfig, ssl: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertResetAllowed
// ---------------------------------------------------------------------------

describe('assertResetAllowed', () => {
  it('allows reset on local DB without any env vars', () => {
    expect(() => assertResetAllowed({}, localConfig)).not.toThrow();
  });

  it('allows reset on local DB in development', () => {
    expect(() => assertResetAllowed({ NODE_ENV: 'development' }, localConfig)).not.toThrow();
  });

  it('blocks reset when NODE_ENV=production even on local DB', () => {
    expect(() => assertResetAllowed({ NODE_ENV: 'production' }, localConfig))
      .toThrow(ResetBlockedError);
  });

  it('blocks reset when NODE_ENV=production even with CONFIRM_DB_RESET=YES', () => {
    expect(() => assertResetAllowed({ NODE_ENV: 'production', CONFIRM_DB_RESET: 'YES' }, localConfig))
      .toThrow(/never allowed in production/);
  });

  it('blocks reset on remote DB without CONFIRM_DB_RESET', () => {
    expect(() => assertResetAllowed({}, remoteConfig)).toThrow(ResetBlockedError);
  });

  it('blocks reset on remote DB with wrong confirmation value', () => {
    expect(() => assertResetAllowed({ CONFIRM_DB_RESET: 'yes' }, remoteConfig)).toThrow(ResetBlockedError);
  });

  it('allows reset on remote DB with CONFIRM_DB_RESET=YES', () => {
    expect(() => assertResetAllowed({ CONFIRM_DB_RESET: 'YES' }, remoteConfig)).not.toThrow();
  });

  it('blocks reset on SSL remote DB without confirmation', () => {
    expect(() => assertResetAllowed({}, remoteSslConfig)).toThrow(ResetBlockedError);
  });

  it('allows reset on SSL remote DB with CONFIRM_DB_RESET=YES', () => {
    expect(() => assertResetAllowed({ CONFIRM_DB_RESET: 'YES' }, remoteSslConfig)).not.toThrow();
  });

  it('error message includes DB host and name', () => {
    try {
      assertResetAllowed({}, remoteConfig);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('10.0.1.50');
      expect(err.message).toContain('asc_inventory');
      expect(err.message).toContain('CONFIRM_DB_RESET=YES');
    }
  });
});

// ---------------------------------------------------------------------------
// assertFacilityCountSafe (tripwire)
// ---------------------------------------------------------------------------

describe('assertFacilityCountSafe', () => {
  it('allows reset when facility count is 0', () => {
    expect(() => assertFacilityCountSafe(0, {}, localConfig)).not.toThrow();
  });

  it('allows reset when facility count is 1 (default threshold)', () => {
    expect(() => assertFacilityCountSafe(1, {}, localConfig)).not.toThrow();
  });

  it('blocks reset when facility count exceeds threshold', () => {
    expect(() => assertFacilityCountSafe(2, {}, localConfig)).toThrow(ResetBlockedError);
  });

  it('blocks reset with wrong confirmation value', () => {
    expect(() => assertFacilityCountSafe(3, { CONFIRM_DB_RESET_FORCE: 'YES' }, localConfig))
      .toThrow(ResetBlockedError);
  });

  it('allows reset with CONFIRM_DB_RESET_FORCE=YES_I_UNDERSTAND', () => {
    expect(() => assertFacilityCountSafe(5, { CONFIRM_DB_RESET_FORCE: 'YES_I_UNDERSTAND' }, localConfig))
      .not.toThrow();
  });

  it('error message includes facility count', () => {
    try {
      assertFacilityCountSafe(7, {}, remoteConfig);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('7 facilities');
      expect(err.message).toContain('CONFIRM_DB_RESET_FORCE=YES_I_UNDERSTAND');
    }
  });

  it('respects custom threshold', () => {
    expect(() => assertFacilityCountSafe(5, {}, localConfig, 10)).not.toThrow();
    expect(() => assertFacilityCountSafe(11, {}, localConfig, 10)).toThrow(ResetBlockedError);
  });
});

// ---------------------------------------------------------------------------
// Normal seed path (no --reset) should never be affected
// ---------------------------------------------------------------------------

describe('Normal seed (no --reset) is unaffected', () => {
  it('guard functions are only called in reset path (structural proof)', () => {
    // This test reads seed.ts and verifies the guard is inside the forceReseed block.
    // The guard is not called for normal seeding.
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const seedSrc = readFileSync(resolve(__dirname, '../db/seed.ts'), 'utf-8');

    // assertResetAllowed call (not the import) must appear AFTER the forceReseed check
    const forceReseedIdx = seedSrc.indexOf('if (forceReseed)');
    const guardIdx = seedSrc.indexOf('assertResetAllowed(resetEnv');
    expect(forceReseedIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(forceReseedIdx);

    // and BEFORE the TRUNCATE
    const truncateIdx = seedSrc.indexOf('TRUNCATE facility CASCADE');
    expect(guardIdx).toBeLessThan(truncateIdx);
  });
});
