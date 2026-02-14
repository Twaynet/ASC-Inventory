/**
 * Demo Access Service
 *
 * Core logic for the instant-access demo playground gate.
 * Handles email normalisation, blocklist checks, rate limiting,
 * demo user upsert, and owner notification.
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db/index.js';
import { notifyOwner } from '../utils/notify-owner.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEMO_TTL_DAYS = 14;
const RATE_LIMIT_IP_PER_DAY = parseInt(process.env.DEMO_RATE_LIMIT_IP_PER_DAY || '10', 10);
const RATE_LIMIT_EMAIL_PER_DAY = parseInt(process.env.DEMO_RATE_LIMIT_EMAIL_PER_DAY || '3', 10);

/** Roles granted to every demo user — gives full playground access. */
const DEMO_ROLES = ['ADMIN', 'SURGEON', 'INVENTORY_TECH', 'SCRUB', 'CIRCULATOR', 'SCHEDULER'];

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Trim and lowercase an email address. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Minimal email shape validation (no full RFC). */
export function isValidEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Blocklist checks
// ---------------------------------------------------------------------------

export async function isBlockedEmail(email: string): Promise<{ blocked: boolean; reason: string | null }> {
  const result = await query<{ reason: string | null }>(
    'SELECT reason FROM demo_blocked_email WHERE email = $1',
    [email],
  );
  if (result.rows.length > 0) {
    return { blocked: true, reason: result.rows[0].reason };
  }
  return { blocked: false, reason: null };
}

export async function isBlockedIp(ip: string): Promise<{ blocked: boolean; reason: string | null }> {
  const result = await query<{ reason: string | null }>(
    'SELECT reason FROM demo_blocked_ip WHERE ip_address = $1',
    [ip],
  );
  if (result.rows.length > 0) {
    return { blocked: true, reason: result.rows[0].reason };
  }
  return { blocked: false, reason: null };
}

// ---------------------------------------------------------------------------
// Rate-limit checks (via demo_access_request counts in last 24 h)
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  email: string,
  ip: string,
): Promise<{ allowed: boolean; reason: string | null }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [emailCount, ipCount] = await Promise.all([
    query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM demo_access_request WHERE email = $1 AND created_at >= $2',
      [email, since],
    ),
    query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM demo_access_request WHERE ip_address = $1 AND created_at >= $2',
      [ip, since],
    ),
  ]);

  if (emailCount.rows[0].n >= RATE_LIMIT_EMAIL_PER_DAY) {
    return { allowed: false, reason: `Email rate limit exceeded (${RATE_LIMIT_EMAIL_PER_DAY}/day)` };
  }
  if (ipCount.rows[0].n >= RATE_LIMIT_IP_PER_DAY) {
    return { allowed: false, reason: `IP rate limit exceeded (${RATE_LIMIT_IP_PER_DAY}/day)` };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// Facility resolution
// ---------------------------------------------------------------------------

interface DemoFacility {
  id: string;
  name: string;
  facilityKey: string;
}

export async function resolveDemoFacility(): Promise<DemoFacility | null> {
  const facilityKey = process.env.DEMO_DEFAULT_FACILITY_KEY;
  if (!facilityKey) return null;

  const result = await query<{ id: string; name: string; facility_key: string }>(
    `SELECT f.id, f.name, f.facility_key
     FROM facility f
     JOIN facility_settings fs ON fs.facility_id = f.id
     WHERE f.facility_key = $1 AND fs.is_demo = true`,
    [facilityKey],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return { id: row.id, name: row.name, facilityKey: row.facility_key };
}

// ---------------------------------------------------------------------------
// Demo user upsert
// ---------------------------------------------------------------------------

interface DemoUserResult {
  userId: string;
  username: string;
  expiresAt: Date;
  reused: boolean;
}

export async function upsertDemoUser(
  email: string,
  facilityId: string,
): Promise<DemoUserResult> {
  // Check for existing non-expired, non-blocked demo account
  const existing = await query<{
    user_id: string;
    username: string;
    expires_at: string;
    is_blocked: boolean;
  }>(
    `SELECT da.user_id, u.username, da.expires_at, da.is_blocked
     FROM demo_account da
     JOIN app_user u ON u.id = da.user_id
     WHERE da.email = $1 AND da.is_blocked = false AND da.expires_at > NOW()`,
    [email],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // Update last_login_at
    await query(
      'UPDATE demo_account SET last_login_at = NOW() WHERE user_id = $1',
      [row.user_id],
    );
    return {
      userId: row.user_id,
      username: row.username,
      expiresAt: new Date(row.expires_at),
      reused: true,
    };
  }

  // Create new demo user inside a transaction
  const expiresAt = new Date(Date.now() + DEMO_TTL_DAYS * 24 * 60 * 60 * 1000);
  const username = `demo_${randomBytes(6).toString('hex')}`;
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 4); // random unguessable

  const result = await transaction(async (client) => {
    // Create app_user
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash, is_demo)
       VALUES ($1, $2, $3, $4, 'ADMIN', $5::user_role[], $6, true)
       RETURNING id`,
      [
        facilityId,
        username,
        email,
        `Demo User (${email})`,
        `{${DEMO_ROLES.join(',')}}`,
        passwordHash,
      ],
    );

    const userId = userResult.rows[0].id;

    // Create demo_account
    await client.query(
      `INSERT INTO demo_account (user_id, email, expires_at, last_login_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, email, expiresAt.toISOString()],
    );

    return userId;
  });

  return { userId: result, username, expiresAt, reused: false };
}

// ---------------------------------------------------------------------------
// Access-request log insertion
// ---------------------------------------------------------------------------

export async function logAccessRequest(params: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: 'GRANTED' | 'DENIED';
  denialReason?: string | null;
  demoUserId?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await query(
    `INSERT INTO demo_access_request
       (email, ip_address, user_agent, outcome, denial_reason, demo_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.email,
      params.ipAddress,
      params.userAgent,
      params.outcome,
      params.denialReason ?? null,
      params.demoUserId ?? null,
      params.expiresAt?.toISOString() ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Owner notification (fire-and-forget wrapper)
// ---------------------------------------------------------------------------

export function notifyOwnerAsync(params: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: 'GRANTED' | 'DENIED';
  expiresAt?: string | null;
  denialReason?: string | null;
}): void {
  notifyOwner(params).catch(() => {
    // Swallowed — notifyOwner already logs internally
  });
}

// ---------------------------------------------------------------------------
// Demo auth enforcement (called from authenticate decorator)
// ---------------------------------------------------------------------------

export interface DemoEnforcementResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

export async function enforceDemoAccess(userId: string, facilityId: string | null): Promise<DemoEnforcementResult> {
  // Check demo_account status
  const accountResult = await query<{ expires_at: string; is_blocked: boolean }>(
    'SELECT expires_at, is_blocked FROM demo_account WHERE user_id = $1',
    [userId],
  );

  if (accountResult.rows.length === 0) {
    return { allowed: false, code: 'DEMO_ACCESS_INVALID', message: 'Demo account not found' };
  }

  const account = accountResult.rows[0];

  if (account.is_blocked) {
    return { allowed: false, code: 'DEMO_ACCESS_BLOCKED', message: 'Demo access has been revoked' };
  }

  if (new Date(account.expires_at) < new Date()) {
    return { allowed: false, code: 'DEMO_ACCESS_EXPIRED', message: 'Demo access has expired' };
  }

  // Verify facility is demo
  if (facilityId) {
    const facilityResult = await query<{ is_demo: boolean }>(
      'SELECT is_demo FROM facility_settings WHERE facility_id = $1',
      [facilityId],
    );

    if (facilityResult.rows.length === 0 || !facilityResult.rows[0].is_demo) {
      return { allowed: false, code: 'DEMO_FACILITY_INVALID', message: 'Demo user not attached to a demo facility' };
    }
  }

  return { allowed: true };
}
