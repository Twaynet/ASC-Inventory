/**
 * Platform Control Plane Auth Tests
 *
 * LAW §2.4: Tenant users must never access Control Plane routes.
 * LAW §3.1: PLATFORM_ADMIN is a non-tenant identity.
 * LAW §13.3: Control Plane access must be test-verified.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveCapabilities,
  getUserRoles,
  isPlatformAdmin,
  type JwtPayload,
} from '../src/plugins/auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeTenantUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    userId: 'u1',
    facilityId: 'f1', // Tenant user has facilityId
    username: 'test',
    email: null,
    name: 'Test User',
    role: 'ADMIN',
    roles: ['ADMIN'],
    ...overrides,
  };
}

function fakePlatformAdmin(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    userId: 'platform-u1',
    facilityId: null, // LAW §3.1: No-tenant identity
    username: 'platform-admin',
    email: 'admin@platform.local',
    name: 'Platform Admin',
    role: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: PLATFORM_ADMIN Identity (LAW §3.1-3.2)
// ---------------------------------------------------------------------------

describe('PLATFORM_ADMIN Identity', () => {
  it('isPlatformAdmin returns true for PLATFORM_ADMIN role', () => {
    const u = fakePlatformAdmin();
    expect(isPlatformAdmin(u)).toBe(true);
  });

  it('isPlatformAdmin returns false for tenant ADMIN', () => {
    const u = fakeTenantUser({ role: 'ADMIN', roles: ['ADMIN'] });
    expect(isPlatformAdmin(u)).toBe(false);
  });

  it('isPlatformAdmin returns false for other tenant roles', () => {
    const roles = ['SCHEDULER', 'CIRCULATOR', 'SURGEON', 'INVENTORY_TECH', 'SCRUB', 'ANESTHESIA'] as const;
    for (const role of roles) {
      const u = fakeTenantUser({ role, roles: [role] });
      expect(isPlatformAdmin(u), `${role} should not be platform admin`).toBe(false);
    }
  });

  it('PLATFORM_ADMIN has null facilityId (no-tenant identity)', () => {
    const u = fakePlatformAdmin();
    expect(u.facilityId).toBeNull();
  });

  it('Tenant users have non-null facilityId', () => {
    const u = fakeTenantUser();
    expect(u.facilityId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: PLATFORM_ADMIN Capabilities (LAW §4.2)
// ---------------------------------------------------------------------------

describe('PLATFORM_ADMIN Capabilities', () => {
  it('PLATFORM_ADMIN has PLATFORM_ADMIN capability', () => {
    const caps = deriveCapabilities(['PLATFORM_ADMIN']);
    expect(caps).toContain('PLATFORM_ADMIN');
  });

  it('PLATFORM_ADMIN has PLATFORM_CONFIG_VIEW capability', () => {
    const caps = deriveCapabilities(['PLATFORM_ADMIN']);
    expect(caps).toContain('PLATFORM_CONFIG_VIEW');
  });

  it('PLATFORM_ADMIN has PLATFORM_CONFIG_MANAGE capability', () => {
    const caps = deriveCapabilities(['PLATFORM_ADMIN']);
    expect(caps).toContain('PLATFORM_CONFIG_MANAGE');
  });

  it('PLATFORM_ADMIN does NOT have tenant capabilities (LAW §4.2)', () => {
    const caps = deriveCapabilities(['PLATFORM_ADMIN']);
    // PLATFORM_ADMIN should not have tenant-specific capabilities
    expect(caps).not.toContain('CASE_VIEW');
    expect(caps).not.toContain('CASE_CREATE');
    expect(caps).not.toContain('USER_MANAGE');
    expect(caps).not.toContain('INVENTORY_MANAGE');
    expect(caps).not.toContain('SETTINGS_MANAGE');
  });

  it('Tenant ADMIN does NOT have platform capabilities', () => {
    const caps = deriveCapabilities(['ADMIN']);
    expect(caps).not.toContain('PLATFORM_ADMIN');
    expect(caps).not.toContain('PLATFORM_CONFIG_VIEW');
    expect(caps).not.toContain('PLATFORM_CONFIG_MANAGE');
  });

  it('No tenant role has PLATFORM_ADMIN capability', () => {
    const tenantRoles = ['ADMIN', 'SCHEDULER', 'CIRCULATOR', 'SURGEON', 'INVENTORY_TECH', 'SCRUB', 'ANESTHESIA'] as const;
    for (const role of tenantRoles) {
      const caps = deriveCapabilities([role]);
      expect(caps, `${role} should not have PLATFORM_ADMIN`).not.toContain('PLATFORM_ADMIN');
      expect(caps, `${role} should not have PLATFORM_CONFIG_VIEW`).not.toContain('PLATFORM_CONFIG_VIEW');
      expect(caps, `${role} should not have PLATFORM_CONFIG_MANAGE`).not.toContain('PLATFORM_CONFIG_MANAGE');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: getUserRoles with PLATFORM_ADMIN
// ---------------------------------------------------------------------------

describe('getUserRoles with PLATFORM_ADMIN', () => {
  it('returns PLATFORM_ADMIN from roles[]', () => {
    const u = fakePlatformAdmin();
    expect(getUserRoles(u)).toEqual(['PLATFORM_ADMIN']);
  });

  it('falls back to role field for legacy JWT', () => {
    const u = fakePlatformAdmin({ roles: [] as any });
    expect(getUserRoles(u)).toEqual(['PLATFORM_ADMIN']);
  });
});
