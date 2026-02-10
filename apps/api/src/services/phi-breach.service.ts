/**
 * PHI Breach Context Service
 *
 * Phase 4C: Computes and stores hashed request metadata
 * for breach investigation readiness.
 *
 * CRITICAL: NO raw IPs, NO raw user agents stored.
 * All values are HMAC-SHA256 hashed with server-side salt.
 *
 * LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Logging & Audit Requirements
 */

import { createHmac } from 'node:crypto';
import { FastifyRequest } from 'fastify';

// ============================================================================
// Types
// ============================================================================

export interface BreachContext {
  /** HMAC-SHA256 of raw IP address */
  ip_hash: string;
  /** HMAC-SHA256 of User-Agent header */
  user_agent_hash: string;
  /** Country-level geo hint (null if not determinable) */
  geo_hint: string | null;
  /** HMAC-SHA256 of (IP + UA + endpoint) for cross-entry correlation */
  request_fingerprint: string;
}

// ============================================================================
// Hashing
// ============================================================================

function getHashSalt(): string {
  return process.env.BREACH_HASH_SALT || process.env.JWT_SECRET || 'phi-breach-default-salt';
}

function hmacHash(value: string): string {
  return createHmac('sha256', getHashSalt())
    .update(value)
    .digest('hex');
}

// ============================================================================
// Core Function
// ============================================================================

/**
 * Build breach context from a Fastify request.
 * Returns JSONB-safe object with only hashed values — no raw PII.
 */
export function buildBreachContext(request: FastifyRequest): BreachContext {
  const ip = request.ip || 'unknown';
  const userAgent = (request.headers['user-agent'] as string) || 'unknown';
  const endpoint = request.url || 'unknown';

  return {
    ip_hash: hmacHash(ip),
    user_agent_hash: hmacHash(userAgent),
    geo_hint: null, // Phase 4: null acceptable per spec. Geo lookup deferred.
    request_fingerprint: hmacHash(`${ip}|${userAgent}|${endpoint}`),
  };
}
