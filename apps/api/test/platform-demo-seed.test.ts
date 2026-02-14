/**
 * Platform Demo Seed Tests
 *
 * Proves:
 * 1. Zod schema validation (defaults, boundaries, rejections)
 * 2. Route structural proofs (auth, transaction, error handling)
 * 3. Service structural proofs (no TRUNCATE, facility_id scoping, demo- prefix)
 * 4. DB Integration (full seed, idempotency, tenant isolation, risk triggers)
 *
 * Unit tests (1-3) run without DB.
 * Integration tests (4) require live Postgres (skipped when DB_HOST unset).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Schema (mirrored from route for validation testing)
// ---------------------------------------------------------------------------

const DemoSeedSchema = z.object({
  profile: z.literal('ORTHO_ASC_EXEC_DEMO').default('ORTHO_ASC_EXEC_DEMO'),
  options: z.object({
    surgeonCount: z.number().int().min(2).max(6).default(4),
    caseCount: z.number().int().min(6).max(60).default(40),
    inventoryScale: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']).default('MEDIUM'),
    includeFinancialOverrides: z.boolean().default(true),
    includeMissingItems: z.boolean().default(true),
  }).default({}),
});

// ---------------------------------------------------------------------------
// 1. Schema Validation
// ---------------------------------------------------------------------------

describe('DemoSeed schema validation', () => {
  it('accepts empty body (all defaults)', () => {
    const result = DemoSeedSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profile).toBe('ORTHO_ASC_EXEC_DEMO');
      expect(result.data.options.surgeonCount).toBe(4);
      expect(result.data.options.caseCount).toBe(40);
      expect(result.data.options.inventoryScale).toBe('MEDIUM');
      expect(result.data.options.includeFinancialOverrides).toBe(true);
      expect(result.data.options.includeMissingItems).toBe(true);
    }
  });

  it('accepts fully specified body', () => {
    const result = DemoSeedSchema.safeParse({
      profile: 'ORTHO_ASC_EXEC_DEMO',
      options: {
        surgeonCount: 3,
        caseCount: 20,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: false,
        includeMissingItems: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid profile', () => {
    const result = DemoSeedSchema.safeParse({ profile: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('rejects surgeonCount below minimum (2)', () => {
    const result = DemoSeedSchema.safeParse({ options: { surgeonCount: 1 } });
    expect(result.success).toBe(false);
  });

  it('rejects surgeonCount above maximum (6)', () => {
    const result = DemoSeedSchema.safeParse({ options: { surgeonCount: 7 } });
    expect(result.success).toBe(false);
  });

  it('rejects caseCount below minimum (6)', () => {
    const result = DemoSeedSchema.safeParse({ options: { caseCount: 5 } });
    expect(result.success).toBe(false);
  });

  it('rejects invalid inventoryScale', () => {
    const result = DemoSeedSchema.safeParse({ options: { inventoryScale: 'HUGE' } });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer surgeonCount', () => {
    const result = DemoSeedSchema.safeParse({ options: { surgeonCount: 2.5 } });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Route Structural Proofs
// ---------------------------------------------------------------------------

describe('Platform demo seed route structure', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform-demo-seed.routes.ts'),
    'utf-8',
  );

  it('requires requirePlatformAdmin() in preHandler', () => {
    const postIdx = routeSrc.indexOf("'/:facilityId/demo-seed'");
    expect(postIdx).toBeGreaterThan(-1);
    const preHandlerBlock = routeSrc.slice(postIdx, postIdx + 300);
    expect(preHandlerBlock).toContain('requirePlatformAdmin()');
  });

  it('wraps seed in transaction() for atomicity', () => {
    expect(routeSrc).toContain('transaction(async (client)');
    expect(routeSrc).toContain('executeDemoSeed(client');
  });

  it('validates UUID format for facilityId', () => {
    expect(routeSrc).toContain('UUID_RE');
  });

  it('returns 201 on success', () => {
    expect(routeSrc).toContain('ok(reply, result, 201)');
  });

  it('returns 409 on duplicate (already seeded)', () => {
    expect(routeSrc).toContain("'CONFLICT'");
    expect(routeSrc).toContain('409');
  });

  it('returns 404 for missing facility', () => {
    expect(routeSrc).toContain("'NOT_FOUND'");
    expect(routeSrc).toContain('404');
  });

  it('checks facility existence before transaction', () => {
    const facilityCheckIdx = routeSrc.indexOf('SELECT id, name FROM facility');
    const transactionIdx = routeSrc.indexOf('transaction(async');
    expect(facilityCheckIdx).toBeGreaterThan(-1);
    expect(transactionIdx).toBeGreaterThan(facilityCheckIdx);
  });
});

// ---------------------------------------------------------------------------
// 3. Service Structural Proofs
// ---------------------------------------------------------------------------

describe('Demo seed service structure', () => {
  const serviceSrc = readFileSync(
    resolve(__dirname, '../src/services/demo-seed.service.ts'),
    'utf-8',
  );

  it('does NOT contain TRUNCATE SQL statement', () => {
    // Match actual TRUNCATE statements (not doc comments)
    expect(serviceSrc).not.toMatch(/`[^`]*TRUNCATE[^`]*`/i);
    expect(serviceSrc).not.toMatch(/'\s*TRUNCATE/i);
  });

  it('does NOT contain DELETE FROM', () => {
    expect(serviceSrc).not.toMatch(/DELETE\s+FROM/i);
  });

  it('does NOT contain DROP TABLE', () => {
    expect(serviceSrc).not.toMatch(/DROP\s+TABLE/i);
  });

  it('all INSERT statements reference facility_id', () => {
    // Every INSERT INTO should include facility_id in the column list
    // Exceptions: tables that don't have facility_id (e.g., preference_card_version, case_requirement)
    const insertStatements = serviceSrc.match(/INSERT INTO (\w+)/g) || [];
    const tablesWithoutFacilityId = [
      'preference_card_version',
      'case_requirement',
      'surgical_case_status_event',
      'case_checklist_response',
      'case_checklist_signature',
      'attestation', // has facility_id but let's check
      'user_organization_affiliation',
    ];

    // Verify that key tables with facility_id DO include it
    const tablesRequiringFacilityId = [
      'app_user',
      'inventory_item',
      'inventory_event',
      'surgical_case',
      'preference_card',
      'item_catalog',
      'vendor',
      'location',
      'case_event_log',
      'case_anesthesia_plan',
      'case_readiness_cache',
      'case_checklist_instance',
    ];

    for (const table of tablesRequiringFacilityId) {
      const tableInsertIdx = serviceSrc.indexOf(`INSERT INTO ${table}`);
      if (tableInsertIdx === -1) continue;
      const block = serviceSrc.slice(tableInsertIdx, tableInsertIdx + 500);
      expect(block).toContain('facility_id');
    }
  });

  it('uses demo- prefix for all created usernames', () => {
    // Find all username string literals that will be inserted
    const usernameLiterals = serviceSrc.match(/username: '([^']+)'/g) || [];
    for (const lit of usernameLiterals) {
      const username = lit.match(/username: '([^']+)'/)?.[1];
      if (username) {
        expect(username).toMatch(/^demo-/);
      }
    }
  });

  it('uses generate_case_number() for case numbers', () => {
    expect(serviceSrc).toContain('generate_case_number');
  });

  it('creates inventory events for MISSING items with [MISSING] tag', () => {
    expect(serviceSrc).toContain('[MISSING]');
  });

  it('creates EXPIRED inventory items for risk queue', () => {
    expect(serviceSrc).toContain("'EXPIRED'");
  });

  it('creates items with null lot_number for MISSING_LOT alarm', () => {
    expect(serviceSrc).toContain('intentionally null to trigger MISSING_LOT');
  });

  it('creates items with null serial_number for MISSING_SERIAL alarm', () => {
    expect(serviceSrc).toContain('intentionally null to trigger MISSING_SERIAL');
  });

  it('includes financial override events with proper constraints', () => {
    expect(serviceSrc).toContain('NEGOTIATED_DISCOUNT');
    expect(serviceSrc).toContain('VENDOR_SAMPLE');
    expect(serviceSrc).toContain('VENDOR_CONCESSION');
    expect(serviceSrc).toContain('is_gratis');
    expect(serviceSrc).toContain('gratis_reason');
  });

  it('checks for prior demo users (idempotency)', () => {
    expect(serviceSrc).toContain("LIKE 'demo-%'");
    expect(serviceSrc).toContain('already applied');
  });

  it('creates checklist instances for completed cases', () => {
    expect(serviceSrc).toContain('case_checklist_instance');
    expect(serviceSrc).toContain('case_checklist_response');
    expect(serviceSrc).toContain('case_checklist_signature');
  });

  it('populates case_readiness_cache for scheduled cases', () => {
    expect(serviceSrc).toContain('INSERT INTO case_readiness_cache');
  });

  it('creates attestation rows for green cases', () => {
    expect(serviceSrc).toContain('CASE_READINESS');
    expect(serviceSrc).toContain('SURGEON_ACKNOWLEDGMENT');
  });
});

// ---------------------------------------------------------------------------
// 4. Parent route mounts demo seed
// ---------------------------------------------------------------------------

describe('Platform routes mount demo seed', () => {
  const parentSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform.routes.ts'),
    'utf-8',
  );

  it('imports platformDemoSeedRoutes', () => {
    expect(parentSrc).toContain('platformDemoSeedRoutes');
  });

  it('registers demo seed under /facilities prefix', () => {
    expect(parentSrc).toContain('platformDemoSeedRoutes');
    expect(parentSrc).toContain("prefix: '/facilities'");
  });
});

// ---------------------------------------------------------------------------
// 5. DB Integration Tests (require live Postgres)
// ---------------------------------------------------------------------------

const canConnectToDB = !!process.env.DB_HOST || !!process.env.DATABASE_URL;

describe.skipIf(!canConnectToDB)('DB Integration: Demo Seed', async () => {
  const pg = await import('pg');
  const { createFacilityBootstrap } = await import('../src/services/facility-bootstrap.js');
  const { executeDemoSeed } = await import('../src/services/demo-seed.service.js');

  const pool = new pg.default.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 3,
  });

  const testKey = () => `DEMOT_${Date.now()}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const createdFacilityIds: string[] = [];

  // Bootstrap a fresh facility for testing
  async function bootstrapTestFacility(): Promise<string> {
    const key = testKey();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await createFacilityBootstrap(client, {
        facilityKey: key,
        name: `Demo Test ${key}`,
        initialAdmin: {
          username: `admin_${key.toLowerCase()}`,
          password: 'testpassword123',
          name: 'Test Admin',
        },
      });
      await client.query('COMMIT');
      createdFacilityIds.push(result.facility.id);
      return result.facility.id;
    } finally {
      client.release();
    }
  }

  // Cleanup helper
  async function cleanupFacility(facilityId: string) {
    const client = await pool.connect();
    try {
      // Use CASCADE on facility delete
      await client.query('BEGIN');
      // Reverse FK order cleanup
      await client.query('DELETE FROM case_checklist_signature WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM case_checklist_response WHERE instance_id IN (SELECT id FROM case_checklist_instance WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM case_checklist_instance WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM attestation WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM case_readiness_cache WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM case_anesthesia_plan WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM case_event_log WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM surgical_case_status_event WHERE surgical_case_id IN (SELECT id FROM surgical_case WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM case_requirement WHERE case_id IN (SELECT id FROM surgical_case WHERE facility_id = $1)', [facilityId]);
      await client.query('UPDATE inventory_item SET reserved_for_case_id = NULL WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM surgical_case WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM case_number_sequence WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM preference_card_version WHERE preference_card_id IN (SELECT id FROM preference_card WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM preference_card WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM inventory_event WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM inventory_item WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM item_catalog WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM loaner_set WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM vendor WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM location WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM checklist_template_version WHERE template_id IN (SELECT id FROM checklist_template WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM checklist_template WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM user_organization_affiliation WHERE user_id IN (SELECT id FROM app_user WHERE facility_id = $1)', [facilityId]);
      await client.query('DELETE FROM app_user WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility_settings WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility_config_item WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM room WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM organization WHERE facility_id = $1', [facilityId]);
      await client.query('DELETE FROM facility WHERE id = $1', [facilityId]);
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }

  it('full seed creates expected row counts', async () => {
    const facilityId = await bootstrapTestFacility();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await executeDemoSeed(client, facilityId, {
        surgeonCount: 4,
        caseCount: 40,
        inventoryScale: 'MEDIUM',
        includeFinancialOverrides: true,
        includeMissingItems: true,
      });
      await client.query('COMMIT');

      // Verify summary counts
      expect(result.summary.usersCreated).toBeGreaterThanOrEqual(9);
      expect(result.summary.vendorsCreated).toBe(5);
      expect(result.summary.catalogItemsCreated).toBeGreaterThanOrEqual(20);
      expect(result.summary.inventoryItemsCreated).toBeGreaterThanOrEqual(40);
      expect(result.summary.casesCreated).toBeGreaterThanOrEqual(20);
      expect(result.summary.preferenceCardsCreated).toBeGreaterThanOrEqual(4);
      expect(result.summary.locationsCreated).toBe(5);

      // Verify actual row counts in DB
      const userCount = await client.query(
        `SELECT count(*)::int AS n FROM app_user WHERE facility_id = $1 AND username LIKE 'demo-%'`,
        [facilityId],
      );
      expect(userCount.rows[0].n).toBe(result.summary.usersCreated);

      const caseCount = await client.query(
        `SELECT count(*)::int AS n FROM surgical_case WHERE facility_id = $1`,
        [facilityId],
      );
      // Cases include bootstrap admin's cases + demo cases
      expect(caseCount.rows[0].n).toBeGreaterThanOrEqual(result.summary.casesCreated);
    } finally {
      client.release();
    }
  }, 30000);

  it('second run returns conflict (idempotency)', async () => {
    const facilityId = await bootstrapTestFacility();
    const client = await pool.connect();

    try {
      // First run
      await client.query('BEGIN');
      await executeDemoSeed(client, facilityId, {
        surgeonCount: 2,
        caseCount: 6,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: false,
        includeMissingItems: false,
      });
      await client.query('COMMIT');

      // Second run should fail
      await client.query('BEGIN');
      await expect(
        executeDemoSeed(client, facilityId, {
          surgeonCount: 2,
          caseCount: 6,
          inventoryScale: 'LIGHT',
          includeFinancialOverrides: false,
          includeMissingItems: false,
        }),
      ).rejects.toThrow(/already applied/i);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }, 30000);

  it('tenant isolation: seeding facility A does not affect facility B', async () => {
    const facilityIdA = await bootstrapTestFacility();
    const facilityIdB = await bootstrapTestFacility();

    // Seed facility A
    const clientA = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await executeDemoSeed(clientA, facilityIdA, {
        surgeonCount: 2,
        caseCount: 6,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: false,
        includeMissingItems: false,
      });
      await clientA.query('COMMIT');
    } finally {
      clientA.release();
    }

    // Verify facility B has NO demo users
    const check = await pool.query(
      `SELECT count(*)::int AS n FROM app_user WHERE facility_id = $1 AND username LIKE 'demo-%'`,
      [facilityIdB],
    );
    expect(check.rows[0].n).toBe(0);

    // Verify facility B has NO demo inventory
    const invCheck = await pool.query(
      `SELECT count(*)::int AS n FROM inventory_item WHERE facility_id = $1`,
      [facilityIdB],
    );
    expect(invCheck.rows[0].n).toBe(0);
  }, 30000);

  it('risk queue data is present after seed', async () => {
    const facilityId = await bootstrapTestFacility();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await executeDemoSeed(client, facilityId, {
        surgeonCount: 2,
        caseCount: 6,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: false,
        includeMissingItems: true,
      });
      await client.query('COMMIT');

      // Check for EXPIRED items
      const expired = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_item i
         JOIN item_catalog c ON c.id = i.catalog_id
         WHERE i.facility_id = $1
           AND (i.sterility_status = 'EXPIRED' OR i.sterility_expires_at <= NOW())`,
        [facilityId],
      );
      expect(expired.rows[0].n).toBeGreaterThanOrEqual(2);

      // Check for MISSING_LOT items
      const missingLot = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_item i
         JOIN item_catalog c ON c.id = i.catalog_id
         WHERE i.facility_id = $1
           AND c.requires_lot_tracking = true
           AND i.lot_number IS NULL`,
        [facilityId],
      );
      expect(missingLot.rows[0].n).toBeGreaterThanOrEqual(3);

      // Check for MISSING items (missing analytics)
      const missing = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_item
         WHERE facility_id = $1 AND availability_status = 'MISSING'`,
        [facilityId],
      );
      expect(missing.rows[0].n).toBeGreaterThanOrEqual(3);
    } finally {
      client.release();
    }
  }, 30000);

  it('readiness cache has GREEN/ORANGE/RED distribution', async () => {
    const facilityId = await bootstrapTestFacility();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await executeDemoSeed(client, facilityId, {
        surgeonCount: 4,
        caseCount: 30,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: false,
        includeMissingItems: false,
      });
      await client.query('COMMIT');

      const readiness = await pool.query(
        `SELECT readiness_state, count(*)::int AS n
         FROM case_readiness_cache
         WHERE facility_id = $1
         GROUP BY readiness_state`,
        [facilityId],
      );

      const states = Object.fromEntries(readiness.rows.map(r => [r.readiness_state, r.n]));
      expect(states['GREEN']).toBeGreaterThanOrEqual(1);
      expect(states['ORANGE']).toBeGreaterThanOrEqual(1);
      expect(states['RED']).toBeGreaterThanOrEqual(1);
    } finally {
      client.release();
    }
  }, 30000);

  it('financial attribution constraints satisfied', async () => {
    const facilityId = await bootstrapTestFacility();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await executeDemoSeed(client, facilityId, {
        surgeonCount: 2,
        caseCount: 6,
        inventoryScale: 'LIGHT',
        includeFinancialOverrides: true,
        includeMissingItems: false,
      });
      await client.query('COMMIT');

      // Verify no orphaned overrides (cost_override_cents without reason)
      const orphanOverrides = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_event
         WHERE facility_id = $1
           AND cost_override_cents IS NOT NULL
           AND cost_override_reason IS NULL`,
        [facilityId],
      );
      expect(orphanOverrides.rows[0].n).toBe(0);

      // Verify no orphaned gratis (is_gratis without reason)
      const orphanGratis = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_event
         WHERE facility_id = $1
           AND is_gratis = true
           AND gratis_reason IS NULL`,
        [facilityId],
      );
      expect(orphanGratis.rows[0].n).toBe(0);

      // Verify at least one financial event exists
      const financialEvents = await pool.query(
        `SELECT count(*)::int AS n FROM inventory_event
         WHERE facility_id = $1
           AND (cost_snapshot_cents IS NOT NULL OR cost_override_cents IS NOT NULL OR is_gratis = true)`,
        [facilityId],
      );
      expect(financialEvents.rows[0].n).toBeGreaterThanOrEqual(3);
    } finally {
      client.release();
    }
  }, 30000);

  afterAll(async () => {
    // Cleanup all test facilities
    for (const id of createdFacilityIds) {
      await cleanupFacility(id);
    }
    await pool.end();
  });
});
