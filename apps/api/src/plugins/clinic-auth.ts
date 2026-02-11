/**
 * Clinic API Key Authentication Plugin
 *
 * Authenticates clinics via X-Clinic-Key header.
 * Key format: random 64-char hex — first 8 chars used for DB prefix lookup,
 * full key verified via HMAC-SHA256 with a server-side secret.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../db/index.js';

const DEV_CLINIC_KEY_SECRET = 'dev-clinic-key-secret-change-in-production';

function resolveClinicKeySecret(): string {
  const secret = process.env.CLINIC_KEY_SECRET;
  if (secret) return secret;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error(
      'CLINIC_KEY_SECRET environment variable is required in production. '
      + 'Set it to a random 64+ character string.',
    );
  }

  // Dev/test only — warn once
  console.warn(
    '[clinic-auth] CLINIC_KEY_SECRET not set — using insecure dev default. '
    + 'Set CLINIC_KEY_SECRET in production.',
  );
  return DEV_CLINIC_KEY_SECRET;
}

const CLINIC_KEY_SECRET = resolveClinicKeySecret();

export interface ClinicContext {
  clinicId: string;
  clinicName: string;
}

// Extend Fastify request to include clinic context
declare module 'fastify' {
  interface FastifyRequest {
    clinicContext?: ClinicContext;
  }
}

/**
 * Hash a raw API key with HMAC-SHA256 using a server-side secret.
 * The secret prevents offline rainbow-table attacks if the DB is compromised.
 */
export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', CLINIC_KEY_SECRET).update(rawKey).digest('hex');
}

/**
 * Extract the prefix from a raw API key (first 8 characters).
 */
export function extractPrefix(rawKey: string): string {
  return rawKey.substring(0, 8);
}

/**
 * Fastify preHandler that authenticates via X-Clinic-Key header.
 * Sets request.clinicContext on success, returns 401 on failure.
 */
export async function requireClinicAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawKey = request.headers['x-clinic-key'] as string | undefined;
  if (!rawKey) {
    return reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'X-Clinic-Key header required' },
    });
  }

  const prefix = extractPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  interface KeyRow {
    id: string;
    clinic_id: string;
    key_hash: string;
    clinic_name: string;
    clinic_active: boolean;
  }

  const result = await query<KeyRow>(`
    SELECT k.id, k.clinic_id, k.key_hash, c.name AS clinic_name, c.active AS clinic_active
    FROM clinic_api_key k
    JOIN clinic c ON c.id = k.clinic_id
    WHERE k.key_prefix = $1 AND k.active = true
  `, [prefix]);

  if (result.rows.length === 0) {
    return reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid API key' },
    });
  }

  // Find matching key by hash (prefix might not be unique across clinics)
  // Use constant-time comparison to prevent timing attacks
  const keyHashBuf = Buffer.from(keyHash, 'hex');
  const matchedKey = result.rows.find(row => {
    const storedBuf = Buffer.from(row.key_hash, 'hex');
    return storedBuf.length === keyHashBuf.length && timingSafeEqual(storedBuf, keyHashBuf);
  });
  if (!matchedKey) {
    return reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid API key' },
    });
  }

  if (!matchedKey.clinic_active) {
    return reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'Clinic is inactive' },
    });
  }

  request.clinicContext = {
    clinicId: matchedKey.clinic_id,
    clinicName: matchedKey.clinic_name,
  };
}
