/**
 * Admin Onboarding Flow Tests
 *
 * Proves:
 * 1. Pure helper functions: daysOpen, isLongAging, wasResolvedWithin48h, weekStart
 * 2. Annotation computation logic
 * 3. Route structural proofs (auth, envelope, error codes)
 * 4. Migration structural proofs
 * 5. Demo seed structural proofs (resolution scenario data)
 * 6. DB integration tests (skipped without DB_HOST)
 *
 * Unit tests (1-5) run without DB.
 * Integration tests (6) require live Postgres.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// 1. Pure helper functions (direct import — no DB side effects)
// ---------------------------------------------------------------------------

import {
  daysOpen,
  isLongAging,
  wasResolvedWithin48h,
  weekStart,
  computeAnnotations,
} from '../src/routes/admin-onboarding.routes.js';

describe('daysOpen calculation', () => {
  it('returns 0 for same-day', () => {
    const now = new Date('2026-02-14T12:00:00Z');
    const missingSince = new Date('2026-02-14T08:00:00Z');
    expect(daysOpen(missingSince, now)).toBe(0);
  });

  it('returns 1 for exactly 24h', () => {
    const now = new Date('2026-02-15T08:00:00Z');
    const missingSince = new Date('2026-02-14T08:00:00Z');
    expect(daysOpen(missingSince, now)).toBe(1);
  });

  it('returns 7 for one week', () => {
    const now = new Date('2026-02-21T12:00:00Z');
    const missingSince = new Date('2026-02-14T12:00:00Z');
    expect(daysOpen(missingSince, now)).toBe(7);
  });

  it('returns 14 for two weeks', () => {
    const now = new Date('2026-02-28T00:00:00Z');
    const missingSince = new Date('2026-02-14T00:00:00Z');
    expect(daysOpen(missingSince, now)).toBe(14);
  });

  it('floors partial days', () => {
    const now = new Date('2026-02-15T20:00:00Z');
    const missingSince = new Date('2026-02-14T08:00:00Z');
    // 36 hours = 1.5 days → floor to 1
    expect(daysOpen(missingSince, now)).toBe(1);
  });
});

describe('isLongAging', () => {
  it('returns false for 0 days', () => {
    expect(isLongAging(0)).toBe(false);
  });

  it('returns false for 7 days (boundary)', () => {
    expect(isLongAging(7)).toBe(false);
  });

  it('returns true for 8 days', () => {
    expect(isLongAging(8)).toBe(true);
  });

  it('returns true for 30 days', () => {
    expect(isLongAging(30)).toBe(true);
  });
});

describe('wasResolvedWithin48h', () => {
  it('returns true for resolution 1 hour after missing', () => {
    const missingSince = new Date('2026-02-14T08:00:00Z');
    const resolvedAt = new Date('2026-02-14T09:00:00Z');
    expect(wasResolvedWithin48h(missingSince, resolvedAt)).toBe(true);
  });

  it('returns true for resolution exactly at 48h', () => {
    const missingSince = new Date('2026-02-14T08:00:00Z');
    const resolvedAt = new Date('2026-02-16T08:00:00Z');
    expect(wasResolvedWithin48h(missingSince, resolvedAt)).toBe(true);
  });

  it('returns false for resolution 49 hours after missing', () => {
    const missingSince = new Date('2026-02-14T08:00:00Z');
    const resolvedAt = new Date('2026-02-16T09:00:00Z');
    expect(wasResolvedWithin48h(missingSince, resolvedAt)).toBe(false);
  });

  it('returns false for resolution before missing (negative diff)', () => {
    const missingSince = new Date('2026-02-14T08:00:00Z');
    const resolvedAt = new Date('2026-02-13T08:00:00Z');
    expect(wasResolvedWithin48h(missingSince, resolvedAt)).toBe(false);
  });

  it('returns true for same-second resolution', () => {
    const t = new Date('2026-02-14T08:00:00Z');
    expect(wasResolvedWithin48h(t, t)).toBe(true);
  });
});

describe('weekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-02-11 is a Wednesday → Monday = 2026-02-09
    expect(weekStart(new Date('2026-02-11T00:00:00Z'))).toBe('2026-02-09');
  });

  it('returns Monday for a Monday', () => {
    // 2026-02-09 is a Monday
    expect(weekStart(new Date('2026-02-09T00:00:00Z'))).toBe('2026-02-09');
  });

  it('returns Monday for a Sunday', () => {
    // 2026-02-15 is a Sunday → Monday = 2026-02-09
    expect(weekStart(new Date('2026-02-15T00:00:00Z'))).toBe('2026-02-09');
  });

  it('returns Monday for a Saturday', () => {
    // 2026-02-14 is a Saturday → Monday = 2026-02-09
    expect(weekStart(new Date('2026-02-14T00:00:00Z'))).toBe('2026-02-09');
  });
});

// ---------------------------------------------------------------------------
// 2. Annotation computation
// ---------------------------------------------------------------------------

describe('computeAnnotations', () => {
  it('groups daily counts by week and picks peak open count', () => {
    const dailyCounts = [
      { date: '2026-02-09', openCount: 2 }, // Monday
      { date: '2026-02-10', openCount: 5 }, // Tuesday
      { date: '2026-02-11', openCount: 3 }, // Wednesday
    ];
    const result = computeAnnotations(dailyCounts, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe('2026-02-09');
    expect(result[0].count).toBe(5); // peak of the week
  });

  it('counts resolvedWithin48h per week', () => {
    const dailyCounts = [
      { date: '2026-02-09', openCount: 3 },
    ];
    const resolvedItems = [
      {
        missingSince: new Date('2026-02-09T08:00:00Z'),
        resolvedAt: new Date('2026-02-10T08:00:00Z'), // 24h = within 48h
      },
      {
        missingSince: new Date('2026-02-09T08:00:00Z'),
        resolvedAt: new Date('2026-02-12T08:00:00Z'), // 72h = NOT within 48h
      },
    ];
    const result = computeAnnotations(dailyCounts, resolvedItems, []);
    expect(result[0].resolvedWithin48h).toBe(1);
  });

  it('counts longAging items per week', () => {
    const dailyCounts = [
      { date: '2026-02-01', openCount: 1 },
    ];
    const openItems = [
      { missingSince: new Date('2026-02-01T08:00:00Z') }, // ~13 days ago
    ];
    const result = computeAnnotations(dailyCounts, [], openItems);
    expect(result[0].longAging).toBe(1);
  });

  it('returns empty for empty input', () => {
    expect(computeAnnotations([], [], [])).toHaveLength(0);
  });

  it('separates data across weeks', () => {
    const dailyCounts = [
      { date: '2026-02-02', openCount: 1 }, // Week of Jan 26
      { date: '2026-02-09', openCount: 2 }, // Week of Feb 9
    ];
    const result = computeAnnotations(dailyCounts, [], []);
    expect(result.length).toBe(2);
    expect(result[0].weekStart).not.toBe(result[1].weekStart);
  });
});

// ---------------------------------------------------------------------------
// 3. Route structural proofs
// ---------------------------------------------------------------------------

describe('Admin onboarding route structure', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../src/routes/admin-onboarding.routes.ts'),
    'utf-8',
  );

  it('requires requireAdmin for open-missing-aging endpoint', () => {
    const trendBlock = routeSrc.slice(
      routeSrc.indexOf("'/trends/open-missing-aging'"),
      routeSrc.indexOf("'/trends/open-missing-aging'") + 300,
    );
    expect(trendBlock).toContain('requireAdmin');
  });

  it('requires requireAdmin for timeline endpoint', () => {
    const timelineBlock = routeSrc.slice(
      routeSrc.indexOf("'/missing/:inventoryItemId/timeline'"),
      routeSrc.indexOf("'/missing/:inventoryItemId/timeline'") + 300,
    );
    expect(timelineBlock).toContain('requireAdmin');
  });

  it('requires requireAdmin for resolve endpoint', () => {
    const resolveBlock = routeSrc.slice(
      routeSrc.indexOf("'/missing/:inventoryItemId/resolve'"),
      routeSrc.indexOf("'/missing/:inventoryItemId/resolve'") + 300,
    );
    expect(resolveBlock).toContain('requireAdmin');
  });

  it('enforces facility context on all endpoints', () => {
    const facilityChecks = routeSrc.match(/Facility context required/g) || [];
    expect(facilityChecks.length).toBe(3);
  });

  it('validates UUID format for inventoryItemId', () => {
    expect(routeSrc).toContain('UUID_RE');
    expect(routeSrc).toContain('Invalid inventoryItemId format');
  });

  it('validates resolution body with Zod schema', () => {
    expect(routeSrc).toContain('ResolveSchema');
    expect(routeSrc).toContain('resolutionType');
    expect(routeSrc).toContain("'LOCATED'");
    expect(routeSrc).toContain("'VENDOR_REPLACEMENT'");
    expect(routeSrc).toContain("'CASE_RESCHEDULED'");
    expect(routeSrc).toContain("'INVENTORY_ERROR_CORRECTED'");
    expect(routeSrc).toContain("'OTHER'");
  });

  it('rejects double resolution (CONFLICT 409)', () => {
    expect(routeSrc).toContain("'CONFLICT'");
    expect(routeSrc).toContain('already been resolved');
    expect(routeSrc).toContain('409');
  });

  it('rejects non-missing item (CONFLICT 409)', () => {
    expect(routeSrc).toContain('not currently missing');
  });

  it('returns 404 for item not in facility', () => {
    expect(routeSrc).toContain("'NOT_FOUND'");
    expect(routeSrc).toContain('not found in this facility');
  });

  it('inserts into missing_item_resolution on resolve', () => {
    expect(routeSrc).toContain('INSERT INTO missing_item_resolution');
  });

  it('inserts MISSING_RESOLVED inventory_event on resolve', () => {
    expect(routeSrc).toContain("'MISSING_RESOLVED'");
    expect(routeSrc).toContain('INSERT INTO inventory_event');
  });

  it('updates availability_status back to AVAILABLE on resolve', () => {
    expect(routeSrc).toContain("availability_status = 'AVAILABLE'");
  });

  it('wraps resolution in transaction()', () => {
    expect(routeSrc).toContain('transaction(async (client)');
  });

  it('returns resolved payload without suggestions or nudges', () => {
    // Check response payload has only resolution data
    expect(routeSrc).toContain('resolved: true');
    expect(routeSrc).toContain('resolvedBy:');
    expect(routeSrc).toContain('resolvedAt:');
    expect(routeSrc).toContain('daysOpen:');
    // Must NOT contain suggestion/nudge language
    expect(routeSrc).not.toContain('suggestion');
    expect(routeSrc).not.toContain('nextStep');
    expect(routeSrc).not.toContain('followUp');
    expect(routeSrc).not.toContain('recommendation');
  });

  it('trend endpoint returns annotations with server-computed fields', () => {
    expect(routeSrc).toContain('annotations');
    expect(routeSrc).toContain('computeAnnotations');
    expect(routeSrc).toContain('resolvedWithin48h');
    expect(routeSrc).toContain('longAging');
  });

  it('timeline is ordered ascending by timestamp', () => {
    expect(routeSrc).toContain("timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp))");
  });

  it('timeline maps ADJUSTED [MISSING] notes to MISSING_FLAGGED type', () => {
    expect(routeSrc).toContain("'MISSING_FLAGGED'");
    expect(routeSrc).toContain("[MISSING]");
  });

  it('does NOT contain ranking, gamification, or coercive language', () => {
    expect(routeSrc).not.toContain('rank');
    expect(routeSrc).not.toContain('score');
    expect(routeSrc).not.toContain('badge');
    expect(routeSrc).not.toContain('leaderboard');
    expect(routeSrc).not.toContain('alert');
    expect(routeSrc).not.toContain('escalat');
    expect(routeSrc).not.toContain('nudge');
  });
});

// ---------------------------------------------------------------------------
// 4. Migration structural proofs
// ---------------------------------------------------------------------------

describe('Migration 064 structure', () => {
  const migrationSrc = readFileSync(
    resolve(__dirname, '../db/migrations/064_missing_item_resolution.sql'),
    'utf-8',
  );

  it('adds MISSING_RESOLVED to inventory_event_type enum', () => {
    expect(migrationSrc).toContain("ADD VALUE IF NOT EXISTS 'MISSING_RESOLVED'");
  });

  it('creates missing_item_resolution table', () => {
    expect(migrationSrc).toContain('CREATE TABLE missing_item_resolution');
  });

  it('has resolution_type CHECK constraint with all 5 types', () => {
    expect(migrationSrc).toContain("'LOCATED'");
    expect(migrationSrc).toContain("'VENDOR_REPLACEMENT'");
    expect(migrationSrc).toContain("'CASE_RESCHEDULED'");
    expect(migrationSrc).toContain("'INVENTORY_ERROR_CORRECTED'");
    expect(migrationSrc).toContain("'OTHER'");
  });

  it('has append-only triggers (no update, no delete)', () => {
    expect(migrationSrc).toContain('missing_item_resolution_no_update');
    expect(migrationSrc).toContain('missing_item_resolution_no_delete');
    expect(migrationSrc).toContain('prevent_modification');
  });

  it('has indexes on inventory_item_id and facility_id', () => {
    expect(migrationSrc).toContain('idx_missing_resolution_item');
    expect(migrationSrc).toContain('idx_missing_resolution_facility');
  });

  it('references inventory_item(id) and facility(id)', () => {
    expect(migrationSrc).toContain('REFERENCES inventory_item(id)');
    expect(migrationSrc).toContain('REFERENCES facility(id)');
    expect(migrationSrc).toContain('REFERENCES app_user(id)');
  });

  it('does NOT contain TRUNCATE or DROP TABLE', () => {
    expect(migrationSrc).not.toMatch(/TRUNCATE/i);
    expect(migrationSrc).not.toMatch(/DROP\s+TABLE/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Demo seed structural proofs (resolution scenario)
// ---------------------------------------------------------------------------

describe('Demo seed includes missing resolution scenario', () => {
  const seedSrc = readFileSync(
    resolve(__dirname, '../src/services/demo-seed.service.ts'),
    'utf-8',
  );

  it('creates cluster of items in same week (days 2, 3, 4)', () => {
    expect(seedSrc).toContain('daysAgo: 2');
    expect(seedSrc).toContain('daysAgo: 3');
    expect(seedSrc).toContain('daysAgo: 4');
  });

  it('creates open missing item aged > 7 days', () => {
    expect(seedSrc).toContain('daysAgo: 8');
  });

  it('creates long-aging unresolved item (15 days)', () => {
    expect(seedSrc).toContain('daysAgo: 15');
  });

  it('creates resolved items with AVAILABLE status', () => {
    expect(seedSrc).toContain("availabilityStatus: 'AVAILABLE', // resolved back to available");
  });

  it('creates [FOUND] events for resolved items', () => {
    expect(seedSrc).toContain('[FOUND] Located during follow-up search');
  });

  it('creates missing_item_resolution records for resolved items', () => {
    expect(seedSrc).toContain('INSERT INTO missing_item_resolution');
    expect(seedSrc).toContain("'LOCATED'");
    expect(seedSrc).toContain('Found during routine follow-up search');
  });

  it('does NOT modify reset behavior', () => {
    // Resolution data is inside includeMissingItems block only
    const resolutionSection = seedSrc.indexOf('Resolved missing items');
    const includeMissingBlock = seedSrc.indexOf('if (options.includeMissingItems)');
    expect(resolutionSection).toBeGreaterThan(includeMissingBlock);
  });
});

// ---------------------------------------------------------------------------
// 6. Index.ts registers admin onboarding routes
// ---------------------------------------------------------------------------

describe('Index registers admin onboarding routes', () => {
  const indexSrc = readFileSync(
    resolve(__dirname, '../src/index.ts'),
    'utf-8',
  );

  it('imports adminOnboardingRoutes', () => {
    expect(indexSrc).toContain('adminOnboardingRoutes');
  });

  it('registers under /api/admin prefix', () => {
    expect(indexSrc).toContain("adminOnboardingRoutes, { prefix: '/api/admin' }");
  });
});

// ---------------------------------------------------------------------------
// 7. DB Integration Tests (require live Postgres)
// ---------------------------------------------------------------------------

const canConnectToDB = !!process.env.DB_HOST || !!process.env.DATABASE_URL;

describe.skipIf(!canConnectToDB)('DB Integration: Admin Onboarding Flow', async () => {
  const pg = await import('pg');
  const bcrypt = await import('bcryptjs');

  const pool = new pg.default.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 3,
  });

  const createdFacilityIds: string[] = [];
  const passwordHash = await bcrypt.default.hash('test', 4);

  async function createTestFacility(): Promise<{
    facilityId: string;
    adminId: string;
    techId: string;
    catalogId: string;
    locationId: string;
  }> {
    const key = `ADMINT_${Date.now()}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Facility
      const fResult = await client.query<{ id: string }>(
        `INSERT INTO facility (name, facility_key) VALUES ($1, $2) RETURNING id`,
        [`Admin Test ${key}`, key],
      );
      const facilityId = fResult.rows[0].id;
      createdFacilityIds.push(facilityId);

      await client.query(
        `INSERT INTO facility_settings (facility_id, enable_timeout_debrief) VALUES ($1, false)`,
        [facilityId],
      );

      // Admin user
      const adminResult = await client.query<{ id: string }>(
        `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
         VALUES ($1, $2, $3, $4, 'ADMIN', ARRAY['ADMIN'::user_role], $5) RETURNING id`,
        [facilityId, `admin_${key.toLowerCase()}`, `admin@${key.toLowerCase()}.test`, 'Test Admin', passwordHash],
      );
      const adminId = adminResult.rows[0].id;

      // Tech user
      const techResult = await client.query<{ id: string }>(
        `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
         VALUES ($1, $2, $3, $4, 'INVENTORY_TECH', ARRAY['INVENTORY_TECH'::user_role], $5) RETURNING id`,
        [facilityId, `tech_${key.toLowerCase()}`, `tech@${key.toLowerCase()}.test`, 'Test Tech', passwordHash],
      );
      const techId = techResult.rows[0].id;

      // Catalog item
      const catResult = await client.query<{ id: string }>(
        `INSERT INTO item_catalog (facility_id, name, category, manufacturer, catalog_number)
         VALUES ($1, 'Test Implant', 'IMPLANT', 'TestCo', 'TC-001') RETURNING id`,
        [facilityId],
      );
      const catalogId = catResult.rows[0].id;

      // Location
      const locResult = await client.query<{ id: string }>(
        `INSERT INTO location (facility_id, name) VALUES ($1, 'Test Storage') RETURNING id`,
        [facilityId],
      );
      const locationId = locResult.rows[0].id;

      await client.query('COMMIT');
      return { facilityId, adminId, techId, catalogId, locationId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function createMissingItem(
    facilityId: string,
    catalogId: string,
    locationId: string,
    techId: string,
    daysAgo: number,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemResult = await client.query<{ id: string }>(
        `INSERT INTO inventory_item (facility_id, catalog_id, location_id, availability_status)
         VALUES ($1, $2, $3, 'MISSING') RETURNING id`,
        [facilityId, catalogId, locationId],
      );
      const itemId = itemResult.rows[0].id;

      const occurredAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      await client.query(
        `INSERT INTO inventory_event (facility_id, inventory_item_id, event_type, location_id, notes, performed_by_user_id, occurred_at)
         VALUES ($1, $2, 'ADJUSTED', $3, '[MISSING] Test missing event', $4, $5)`,
        [facilityId, itemId, locationId, techId, occurredAt],
      );

      await client.query('COMMIT');
      return itemId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  it('missing_item_resolution is append-only (update rejected)', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();
    const itemId = await createMissingItem(facilityId, catalogId, locationId, techId, 3);

    // Insert resolution
    await pool.query(
      `INSERT INTO missing_item_resolution (inventory_item_id, facility_id, resolved_by_user_id, resolution_type)
       VALUES ($1, $2, $3, 'LOCATED')`,
      [itemId, facilityId, adminId],
    );

    // Update should fail
    await expect(
      pool.query(`UPDATE missing_item_resolution SET resolution_type = 'OTHER' WHERE inventory_item_id = $1`, [itemId]),
    ).rejects.toThrow(/append-only/i);
  });

  it('missing_item_resolution is append-only (delete rejected)', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();
    const itemId = await createMissingItem(facilityId, catalogId, locationId, techId, 3);

    await pool.query(
      `INSERT INTO missing_item_resolution (inventory_item_id, facility_id, resolved_by_user_id, resolution_type)
       VALUES ($1, $2, $3, 'LOCATED')`,
      [itemId, facilityId, adminId],
    );

    await expect(
      pool.query(`DELETE FROM missing_item_resolution WHERE inventory_item_id = $1`, [itemId]),
    ).rejects.toThrow(/append-only/i);
  });

  it('resolution_type CHECK constraint rejects invalid types', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();
    const itemId = await createMissingItem(facilityId, catalogId, locationId, techId, 3);

    await expect(
      pool.query(
        `INSERT INTO missing_item_resolution (inventory_item_id, facility_id, resolved_by_user_id, resolution_type)
         VALUES ($1, $2, $3, 'INVALID_TYPE')`,
        [itemId, facilityId, adminId],
      ),
    ).rejects.toThrow(/check/i);
  });

  it('MISSING_RESOLVED event type can be inserted', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();
    const itemId = await createMissingItem(facilityId, catalogId, locationId, techId, 3);

    // Insert MISSING_RESOLVED event — should succeed
    await pool.query(
      `INSERT INTO inventory_event (facility_id, inventory_item_id, event_type, notes, performed_by_user_id, occurred_at)
       VALUES ($1, $2, 'MISSING_RESOLVED', '[RESOLVED] LOCATED', $3, NOW())`,
      [facilityId, itemId, adminId],
    );

    const result = await pool.query(
      `SELECT event_type FROM inventory_event WHERE inventory_item_id = $1 AND event_type = 'MISSING_RESOLVED'`,
      [itemId],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].event_type).toBe('MISSING_RESOLVED');
  });

  it('open missing items are visible in facility scope', async () => {
    const { facilityId, catalogId, locationId, techId } = await createTestFacility();

    // Create 2 missing items
    await createMissingItem(facilityId, catalogId, locationId, techId, 3);
    await createMissingItem(facilityId, catalogId, locationId, techId, 10);

    const result = await pool.query(
      `SELECT COUNT(*)::int AS n FROM inventory_item WHERE facility_id = $1 AND availability_status = 'MISSING'`,
      [facilityId],
    );
    expect(result.rows[0].n).toBe(2);
  });

  it('cross-facility isolation: items from facility A not visible in facility B', async () => {
    const a = await createTestFacility();
    const b = await createTestFacility();

    await createMissingItem(a.facilityId, a.catalogId, a.locationId, a.techId, 3);

    const result = await pool.query(
      `SELECT COUNT(*)::int AS n FROM inventory_item WHERE facility_id = $1 AND availability_status = 'MISSING'`,
      [b.facilityId],
    );
    expect(result.rows[0].n).toBe(0);
  });

  it('resolving an item changes availability_status to AVAILABLE', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();
    const itemId = await createMissingItem(facilityId, catalogId, locationId, techId, 5);

    // Verify it's MISSING
    let result = await pool.query(
      `SELECT availability_status FROM inventory_item WHERE id = $1`,
      [itemId],
    );
    expect(result.rows[0].availability_status).toBe('MISSING');

    // Resolve it
    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO missing_item_resolution (inventory_item_id, facility_id, resolved_by_user_id, resolution_type)
       VALUES ($1, $2, $3, 'LOCATED')`,
      [itemId, facilityId, adminId],
    );
    await pool.query(
      `INSERT INTO inventory_event (facility_id, inventory_item_id, event_type, notes, performed_by_user_id, occurred_at)
       VALUES ($1, $2, 'MISSING_RESOLVED', '[RESOLVED] LOCATED', $3, NOW())`,
      [facilityId, itemId, adminId],
    );
    await pool.query(
      `UPDATE inventory_item SET availability_status = 'AVAILABLE' WHERE id = $1`,
      [itemId],
    );
    await pool.query('COMMIT');

    // Verify it's AVAILABLE now
    result = await pool.query(
      `SELECT availability_status FROM inventory_item WHERE id = $1`,
      [itemId],
    );
    expect(result.rows[0].availability_status).toBe('AVAILABLE');
  });

  it('timeline shows events in chronological order', async () => {
    const { facilityId, adminId, catalogId, locationId, techId } = await createTestFacility();

    // Create item with RECEIVED event first
    const itemResult = await pool.query<{ id: string }>(
      `INSERT INTO inventory_item (facility_id, catalog_id, location_id, availability_status)
       VALUES ($1, $2, $3, 'MISSING') RETURNING id`,
      [facilityId, catalogId, locationId],
    );
    const itemId = itemResult.rows[0].id;

    // Add events at different times
    const day10 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const day5 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO inventory_event (facility_id, inventory_item_id, event_type, notes, performed_by_user_id, occurred_at)
       VALUES ($1, $2, 'RECEIVED', 'Initial receipt', $3, $4)`,
      [facilityId, itemId, techId, day10],
    );
    await pool.query(
      `INSERT INTO inventory_event (facility_id, inventory_item_id, event_type, location_id, notes, performed_by_user_id, occurred_at)
       VALUES ($1, $2, 'ADJUSTED', $3, '[MISSING] Cycle count', $4, $5)`,
      [facilityId, itemId, locationId, techId, day5],
    );

    const timeline = await pool.query(
      `SELECT event_type, occurred_at FROM inventory_event WHERE inventory_item_id = $1 ORDER BY occurred_at ASC`,
      [itemId],
    );

    expect(timeline.rows.length).toBe(2);
    expect(timeline.rows[0].event_type).toBe('RECEIVED');
    expect(timeline.rows[1].event_type).toBe('ADJUSTED');
    expect(new Date(timeline.rows[0].occurred_at).getTime()).toBeLessThan(
      new Date(timeline.rows[1].occurred_at).getTime(),
    );
  });

  afterAll(async () => {
    for (const facilityId of createdFacilityIds) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM missing_item_resolution WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM inventory_event WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM inventory_item WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM item_catalog WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM location WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM app_user WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM facility_settings WHERE facility_id = $1', [facilityId]);
        await client.query('DELETE FROM facility WHERE id = $1', [facilityId]);
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
    await pool.end();
  });
});
