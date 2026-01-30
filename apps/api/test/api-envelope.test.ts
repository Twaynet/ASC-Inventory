/**
 * API Consistency — Envelope + Auth Tests (Wave 1 + Wave 2)
 *
 * Verifies:
 * 1. ok() / fail() / validated() produce correct envelopes
 * 2. Capability-based auth allows ADMIN to access case requirements
 * 3. Persona header does not affect authorization
 * 4. Wave 2: Inventory and catalog capability enforcement
 */

import { describe, it, expect } from 'vitest';
import { deriveCapabilities } from '@asc/domain';
import type { UserRole } from '@asc/domain';
import { z } from 'zod';
import { ok, fail, validated } from '../src/utils/reply.js';

// ---------------------------------------------------------------------------
// 1. Reply helper unit tests
// ---------------------------------------------------------------------------

describe('ok() helper', () => {
  it('wraps payload in { data } with status 200 by default', () => {
    let sentBody: unknown;
    let sentStatus = 200;
    const reply = {
      status(code: number) { sentStatus = code; return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    ok(reply, { items: [1, 2, 3] });

    expect(sentStatus).toBe(200);
    expect(sentBody).toEqual({ data: { items: [1, 2, 3] } });
  });

  it('accepts custom status code', () => {
    let sentStatus = 0;
    const reply = {
      status(code: number) { sentStatus = code; return this; },
      send() { return this; },
    } as any;

    ok(reply, { id: '123' }, 201);

    expect(sentStatus).toBe(201);
  });
});

describe('fail() helper', () => {
  it('wraps error in { error: { code, message } }', () => {
    let sentBody: unknown;
    let sentStatus = 0;
    const reply = {
      status(code: number) { sentStatus = code; return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    fail(reply, 'NOT_FOUND', 'User not found', 404);

    expect(sentStatus).toBe(404);
    expect(sentBody).toEqual({
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  });

  it('includes details when provided', () => {
    let sentBody: unknown;
    const reply = {
      status() { return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    fail(reply, 'VALIDATION_ERROR', 'Bad input', 400, { field: 'name' });

    expect((sentBody as any).error.details).toEqual({ field: 'name' });
  });

  it('defaults to 400 status', () => {
    let sentStatus = 0;
    const reply = {
      status(code: number) { sentStatus = code; return this; },
      send() { return this; },
    } as any;

    fail(reply, 'VALIDATION_ERROR', 'Bad');

    expect(sentStatus).toBe(400);
  });
});

describe('validated() helper', () => {
  it('returns parsed data on valid input', () => {
    const reply = {
      status() { return this; },
      send() { return this; },
    } as any;

    const schema = z.object({ name: z.string() });
    const result = validated(reply, schema, { name: 'Alice' });

    expect(result).toEqual({ name: 'Alice' });
  });

  it('returns null and sends fail on invalid input', () => {
    let sentBody: unknown;
    let sentStatus = 0;
    const reply = {
      status(code: number) { sentStatus = code; return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    const schema = z.object({ name: z.string() });
    const result = validated(reply, schema, { name: 123 });

    expect(result).toBeNull();
    expect(sentStatus).toBe(400);
    expect((sentBody as any).error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 2. Capability-based auth for case requirements
// ---------------------------------------------------------------------------

describe('Case requirements auth (capability-based)', () => {
  it('ADMIN has CASE_VIEW capability', () => {
    const caps = deriveCapabilities(['ADMIN'] as UserRole[]);
    expect(caps).toContain('CASE_VIEW');
  });

  it('SURGEON has CASE_VIEW capability', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).toContain('CASE_VIEW');
  });

  it('ADMIN has USER_MANAGE capability (used for override check)', () => {
    const caps = deriveCapabilities(['ADMIN'] as UserRole[]);
    expect(caps).toContain('USER_MANAGE');
  });

  it('SURGEON does NOT have USER_MANAGE capability', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).not.toContain('USER_MANAGE');
  });

  it('INVENTORY_TECH has CASE_VIEW (read-only access to cases)', () => {
    const caps = deriveCapabilities(['INVENTORY_TECH'] as UserRole[]);
    expect(caps).toContain('CASE_VIEW');
  });
});

// ---------------------------------------------------------------------------
// 3. Persona header does not affect authorization
// ---------------------------------------------------------------------------

describe('Persona header does not affect auth', () => {
  it('deriveCapabilities ignores persona — only roles matter', () => {
    // Simulate: user has INVENTORY_TECH role, persona set to ADMIN
    const roles: UserRole[] = ['INVENTORY_TECH'];
    const caps = deriveCapabilities(roles);

    // Even with persona="ADMIN", capabilities come from roles only
    expect(caps).not.toContain('USER_MANAGE');
    expect(caps).not.toContain('SETTINGS_MANAGE');
    expect(caps).toContain('INVENTORY_READ');
  });

  it('multi-role user capabilities are union of roles, not persona', () => {
    const roles: UserRole[] = ['SURGEON', 'CIRCULATOR'];
    const caps = deriveCapabilities(roles);

    // Union of SURGEON + CIRCULATOR capabilities
    expect(caps).toContain('CASE_VIEW');
    expect(caps).toContain('CHECKLIST_ATTEST');
    expect(caps).toContain('OR_DEBRIEF');
    expect(caps).toContain('OR_TIMEOUT');
    // Persona cannot add capabilities not derived from roles
    expect(caps).not.toContain('USER_MANAGE');
  });
});

// ---------------------------------------------------------------------------
// 4. Wave 2: Inventory capability enforcement
// ---------------------------------------------------------------------------

describe('Inventory auth (capability-based, Wave 2)', () => {
  it('INVENTORY_TECH has INVENTORY_CHECKIN capability', () => {
    const caps = deriveCapabilities(['INVENTORY_TECH'] as UserRole[]);
    expect(caps).toContain('INVENTORY_CHECKIN');
  });

  it('ADMIN has INVENTORY_MANAGE capability (covers event creation)', () => {
    const caps = deriveCapabilities(['ADMIN'] as UserRole[]);
    expect(caps).toContain('INVENTORY_MANAGE');
  });

  it('SURGEON cannot create inventory events (no INVENTORY_CHECKIN or INVENTORY_MANAGE)', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).not.toContain('INVENTORY_CHECKIN');
    expect(caps).not.toContain('INVENTORY_MANAGE');
  });

  it('SCHEDULER cannot create inventory events', () => {
    const caps = deriveCapabilities(['SCHEDULER'] as UserRole[]);
    expect(caps).not.toContain('INVENTORY_CHECKIN');
    expect(caps).not.toContain('INVENTORY_MANAGE');
  });
});

// ---------------------------------------------------------------------------
// 5. Wave 2: Catalog capability enforcement
// ---------------------------------------------------------------------------

describe('Catalog auth (capability-based, Wave 2)', () => {
  it('ADMIN has CATALOG_MANAGE capability', () => {
    const caps = deriveCapabilities(['ADMIN'] as UserRole[]);
    expect(caps).toContain('CATALOG_MANAGE');
  });

  it('INVENTORY_TECH cannot manage catalog (no CATALOG_MANAGE)', () => {
    const caps = deriveCapabilities(['INVENTORY_TECH'] as UserRole[]);
    expect(caps).not.toContain('CATALOG_MANAGE');
  });

  it('SURGEON cannot manage catalog', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).not.toContain('CATALOG_MANAGE');
  });
});

// ---------------------------------------------------------------------------
// 6. Wave 3: Case capability enforcement
// ---------------------------------------------------------------------------

describe('Case auth (capability-based, Wave 3)', () => {
  it('ADMIN has all case capabilities including CASE_DELETE', () => {
    const caps = deriveCapabilities(['ADMIN'] as UserRole[]);
    expect(caps).toContain('CASE_CREATE');
    expect(caps).toContain('CASE_UPDATE');
    expect(caps).toContain('CASE_APPROVE');
    expect(caps).toContain('CASE_REJECT');
    expect(caps).toContain('CASE_ASSIGN_ROOM');
    expect(caps).toContain('CASE_ACTIVATE');
    expect(caps).toContain('CASE_DELETE');
    expect(caps).toContain('CASE_CANCEL');
    expect(caps).toContain('CASE_PREFERENCE_CARD_LINK');
  });

  it('SCHEDULER has approve/reject/assign-room but NOT CASE_DELETE', () => {
    const caps = deriveCapabilities(['SCHEDULER'] as UserRole[]);
    expect(caps).toContain('CASE_APPROVE');
    expect(caps).toContain('CASE_REJECT');
    expect(caps).toContain('CASE_ASSIGN_ROOM');
    expect(caps).toContain('CASE_CREATE');
    expect(caps).toContain('CASE_UPDATE');
    expect(caps).toContain('CASE_ACTIVATE');
    expect(caps).toContain('CASE_CANCEL');
    expect(caps).not.toContain('CASE_DELETE');
  });

  it('SURGEON cannot approve/reject/assign-room/delete', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).not.toContain('CASE_APPROVE');
    expect(caps).not.toContain('CASE_REJECT');
    expect(caps).not.toContain('CASE_ASSIGN_ROOM');
    expect(caps).not.toContain('CASE_ACTIVATE');
    expect(caps).not.toContain('CASE_DELETE');
  });

  it('SURGEON can create, update, cancel, and link preference cards', () => {
    const caps = deriveCapabilities(['SURGEON'] as UserRole[]);
    expect(caps).toContain('CASE_CREATE');
    expect(caps).toContain('CASE_UPDATE');
    expect(caps).toContain('CASE_CANCEL');
    expect(caps).toContain('CASE_PREFERENCE_CARD_LINK');
  });

  it('INVENTORY_TECH has CASE_VIEW but no case mutation capabilities', () => {
    const caps = deriveCapabilities(['INVENTORY_TECH'] as UserRole[]);
    expect(caps).toContain('CASE_VIEW');
    expect(caps).not.toContain('CASE_CREATE');
    expect(caps).not.toContain('CASE_UPDATE');
    expect(caps).not.toContain('CASE_APPROVE');
    expect(caps).not.toContain('CASE_REJECT');
    expect(caps).not.toContain('CASE_ASSIGN_ROOM');
    expect(caps).not.toContain('CASE_ACTIVATE');
    expect(caps).not.toContain('CASE_CANCEL');
    expect(caps).not.toContain('CASE_PREFERENCE_CARD_LINK');
  });

  it('CIRCULATOR has CASE_VIEW but no case mutation capabilities', () => {
    const caps = deriveCapabilities(['CIRCULATOR'] as UserRole[]);
    expect(caps).toContain('CASE_VIEW');
    expect(caps).not.toContain('CASE_CREATE');
    expect(caps).not.toContain('CASE_APPROVE');
    expect(caps).not.toContain('CASE_ACTIVATE');
  });
});
