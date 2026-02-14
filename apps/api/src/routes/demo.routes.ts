/**
 * Demo Access Routes (PUBLIC)
 *
 * POST /api/demo/request-access
 *   No auth required. Grants instant demo access for 14 days.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validated, ok, fail } from '../utils/reply.js';
import {
  normalizeEmail,
  isValidEmailShape,
  isBlockedEmail,
  isBlockedIp,
  checkRateLimit,
  resolveDemoFacility,
  upsertDemoUser,
  logAccessRequest,
  notifyOwnerAsync,
} from '../services/demo-access.service.js';
import type { JwtPayload } from '../plugins/auth.js';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const RequestAccessSchema = z.object({
  email: z.string().min(1, 'Email is required'),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function demoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/demo/request-access
   *
   * Public endpoint. Returns a JWT for a demo user attached to the
   * shared demo facility. Access expires in 14 days (fixed).
   */
  fastify.post('/request-access', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate body
    const body = validated(reply, RequestAccessSchema, request.body);
    if (!body) return;

    // 2. Normalize email
    const email = normalizeEmail(body.email);
    if (!isValidEmailShape(email)) {
      return fail(reply, 'VALIDATION_ERROR', 'Invalid email format', 400);
    }

    const ip = request.ip;
    const userAgent = request.headers['user-agent'] ?? null;

    // Helper to deny and log/notify in one shot
    async function deny(statusCode: number, code: string, reason: string) {
      await logAccessRequest({ email, ipAddress: ip, userAgent, outcome: 'DENIED', denialReason: reason });
      notifyOwnerAsync({ email, ipAddress: ip, userAgent, outcome: 'DENIED', denialReason: reason });
      return fail(reply, code, reason, statusCode);
    }

    // 3. Blocklist checks
    const emailBlock = await isBlockedEmail(email);
    if (emailBlock.blocked) {
      return deny(403, 'DEMO_ACCESS_BLOCKED', emailBlock.reason || 'Email is blocked');
    }

    const ipBlock = await isBlockedIp(ip);
    if (ipBlock.blocked) {
      return deny(403, 'DEMO_ACCESS_BLOCKED', ipBlock.reason || 'IP is blocked');
    }

    // 4. Rate-limit checks
    const rateLimit = await checkRateLimit(email, ip);
    if (!rateLimit.allowed) {
      return deny(429, 'RATE_LIMIT_EXCEEDED', rateLimit.reason || 'Too many requests');
    }

    // 5. Resolve demo facility
    const facility = await resolveDemoFacility();
    if (!facility) {
      request.log.error({ code: 'DEMO_FACILITY_MISSING' }, 'Demo facility not configured or not marked is_demo');
      return fail(reply, 'SERVICE_UNAVAILABLE', 'Demo is not currently available', 503);
    }

    // 6. Create or reuse demo user
    const demoUser = await upsertDemoUser(email, facility.id);

    // 7. Issue JWT
    const payload: JwtPayload = {
      userId: demoUser.userId,
      facilityId: facility.id,
      username: demoUser.username,
      email,
      name: `Demo User (${email})`,
      role: 'ADMIN',
      roles: ['ADMIN', 'SURGEON', 'INVENTORY_TECH', 'SCRUB', 'CIRCULATOR', 'SCHEDULER'],
      isDemo: true,
    };

    const token = fastify.jwt.sign(payload);

    // 8. Log the grant
    await logAccessRequest({
      email,
      ipAddress: ip,
      userAgent,
      outcome: 'GRANTED',
      demoUserId: demoUser.userId,
      expiresAt: demoUser.expiresAt,
    });

    // 9. Notify owner (best-effort, non-blocking)
    notifyOwnerAsync({
      email,
      ipAddress: ip,
      userAgent,
      outcome: 'GRANTED',
      expiresAt: demoUser.expiresAt.toISOString(),
    });

    // 10. Respond
    request.log.info(
      { code: 'DEMO_ACCESS_GRANTED', email, userId: demoUser.userId, reused: demoUser.reused },
      'Demo access granted',
    );

    return ok(reply, {
      token,
      expiresAt: demoUser.expiresAt.toISOString(),
      demo: true,
      facility: { id: facility.id, name: facility.name },
    });
  });
}
