/**
 * Platform Demo Access Admin Routes
 *
 * PLATFORM_ADMIN-only endpoints for managing demo blocklists
 * and reviewing demo access requests.
 *
 * Mounted under /api/platform/demo by platform.routes.ts
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin } from '../plugins/auth.js';
import { query } from '../db/index.js';
import { ok, fail, validated } from '../utils/reply.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const BlockEmailSchema = z.object({
  email: z.string().min(1).transform(v => v.trim().toLowerCase()),
  reason: z.string().optional(),
});

const BlockIpSchema = z.object({
  ipAddress: z.string().min(1),
  reason: z.string().optional(),
});

const UnblockEmailSchema = z.object({
  email: z.string().min(1).transform(v => v.trim().toLowerCase()),
});

const UnblockIpSchema = z.object({
  ipAddress: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function platformDemoAccessRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Block Email ──────────────────────────────────────────────────────────
  fastify.post('/block-email', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validated(reply, BlockEmailSchema, request.body);
    if (!body) return;

    await query(
      `INSERT INTO demo_blocked_email (email, reason)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET reason = $2`,
      [body.email, body.reason ?? null],
    );

    // Also block any active demo account with this email
    await query(
      `UPDATE demo_account SET is_blocked = true, blocked_reason = $2
       WHERE email = $1 AND is_blocked = false`,
      [body.email, body.reason ?? 'Blocked by platform admin'],
    );

    request.log.info({ code: 'DEMO_EMAIL_BLOCKED', email: body.email }, 'Demo email blocked');
    return ok(reply, { blocked: true, email: body.email });
  });

  // ── Unblock Email ────────────────────────────────────────────────────────
  fastify.post('/unblock-email', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validated(reply, UnblockEmailSchema, request.body);
    if (!body) return;

    const result = await query(
      'DELETE FROM demo_blocked_email WHERE email = $1',
      [body.email],
    );

    if (result.rowCount === 0) {
      return fail(reply, 'NOT_FOUND', 'Email not found in blocklist', 404);
    }

    request.log.info({ code: 'DEMO_EMAIL_UNBLOCKED', email: body.email }, 'Demo email unblocked');
    return ok(reply, { unblocked: true, email: body.email });
  });

  // ── Block IP ─────────────────────────────────────────────────────────────
  fastify.post('/block-ip', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validated(reply, BlockIpSchema, request.body);
    if (!body) return;

    await query(
      `INSERT INTO demo_blocked_ip (ip_address, reason)
       VALUES ($1, $2)
       ON CONFLICT (ip_address) DO UPDATE SET reason = $2`,
      [body.ipAddress, body.reason ?? null],
    );

    request.log.info({ code: 'DEMO_IP_BLOCKED', ip: body.ipAddress }, 'Demo IP blocked');
    return ok(reply, { blocked: true, ipAddress: body.ipAddress });
  });

  // ── Unblock IP ───────────────────────────────────────────────────────────
  fastify.post('/unblock-ip', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validated(reply, UnblockIpSchema, request.body);
    if (!body) return;

    const result = await query(
      'DELETE FROM demo_blocked_ip WHERE ip_address = $1',
      [body.ipAddress],
    );

    if (result.rowCount === 0) {
      return fail(reply, 'NOT_FOUND', 'IP not found in blocklist', 404);
    }

    request.log.info({ code: 'DEMO_IP_UNBLOCKED', ip: body.ipAddress }, 'Demo IP unblocked');
    return ok(reply, { unblocked: true, ipAddress: body.ipAddress });
  });

  // ── List Recent Requests ─────────────────────────────────────────────────
  fastify.get<{ Querystring: { limit?: string } }>('/requests', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(Math.max(parseInt(request.query.limit || '100', 10) || 100, 1), 500);

    const result = await query(
      `SELECT id, email, ip_address, user_agent, outcome, denial_reason,
              demo_user_id, expires_at, created_at
       FROM demo_access_request
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    return ok(reply, { requests: result.rows, count: result.rows.length });
  });

  // ── List Active Demo Accounts ────────────────────────────────────────────
  fastify.get('/accounts', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await query(
      `SELECT da.id, da.user_id, da.email, da.expires_at, da.is_blocked,
              da.blocked_reason, da.last_login_at, da.created_at,
              u.username, u.name
       FROM demo_account da
       JOIN app_user u ON u.id = da.user_id
       ORDER BY da.created_at DESC
       LIMIT 200`,
    );

    return ok(reply, { accounts: result.rows, count: result.rows.length });
  });

  // ── List Blocklists ──────────────────────────────────────────────────────
  fastify.get('/blocklists', {
    preHandler: [requirePlatformAdmin()],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const [emails, ips] = await Promise.all([
      query('SELECT email, reason, created_at FROM demo_blocked_email ORDER BY created_at DESC'),
      query('SELECT ip_address, reason, created_at FROM demo_blocked_ip ORDER BY created_at DESC'),
    ]);

    return ok(reply, {
      blockedEmails: emails.rows,
      blockedIps: ips.rows,
    });
  });
}
