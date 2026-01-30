/**
 * Idempotency Middleware
 *
 * Provides optional Idempotency-Key header support for high-risk write endpoints.
 * When a client sends the same idempotency key with the same request body,
 * the original response is replayed without re-executing the handler.
 *
 * If the same key is reused with a different body, a 409 Conflict is returned.
 *
 * Keys are scoped to (userId, facilityId, method, routePath) and expire after 24h.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { query } from '../db/index.js';
import { fail } from '../utils/reply.js';

/**
 * Compute a stable hash of the request body for idempotency comparison.
 */
function hashBody(body: unknown): string {
  const obj = (body && typeof body === 'object') ? body : {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const stable = JSON.stringify(obj, keys);
  return createHash('sha256').update(stable).digest('hex');
}

/**
 * Returns a Fastify preHandler that implements idempotency-key logic.
 * Must run AFTER authentication (needs request.user).
 *
 * Usage:
 *   preHandler: [requireCapabilities('CASE_APPROVE'), idempotent()],
 */
export function idempotent() {
  return async function idempotencyHandler(request: FastifyRequest, reply: FastifyReply) {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (!key) return; // Header not provided — proceed normally

    // Validate key length
    if (key.length > 256) {
      return fail(reply, 'VALIDATION_ERROR', 'Idempotency-Key must be 256 characters or fewer', 400, undefined, request.requestId);
    }

    const { userId, facilityId } = request.user;
    const method = request.method;
    // Use route pattern (e.g. /cases/:caseId/approve), not the actual URL
    const path = request.routeOptions?.url || request.url;
    const bodyHash = hashBody(request.body);

    // Opportunistic cleanup of expired keys (~1% of requests)
    if (Math.random() < 0.01) {
      query('DELETE FROM idempotency_key WHERE expires_at < NOW()').catch(() => {});
    }

    // Check for existing key
    const existing = await query<{
      body_hash: string;
      status_code: number;
      response_json: unknown;
    }>(
      `SELECT body_hash, status_code, response_json FROM idempotency_key
       WHERE key = $1 AND user_id = $2 AND facility_id = $3 AND method = $4 AND path = $5
       AND expires_at > NOW()`,
      [key, userId, facilityId, method, path],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.body_hash !== bodyHash) {
        request.log.warn({ code: 'IDEMPOTENCY_CONFLICT', idempotencyKey: key }, 'Idempotency key reused with different body');
        return fail(reply, 'IDEMPOTENCY_KEY_REUSED',
          'Idempotency key already used with different request body', 409, undefined, request.requestId);
      }
      // Replay the original response
      request.log.info({ code: 'IDEMPOTENCY_REPLAY', idempotencyKey: key }, 'Idempotency replay');
      return reply.status(row.status_code).send(row.response_json);
    }

    // No existing key — intercept reply.send() to capture the response
    const originalSend = reply.send.bind(reply);
    reply.send = function captureForIdempotency(payload: unknown): FastifyReply {
      const statusCode = reply.statusCode || 200;
      // Only store successful responses (2xx)
      if (statusCode >= 200 && statusCode < 300) {
        query(
          `INSERT INTO idempotency_key (key, user_id, facility_id, method, path, body_hash, status_code, response_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [key, userId, facilityId, method, path, bodyHash, statusCode, JSON.stringify(payload)],
        ).catch(err => request.log.error({ err }, 'Failed to store idempotency key'));
      }
      return originalSend(payload);
    } as typeof reply.send;
  };
}
