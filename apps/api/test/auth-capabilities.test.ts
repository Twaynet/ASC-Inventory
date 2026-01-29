/**
 * Auth & Capabilities Unit Tests
 *
 * Tests the role→capability mapping, getUserRoles normalization,
 * and requireCapabilities/requireRoles logic without a running server.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveCapabilities,
  getUserRoles,
  ROLE_CAPABILITIES,
  type Capability,
  type JwtPayload,
} from '../src/plugins/auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    userId: 'u1',
    facilityId: 'f1',
    username: 'test',
    email: null,
    name: 'Test User',
    role: 'CIRCULATOR',
    roles: ['CIRCULATOR'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getUserRoles', () => {
  it('returns roles[] when present', () => {
    const u = fakeUser({ role: 'CIRCULATOR', roles: ['CIRCULATOR', 'ADMIN'] });
    expect(getUserRoles(u)).toEqual(['CIRCULATOR', 'ADMIN']);
  });

  it('falls back to [role] when roles is empty', () => {
    const u = fakeUser({ role: 'SURGEON', roles: [] as any });
    expect(getUserRoles(u)).toEqual(['SURGEON']);
  });

  it('falls back to [role] when roles is undefined', () => {
    const u = fakeUser({ role: 'ADMIN', roles: undefined as any });
    expect(getUserRoles(u)).toEqual(['ADMIN']);
  });
});

describe('deriveCapabilities', () => {
  it('returns correct capabilities for ADMIN', () => {
    const caps = deriveCapabilities(['ADMIN']);
    expect(caps).toContain('USER_MANAGE');
    expect(caps).toContain('CATALOG_MANAGE');
    expect(caps).toContain('SETTINGS_MANAGE');
    expect(caps).toContain('CASE_VIEW');
  });

  it('returns union of capabilities for multi-role user', () => {
    const caps = deriveCapabilities(['CIRCULATOR', 'INVENTORY_TECH']);
    expect(caps).toContain('CASE_VIEW');       // from CIRCULATOR
    expect(caps).toContain('OR_DEBRIEF');      // from CIRCULATOR
    expect(caps).toContain('INVENTORY_READ');   // from INVENTORY_TECH
    expect(caps).toContain('INVENTORY_CHECKIN');// from INVENTORY_TECH
  });

  it('does not include admin capabilities for non-admin roles', () => {
    const caps = deriveCapabilities(['SURGEON']);
    expect(caps).not.toContain('USER_MANAGE');
    expect(caps).not.toContain('SETTINGS_MANAGE');
  });

  it('a non-admin user cannot get SETTINGS_MANAGE even with multiple roles', () => {
    const caps = deriveCapabilities(['CIRCULATOR', 'SCHEDULER', 'SURGEON']);
    expect(caps).not.toContain('SETTINGS_MANAGE');
    expect(caps).not.toContain('USER_MANAGE');
  });

  it('a user with ADMIN in roles[] gets admin capabilities regardless of primary role', () => {
    // This is the key multi-role scenario: primary role CIRCULATOR, but ADMIN in roles[]
    const caps = deriveCapabilities(['CIRCULATOR', 'ADMIN']);
    expect(caps).toContain('USER_MANAGE');
    expect(caps).toContain('SETTINGS_MANAGE');
    expect(caps).toContain('OR_DEBRIEF'); // still gets circulator caps
  });
});

describe('ROLE_CAPABILITIES mapping', () => {
  it('every role has at least one capability', () => {
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      expect(caps.length, `Role ${role} should have capabilities`).toBeGreaterThan(0);
    }
  });
});
