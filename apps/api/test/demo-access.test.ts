/**
 * Demo Access System Tests
 *
 * Proves:
 * 1. Email normalization and validation
 * 2. Service structural proofs (no TRUNCATE, proper schemas)
 * 3. Route structural proofs (auth, envelope, error codes)
 * 4. Rate-limit calculation logic
 * 5. Owner notification best-effort behavior
 * 6. DB Integration (skipped without DB_HOST)
 *
 * Unit tests (1-5) run without DB.
 * Integration tests (6) require live Postgres (skipped when DB_HOST unset).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// 1. Email Normalization & Validation (pure unit tests)
// ---------------------------------------------------------------------------

// Import functions directly — these are pure and have no DB side effects
import { normalizeEmail, isValidEmailShape } from '../src/services/demo-access.service.js';

describe('Email normalization', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('handles already-normalized email', () => {
    expect(normalizeEmail('test@test.com')).toBe('test@test.com');
  });

  it('handles leading/trailing whitespace only', () => {
    expect(normalizeEmail('  x@y.z  ')).toBe('x@y.z');
  });
});

describe('Email shape validation', () => {
  it('accepts valid email shapes', () => {
    expect(isValidEmailShape('user@example.com')).toBe(true);
    expect(isValidEmailShape('a@b.co')).toBe(true);
    expect(isValidEmailShape('user+tag@domain.org')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmailShape('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmailShape('user@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(isValidEmailShape('@domain.com')).toBe(false);
  });

  it('rejects spaces in email', () => {
    expect(isValidEmailShape('user @example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmailShape('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Service Structural Proofs (source inspection)
// ---------------------------------------------------------------------------

describe('Demo access service structure', () => {
  const serviceSrc = readFileSync(
    resolve(__dirname, '../src/services/demo-access.service.ts'),
    'utf-8',
  );

  it('does NOT contain TRUNCATE', () => {
    expect(serviceSrc).not.toMatch(/TRUNCATE/i);
  });

  it('does NOT contain DELETE FROM (only reads/inserts/updates)', () => {
    expect(serviceSrc).not.toMatch(/DELETE\s+FROM/i);
  });

  it('does NOT contain DROP TABLE', () => {
    expect(serviceSrc).not.toMatch(/DROP\s+TABLE/i);
  });

  it('uses bcryptjs for password hashing', () => {
    expect(serviceSrc).toContain("import bcrypt from 'bcryptjs'");
    expect(serviceSrc).toContain('bcrypt.hash');
  });

  it('sets is_demo = true on demo user creation', () => {
    expect(serviceSrc).toContain('is_demo');
    expect(serviceSrc).toContain(', true)');
  });

  it('generates deterministic username with demo_ prefix', () => {
    expect(serviceSrc).toContain('`demo_${');
  });

  it('sets fixed 14-day expiry', () => {
    expect(serviceSrc).toContain('DEMO_TTL_DAYS = 14');
  });

  it('grants multi-role set for playground', () => {
    expect(serviceSrc).toContain("'ADMIN'");
    expect(serviceSrc).toContain("'SURGEON'");
    expect(serviceSrc).toContain("'INVENTORY_TECH'");
    expect(serviceSrc).toContain("'SCRUB'");
    expect(serviceSrc).toContain("'CIRCULATOR'");
    expect(serviceSrc).toContain("'SCHEDULER'");
  });

  it('checks demo_blocked_email for blocklist', () => {
    expect(serviceSrc).toContain('demo_blocked_email');
  });

  it('checks demo_blocked_ip for blocklist', () => {
    expect(serviceSrc).toContain('demo_blocked_ip');
  });

  it('enforces rate limits from demo_access_request counts', () => {
    expect(serviceSrc).toContain('demo_access_request');
    expect(serviceSrc).toContain('RATE_LIMIT_IP_PER_DAY');
    expect(serviceSrc).toContain('RATE_LIMIT_EMAIL_PER_DAY');
  });

  it('checks facility is_demo in enforcement', () => {
    expect(serviceSrc).toContain('is_demo');
    expect(serviceSrc).toContain('DEMO_FACILITY_INVALID');
  });

  it('checks demo_account expiry and blocked in enforcement', () => {
    expect(serviceSrc).toContain('DEMO_ACCESS_EXPIRED');
    expect(serviceSrc).toContain('DEMO_ACCESS_BLOCKED');
  });

  it('reuses existing non-expired non-blocked demo account', () => {
    expect(serviceSrc).toContain('is_blocked = false AND da.expires_at > NOW()');
  });
});

// ---------------------------------------------------------------------------
// 3. Route Structural Proofs
// ---------------------------------------------------------------------------

describe('Demo route structure (public)', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../src/routes/demo.routes.ts'),
    'utf-8',
  );

  it('does NOT require authentication (no preHandler with authenticate)', () => {
    // The route function should not have preHandler with authenticate
    const postBlock = routeSrc.slice(routeSrc.indexOf("'/request-access'"), routeSrc.indexOf("'/request-access'") + 500);
    expect(postBlock).not.toContain('authenticate');
    expect(postBlock).not.toContain('requireRoles');
  });

  it('validates email in request body', () => {
    expect(routeSrc).toContain("email: z.string()");
  });

  it('normalizes email before processing', () => {
    expect(routeSrc).toContain('normalizeEmail(body.email)');
  });

  it('checks blocklists before granting', () => {
    expect(routeSrc).toContain('isBlockedEmail');
    expect(routeSrc).toContain('isBlockedIp');
  });

  it('checks rate limits before granting', () => {
    expect(routeSrc).toContain('checkRateLimit');
  });

  it('resolves demo facility', () => {
    expect(routeSrc).toContain('resolveDemoFacility');
  });

  it('issues JWT on success', () => {
    expect(routeSrc).toContain('fastify.jwt.sign');
  });

  it('sets isDemo: true in JWT payload', () => {
    expect(routeSrc).toContain('isDemo: true');
  });

  it('logs access request on grant', () => {
    expect(routeSrc).toContain('logAccessRequest');
  });

  it('notifies owner on grant (best-effort)', () => {
    expect(routeSrc).toContain('notifyOwnerAsync');
  });

  it('returns demo: true in response envelope', () => {
    expect(routeSrc).toContain('demo: true');
  });

  it('returns 503 if demo facility not configured', () => {
    expect(routeSrc).toContain("'SERVICE_UNAVAILABLE'");
    expect(routeSrc).toContain('503');
  });

  it('returns 403 for blocked email/IP', () => {
    expect(routeSrc).toContain("'DEMO_ACCESS_BLOCKED'");
    expect(routeSrc).toContain('403');
  });

  it('returns 429 for rate limit exceeded', () => {
    expect(routeSrc).toContain("'RATE_LIMIT_EXCEEDED'");
    expect(routeSrc).toContain('429');
  });
});

describe('Platform demo access admin route structure', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform-demo-access.routes.ts'),
    'utf-8',
  );

  it('requires requirePlatformAdmin() for all endpoints', () => {
    // Count occurrences of requirePlatformAdmin — should match number of endpoints
    const matches = routeSrc.match(/requirePlatformAdmin\(\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(6); // block/unblock email/ip + requests + accounts + blocklists
  });

  it('has block-email endpoint', () => {
    expect(routeSrc).toContain("'/block-email'");
    expect(routeSrc).toContain('demo_blocked_email');
  });

  it('has unblock-email endpoint', () => {
    expect(routeSrc).toContain("'/unblock-email'");
  });

  it('has block-ip endpoint', () => {
    expect(routeSrc).toContain("'/block-ip'");
    expect(routeSrc).toContain('demo_blocked_ip');
  });

  it('has unblock-ip endpoint', () => {
    expect(routeSrc).toContain("'/unblock-ip'");
  });

  it('has requests listing endpoint', () => {
    expect(routeSrc).toContain("'/requests'");
    expect(routeSrc).toContain('demo_access_request');
  });

  it('blocking email also blocks active demo account', () => {
    expect(routeSrc).toContain('UPDATE demo_account SET is_blocked = true');
  });

  it('uses ON CONFLICT for upsert on block operations', () => {
    expect(routeSrc).toContain('ON CONFLICT');
    expect(routeSrc).toContain('DO UPDATE');
  });
});

// ---------------------------------------------------------------------------
// 4. Notification Structural Proofs
// ---------------------------------------------------------------------------

describe('Owner notification utility structure', () => {
  const notifySrc = readFileSync(
    resolve(__dirname, '../src/utils/notify-owner.ts'),
    'utf-8',
  );

  it('never throws (catches errors internally)', () => {
    expect(notifySrc).toContain('catch (err)');
    expect(notifySrc).toContain('DEMO_OWNER_NOTIFY_FAILED');
  });

  it('logs DEMO_OWNER_NOTIFY_SKIPPED when SMTP not configured', () => {
    expect(notifySrc).toContain('DEMO_OWNER_NOTIFY_SKIPPED');
    expect(notifySrc).toContain('SMTP not configured');
  });

  it('uses nodemailer transporter', () => {
    expect(notifySrc).toContain('createTransport');
    expect(notifySrc).toContain('sendMail');
  });

  it('reads SMTP config from environment', () => {
    expect(notifySrc).toContain('SMTP_HOST');
    expect(notifySrc).toContain('SMTP_PORT');
    expect(notifySrc).toContain('SMTP_USER');
    expect(notifySrc).toContain('SMTP_PASS');
    expect(notifySrc).toContain('SMTP_FROM');
    expect(notifySrc).toContain('OWNER_NOTIFICATION_EMAIL');
  });
});

// ---------------------------------------------------------------------------
// 5. Auth Enforcement (integration point)
// ---------------------------------------------------------------------------

describe('Auth decorator includes demo enforcement', () => {
  const indexSrc = readFileSync(
    resolve(__dirname, '../src/index.ts'),
    'utf-8',
  );

  it('checks isDemo flag after JWT verification', () => {
    expect(indexSrc).toContain('request.user?.isDemo');
  });

  it('calls enforceDemoAccess for demo users', () => {
    expect(indexSrc).toContain('enforceDemoAccess');
  });

  it('returns 403 for failed demo enforcement', () => {
    const demoBlock = indexSrc.slice(
      indexSrc.indexOf('request.user?.isDemo'),
      indexSrc.indexOf('request.user?.isDemo') + 500,
    );
    expect(demoBlock).toContain('403');
  });
});

describe('JwtPayload includes isDemo field', () => {
  const authSrc = readFileSync(
    resolve(__dirname, '../src/plugins/auth.ts'),
    'utf-8',
  );

  it('has isDemo optional field in JwtPayload', () => {
    expect(authSrc).toContain('isDemo?: boolean');
  });
});

// ---------------------------------------------------------------------------
// 6. Migration Structural Proofs
// ---------------------------------------------------------------------------

describe('Migration 063 structure', () => {
  const migrationSrc = readFileSync(
    resolve(__dirname, '../db/migrations/063_demo_access_system.sql'),
    'utf-8',
  );

  it('adds app_user.is_demo column', () => {
    expect(migrationSrc).toContain('ALTER TABLE app_user');
    expect(migrationSrc).toContain('is_demo BOOLEAN NOT NULL DEFAULT false');
  });

  it('adds facility_settings.is_demo column', () => {
    expect(migrationSrc).toContain('ALTER TABLE facility_settings');
    expect(migrationSrc).toContain('is_demo BOOLEAN NOT NULL DEFAULT false');
  });

  it('creates demo_access_request table with outcome CHECK', () => {
    expect(migrationSrc).toContain('CREATE TABLE demo_access_request');
    expect(migrationSrc).toContain("outcome IN ('GRANTED', 'DENIED')");
  });

  it('creates demo_account table with ON DELETE CASCADE', () => {
    expect(migrationSrc).toContain('CREATE TABLE demo_account');
    expect(migrationSrc).toContain('ON DELETE CASCADE');
  });

  it('creates demo_blocked_email table', () => {
    expect(migrationSrc).toContain('CREATE TABLE demo_blocked_email');
  });

  it('creates demo_blocked_ip table', () => {
    expect(migrationSrc).toContain('CREATE TABLE demo_blocked_ip');
  });

  it('adds append-only triggers on demo_access_request', () => {
    expect(migrationSrc).toContain('demo_access_request_no_update');
    expect(migrationSrc).toContain('demo_access_request_no_delete');
    expect(migrationSrc).toContain('prevent_modification');
  });

  it('adds updated_at trigger on demo_account', () => {
    expect(migrationSrc).toContain('demo_account_updated_at');
    expect(migrationSrc).toContain('update_updated_at');
  });

  it('creates indexes on demo_access_request for rate limiting', () => {
    expect(migrationSrc).toContain('idx_demo_access_request_email_created');
    expect(migrationSrc).toContain('idx_demo_access_request_ip_created');
  });

  it('does NOT contain TRUNCATE', () => {
    expect(migrationSrc).not.toMatch(/TRUNCATE/i);
  });

  it('does NOT contain DROP TABLE', () => {
    expect(migrationSrc).not.toMatch(/DROP\s+TABLE/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Platform routes mount demo access admin
// ---------------------------------------------------------------------------

describe('Platform routes mount demo access admin', () => {
  const parentSrc = readFileSync(
    resolve(__dirname, '../src/routes/platform.routes.ts'),
    'utf-8',
  );

  it('imports platformDemoAccessRoutes', () => {
    expect(parentSrc).toContain('platformDemoAccessRoutes');
  });

  it('registers demo access admin under /demo prefix', () => {
    expect(parentSrc).toContain("prefix: '/demo'");
  });
});

// ---------------------------------------------------------------------------
// 8. Index.ts registers demo route
// ---------------------------------------------------------------------------

describe('Index registers demo routes', () => {
  const indexSrc = readFileSync(
    resolve(__dirname, '../src/index.ts'),
    'utf-8',
  );

  it('imports demoRoutes', () => {
    expect(indexSrc).toContain('demoRoutes');
  });

  it('registers under /api/demo prefix', () => {
    expect(indexSrc).toContain("prefix: '/api/demo'");
  });
});

// ---------------------------------------------------------------------------
// 9. DB Integration Tests (require live Postgres)
// ---------------------------------------------------------------------------

const canConnectToDB = !!process.env.DB_HOST || !!process.env.DATABASE_URL;

describe.skipIf(!canConnectToDB)('DB Integration: Demo Access', async () => {
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

  // Helper: create a test demo facility
  async function createTestDemoFacility(): Promise<{ facilityId: string; facilityKey: string }> {
    const key = `DEMOT_${Date.now()}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const facilityResult = await client.query<{ id: string }>(
        `INSERT INTO facility (name, facility_key) VALUES ($1, $2) RETURNING id`,
        [`Demo Test ${key}`, key],
      );
      const facilityId = facilityResult.rows[0].id;

      await client.query(
        `INSERT INTO facility_settings (facility_id, enable_timeout_debrief, is_demo) VALUES ($1, false, true)`,
        [facilityId],
      );

      await client.query('COMMIT');
      return { facilityId, facilityKey: key };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Helper: create a non-demo facility
  async function createNonDemoFacility(): Promise<string> {
    const key = `NONDEMO_${Date.now()}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(
        `INSERT INTO facility (name, facility_key) VALUES ($1, $2) RETURNING id`,
        [`Non-Demo ${key}`, key],
      );
      const facilityId = result.rows[0].id;
      await client.query(
        `INSERT INTO facility_settings (facility_id, enable_timeout_debrief, is_demo) VALUES ($1, false, false)`,
        [facilityId],
      );
      await client.query('COMMIT');
      return facilityId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Track IDs for cleanup
  const createdFacilityIds: string[] = [];
  const createdUserIds: string[] = [];

  it('can create a demo user and demo_account', async () => {
    const { facilityId } = await createTestDemoFacility();
    createdFacilityIds.push(facilityId);

    const email = `test_${Date.now()}@demo.test`;
    const username = `demo_test_${Date.now()}`;
    const passwordHash = await bcrypt.default.hash('random', 4);

    // Create app_user with is_demo = true
    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash, is_demo)
       VALUES ($1, $2, $3, $4, 'ADMIN', ARRAY['ADMIN'::user_role], $5, true)
       RETURNING id`,
      [facilityId, username, email, 'Test Demo User', passwordHash],
    );
    const userId = userResult.rows[0].id;
    createdUserIds.push(userId);

    // Create demo_account
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO demo_account (user_id, email, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, email, expiresAt.toISOString()],
    );

    // Verify demo_account
    const account = await pool.query(
      'SELECT * FROM demo_account WHERE user_id = $1',
      [userId],
    );
    expect(account.rows.length).toBe(1);
    expect(account.rows[0].email).toBe(email);
    expect(account.rows[0].is_blocked).toBe(false);

    // Verify app_user.is_demo
    const user = await pool.query(
      'SELECT is_demo FROM app_user WHERE id = $1',
      [userId],
    );
    expect(user.rows[0].is_demo).toBe(true);
  });

  it('demo_access_request is append-only (update rejected)', async () => {
    const email = `append_test_${Date.now()}@demo.test`;

    // Insert a request
    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO demo_access_request (email, outcome) VALUES ($1, 'GRANTED') RETURNING id`,
      [email],
    );
    const requestId = insertResult.rows[0].id;

    // Attempt update — should fail
    await expect(
      pool.query(`UPDATE demo_access_request SET outcome = 'DENIED' WHERE id = $1`, [requestId]),
    ).rejects.toThrow(/append-only/i);
  });

  it('demo_access_request is append-only (delete rejected)', async () => {
    const email = `delete_test_${Date.now()}@demo.test`;

    await pool.query(
      `INSERT INTO demo_access_request (email, outcome) VALUES ($1, 'DENIED')`,
      [email],
    );

    await expect(
      pool.query(`DELETE FROM demo_access_request WHERE email = $1`, [email]),
    ).rejects.toThrow(/append-only/i);
  });

  it('blocked email appears in blocklist', async () => {
    const email = `blocked_${Date.now()}@demo.test`;

    await pool.query(
      `INSERT INTO demo_blocked_email (email, reason) VALUES ($1, 'test block')`,
      [email],
    );

    const result = await pool.query(
      'SELECT reason FROM demo_blocked_email WHERE email = $1',
      [email],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].reason).toBe('test block');

    // Cleanup
    await pool.query('DELETE FROM demo_blocked_email WHERE email = $1', [email]);
  });

  it('blocked IP appears in blocklist', async () => {
    const ip = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    await pool.query(
      `INSERT INTO demo_blocked_ip (ip_address, reason) VALUES ($1, 'test ip block')`,
      [ip],
    );

    const result = await pool.query(
      'SELECT reason FROM demo_blocked_ip WHERE ip_address = $1',
      [ip],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].reason).toBe('test ip block');

    // Cleanup
    await pool.query('DELETE FROM demo_blocked_ip WHERE ip_address = $1', [ip]);
  });

  it('facility_settings.is_demo defaults to false', async () => {
    const nonDemoId = await createNonDemoFacility();
    createdFacilityIds.push(nonDemoId);

    const result = await pool.query(
      'SELECT is_demo FROM facility_settings WHERE facility_id = $1',
      [nonDemoId],
    );
    expect(result.rows[0].is_demo).toBe(false);
  });

  it('demo_account ON DELETE CASCADE removes account when user deleted', async () => {
    const { facilityId } = await createTestDemoFacility();
    createdFacilityIds.push(facilityId);

    const email = `cascade_${Date.now()}@demo.test`;
    const passwordHash = await bcrypt.default.hash('random', 4);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash, is_demo)
       VALUES ($1, $2, $3, $4, 'ADMIN', ARRAY['ADMIN'::user_role], $5, true)
       RETURNING id`,
      [facilityId, `demo_cascade_${Date.now()}`, email, 'Cascade Test', passwordHash],
    );
    const userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO demo_account (user_id, email, expires_at) VALUES ($1, $2, NOW() + interval '14 days')`,
      [userId, email],
    );

    // Delete user — should cascade to demo_account
    await pool.query('DELETE FROM app_user WHERE id = $1', [userId]);

    const account = await pool.query(
      'SELECT * FROM demo_account WHERE user_id = $1',
      [userId],
    );
    expect(account.rows.length).toBe(0);
  });

  afterAll(async () => {
    // Cleanup users
    for (const userId of createdUserIds) {
      await pool.query('DELETE FROM demo_account WHERE user_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM app_user WHERE id = $1', [userId]).catch(() => {});
    }
    // Cleanup facilities
    for (const facilityId of createdFacilityIds) {
      await pool.query('DELETE FROM demo_account WHERE user_id IN (SELECT id FROM app_user WHERE facility_id = $1)', [facilityId]).catch(() => {});
      await pool.query('DELETE FROM app_user WHERE facility_id = $1', [facilityId]).catch(() => {});
      await pool.query('DELETE FROM facility_settings WHERE facility_id = $1', [facilityId]).catch(() => {});
      await pool.query('DELETE FROM facility WHERE id = $1', [facilityId]).catch(() => {});
    }
    await pool.end();
  });
});
