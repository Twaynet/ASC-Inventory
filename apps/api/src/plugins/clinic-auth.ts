/**
 * Clinic API Key Authentication Plugin
 *
 * Authenticates clinics via X-Clinic-Key header.
 * Key format: {prefix}.{secret} — prefix used for DB lookup, full key verified via SHA-256 hash.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { query } from '../db/index.js';

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
 * Hash a raw API key with SHA-256 (deterministic, suitable for random API keys).
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
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
  const matchedKey = result.rows.find(row => row.key_hash === keyHash);
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
