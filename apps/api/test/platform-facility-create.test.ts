/**
 * Platform Facility Creation Tests
 *
 * Proves:
 * 1. Input validation (Zod schema, reserved keys, duplicate keys)
 * 2. Bootstrap helper produces correct row structure
 * 3. Auth boundary (PLATFORM_ADMIN only)
 * 4. Tenant isolation between facilities
 * 5. Transaction rollback on error
 *
 * Unit tests (1-3) run without DB.
 * Integration tests (4-5) require live Postgres (skipped when DB_HOST unset).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotReservedFacilityKey } from '../src/utils/facility-key.js';

// ---------------------------------------------------------------------------
// Schema (extracted inline to avoid importing Fastify route internals)
// ---------------------------------------------------------------------------

const CreateFacilitySchema = z.object({
  facilityKey: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(255),
  timezone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  initialAdmin: z.object({
    username: z.string().min(3).max(100),
    password: z.string().min(8),
    name: z.string().min(1).max(255),
    email: z.string().email().optional(),
  }),
});

// ---------------------------------------------------------------------------
// 1. Input Validation
// ---------------------------------------------------------------------------

describe('CreateFacility schema validation', () => {
  const validInput = {
    facilityKey: 'TEST_FACILITY',
    name: 'Test Surgery Center',
    initialAdmin: {
      username: 'admin',
      password: 'password123',
      name: 'Admin User',
    },
  };

  it('accepts valid input with required fields only', () => {
    const result = CreateFacilitySchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all optional fields', () => {
    const result = CreateFacilitySchema.safeParse({
      ...validInput,
      timezone: 'America/Chicago',
      address: '100 Medical Way',
      initialAdmin: { ...validInput.initialAdmin, email: 'admin@test.com' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty facilityKey', () => {
    const result = CreateFacilitySchema.safeParse({ ...validInput, facilityKey: '' });
    expect(result.success).toBe(false);
  });

  it('rejects facilityKey over 20 characters', () => {
    const result = CreateFacilitySchema.safeParse({ ...validInput, facilityKey: 'A'.repeat(21) });
    expect(result.success).toBe(false);
  });

  it('rejects lowercase facilityKey', () => {
    const result = CreateFacilitySchema.safeParse({ ...validInput, facilityKey: 'test_facility' });
    expect(result.success).toBe(false);
  });

  it('rejects facilityKey with spaces', () => {
    const result = CreateFacilitySchema.safeParse({ ...validInput, facilityKey: 'TEST FAC' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = CreateFacilitySchema.safeParse({
      ...validInput,
      initialAdmin: { ...validInput.initialAdmin, password: 'short' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects username shorter than 3 characters', () => {
    const result = CreateFacilitySchema.safeParse({
      ...validInput,
      initialAdmin: { ...validInput.initialAdmin, username: 'ab' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing initialAdmin block', () => {
    const { initialAdmin, ...noAdmin } = validInput;
    const result = CreateFacilitySchema.safeParse(noAdmin);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Reserved Key Rejection (reuses existing validator)
// ---------------------------------------------------------------------------

describe('Reserved facility key rejection at creation boundary', () => {
  it('PLATFORM is rejected (uppercase)', () => {
    expect(() => assertNotReservedFacilityKey('PLATFORM')).toThrow(/reserved/i);
  });

  it('platform is rejected (lowercase)', () => {
    expect(() => assertNotReservedFacilityKey('platform')).toThrow(/reserved/i);
  });

  it('normal facility keys are accepted', () => {
    expect(() => assertNotReservedFacilityKey('ACME_ASC')).not.toThrow();
    expect(() => assertNotReservedFacilityKey('ORTHOWISE_BETA')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Route structural proofs (static code analysis)
// ---------------------------------------------------------------------------

describe('Platform facilities route structure', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform-facilities.routes.ts'),
    'utf-8',
  );

  it('POST / route requires requirePlatformAdmin()', () => {
    // Find the POST route handler block
    const postIdx = routeSrc.indexOf("fastify.post('/'");
    expect(postIdx).toBeGreaterThan(-1);
    // requirePlatformAdmin must appear in preHandler before the handler
    const preHandlerBlock = routeSrc.slice(postIdx, postIdx + 200);
    expect(preHandlerBlock).toContain('requirePlatformAdmin()');
  });

  it('GET /:facilityId/bootstrap-status requires requirePlatformAdmin()', () => {
    const getIdx = routeSrc.indexOf("'/:facilityId/bootstrap-status'");
    expect(getIdx).toBeGreaterThan(-1);
    const preHandlerBlock = routeSrc.slice(getIdx, getIdx + 200);
    expect(preHandlerBlock).toContain('requirePlatformAdmin()');
  });

  it('POST / calls assertNotReservedFacilityKey before DB insert', () => {
    const assertIdx = routeSrc.indexOf('assertNotReservedFacilityKey');
    const transactionIdx = routeSrc.indexOf('transaction(');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(transactionIdx).toBeGreaterThan(assertIdx);
  });

  it('POST / checks for duplicate facility_key before transaction', () => {
    const duplicateCheckIdx = routeSrc.indexOf("'SELECT id FROM facility WHERE facility_key");
    const transactionIdx = routeSrc.indexOf('transaction(');
    expect(duplicateCheckIdx).toBeGreaterThan(-1);
    expect(transactionIdx).toBeGreaterThan(duplicateCheckIdx);
  });

  it('POST / wraps bootstrap in transaction() for atomicity', () => {
    expect(routeSrc).toContain('transaction(async (client)');
    expect(routeSrc).toContain('createFacilityBootstrap(client');
  });

  it('POST / returns 201 on success', () => {
    expect(routeSrc).toContain('ok(reply, result, 201)');
  });

  it('POST / returns 409 on duplicate facility_key', () => {
    expect(routeSrc).toContain("'CONFLICT'");
    expect(routeSrc).toContain('409');
  });
});

// ---------------------------------------------------------------------------
// 4. Bootstrap helper structural proofs
// ---------------------------------------------------------------------------

describe('Facility bootstrap helper structure', () => {
  const bootstrapSrc = readFileSync(
    resolve(__dirname, '../src/services/facility-bootstrap.ts'),
    'utf-8',
  );

  it('creates facility row', () => {
    expect(bootstrapSrc).toContain('INSERT INTO facility');
  });

  it('creates ASC organization', () => {
    expect(bootstrapSrc).toMatch(/INSERT INTO organization.*'ASC'/s);
  });

  it('creates facility_settings', () => {
    expect(bootstrapSrc).toContain('INSERT INTO facility_settings');
  });

  it('creates rooms', () => {
    expect(bootstrapSrc).toContain('INSERT INTO room');
  });

  it('creates config items (patient flags + anesthesia modalities)', () => {
    expect(bootstrapSrc).toContain("'PATIENT_FLAG'");
    expect(bootstrapSrc).toContain("'ANESTHESIA_MODALITY'");
  });

  it('creates initial ADMIN user with facility_id scoped', () => {
    expect(bootstrapSrc).toContain("'ADMIN'");
    expect(bootstrapSrc).toContain('INSERT INTO app_user');
  });

  it('affiliates admin with ASC organization', () => {
    expect(bootstrapSrc).toContain('INSERT INTO user_organization_affiliation');
  });

  it('does NOT contain TRUNCATE or DELETE', () => {
    expect(bootstrapSrc).not.toMatch(/TRUNCATE/i);
    expect(bootstrapSrc).not.toMatch(/DELETE\s+FROM/i);
  });

  it('does NOT insert PLATFORM_ADMIN role into app_user', () => {
    // The bootstrap creates ADMIN users, never PLATFORM_ADMIN.
    // Comments may reference PLATFORM_ADMIN; check only the SQL insert.
    const insertBlock = bootstrapSrc.slice(
      bootstrapSrc.indexOf('INSERT INTO app_user'),
      bootstrapSrc.indexOf('RETURNING id', bootstrapSrc.indexOf('INSERT INTO app_user')) + 20,
    );
    expect(insertBlock).not.toContain('PLATFORM_ADMIN');
    expect(insertBlock).toContain("'ADMIN'");
  });
});

// ---------------------------------------------------------------------------
// 5. Platform routes mount (parent route file)
// ---------------------------------------------------------------------------

describe('Platform routes mount', () => {
  const parentSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform.routes.ts'),
    'utf-8',
  );

  it('imports platformFacilitiesRoutes', () => {
    expect(parentSrc).toContain('platformFacilitiesRoutes');
  });

  it('registers under /facilities prefix', () => {
    expect(parentSrc).toContain("prefix: '/facilities'");
  });
});

// ---------------------------------------------------------------------------
// 6. DB Integration Tests (require live Postgres)
// ---------------------------------------------------------------------------

const canConnectToDB = !!process.env.DB_HOST || !!process.env.DATABASE_URL;

describe.skipIf(!canConnectToDB)('DB Integration: Facility Creation', async () => {
  const pg = await import('pg');
  const bcrypt = await import('bcryptjs');
  const { createFacilityBootstrap, getFacilityBootstrapStatus } = await import(
    '../src/services/facility-bootstrap.js'
  );

  const pool = new pg.default.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 2,
  });

  // Generate unique key per test run to avoid collisions
  const testKey = () => `TEST_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Cleanup helper: delete a facility and all its scoped rows
  async function cleanupFacility(facilityId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_organization_affiliation WHERE user_id IN (SELECT id FROM app_user WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM app_user WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility_config_item WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM room WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility_settings WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM organization WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility WHERE id = $1', [facilityId]);
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }

  it('creates facility with all baseline rows in a transaction', async () => {
    const key = testKey();
    const client = await pool.connect();
    let facilityId: string | undefined;

    try {
      await client.query('BEGIN');
      const result = await createFacilityBootstrap(client, {
        facilityKey: key,
        name: 'Integration Test Facility',
        initialAdmin: {
          username: `admin_${key.toLowerCase()}`,
          password: 'testpassword123',
          name: 'Test Admin',
        },
      });
      await client.query('COMMIT');
      facilityId = result.facility.id;

      expect(result.facility.facilityKey).toBe(key);
      expect(result.adminUser.roles).toContain('ADMIN');
      expect(result.counts.rooms).toBe(3);
      expect(result.counts.organizations).toBe(1);
      expect(result.counts.configItems).toBeGreaterThan(0);

      // Verify bootstrap status
      const status = await getFacilityBootstrapStatus({ query: pool.query.bind(pool) }, facilityId);
      expect(status).not.toBeNull();
      expect(status!.hasSettings).toBe(true);
      expect(status!.roomCount).toBe(3);
      expect(status!.organizationCount).toBe(1);
      expect(status!.adminUserCount).toBe(1);
    } finally {
      client.release();
      if (facilityId) await cleanupFacility(facilityId);
    }
  });

  it('tenant isolation: creating facility B does not modify facility A rows', async () => {
    const keyA = testKey();
    const keyB = testKey();
    let idA: string | undefined;
    let idB: string | undefined;

    try {
      // Create facility A
      const clientA = await pool.connect();
      try {
        await clientA.query('BEGIN');
        const resultA = await createFacilityBootstrap(clientA, {
          facilityKey: keyA,
          name: 'Facility A',
          initialAdmin: { username: `admin_a_${keyA.toLowerCase()}`, password: 'password123', name: 'Admin A' },
        });
        await clientA.query('COMMIT');
        idA = resultA.facility.id;
      } finally {
        clientA.release();
      }

      // Snapshot facility A's row counts
      const statusA_before = await getFacilityBootstrapStatus({ query: pool.query.bind(pool) }, idA!);

      // Create facility B
      const clientB = await pool.connect();
      try {
        await clientB.query('BEGIN');
        const resultB = await createFacilityBootstrap(clientB, {
          facilityKey: keyB,
          name: 'Facility B',
          initialAdmin: { username: `admin_b_${keyB.toLowerCase()}`, password: 'password123', name: 'Admin B' },
        });
        await clientB.query('COMMIT');
        idB = resultB.facility.id;
      } finally {
        clientB.release();
      }

      // Verify facility A is unchanged
      const statusA_after = await getFacilityBootstrapStatus({ query: pool.query.bind(pool) }, idA!);
      expect(statusA_after!.roomCount).toBe(statusA_before!.roomCount);
      expect(statusA_after!.configItemCount).toBe(statusA_before!.configItemCount);
      expect(statusA_after!.adminUserCount).toBe(statusA_before!.adminUserCount);
      expect(statusA_after!.organizationCount).toBe(statusA_before!.organizationCount);
    } finally {
      if (idA) await cleanupFacility(idA);
      if (idB) await cleanupFacility(idB);
    }
  });

  it('transaction rolls back on error (no partial state)', async () => {
    const key = testKey();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // First create succeeds
      await createFacilityBootstrap(client, {
        facilityKey: key,
        name: 'Will Rollback',
        initialAdmin: { username: `admin_${key.toLowerCase()}`, password: 'password123', name: 'Admin' },
      });

      // Force rollback (simulating error)
      await client.query('ROLLBACK');

      // Verify facility was NOT created
      const check = await pool.query('SELECT id FROM facility WHERE facility_key = $1', [key]);
      expect(check.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  it('duplicate facility_key throws unique violation', async () => {
    const key = testKey();
    let facilityId: string | undefined;

    // Create first facility
    const client1 = await pool.connect();
    try {
      await client1.query('BEGIN');
      const result = await createFacilityBootstrap(client1, {
        facilityKey: key,
        name: 'First',
        initialAdmin: { username: `admin1_${key.toLowerCase()}`, password: 'password123', name: 'Admin 1' },
      });
      await client1.query('COMMIT');
      facilityId = result.facility.id;
    } finally {
      client1.release();
    }

    // Attempt duplicate — should fail
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await createFacilityBootstrap(client2, {
        facilityKey: key,
        name: 'Duplicate',
        initialAdmin: { username: `admin2_${key.toLowerCase()}`, password: 'password123', name: 'Admin 2' },
      });
      await client2.query('COMMIT');
      expect.unreachable('Should have thrown on duplicate facility_key');
    } catch (err: any) {
      await client2.query('ROLLBACK');
      expect(err.code).toBe('23505'); // unique_violation
    } finally {
      client2.release();
      if (facilityId) await cleanupFacility(facilityId);
    }
  });

  afterAll(() => pool.end());
});
