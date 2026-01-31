/**
 * AI Routes — read-only AI explanation endpoints.
 *
 * All AI endpoints:
 * - Require authentication + CASE_VIEW capability
 * - Are feature-flagged (default OFF)
 * - Never change application state
 * - Log usage metadata (never prompt body)
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ok, fail, validated } from '../utils/reply.js';
import { getUserRoles } from '../plugins/auth.js';
import { deriveCapabilities } from '@asc/domain';
import { explainReadiness, type ExplainReadinessInput } from '../services/ai.service.js';

// ── Request Schema ────────────────────────────────────────────────────────

const BlockerSchema = z.object({
  code: z.string(),
  label: z.string(),
  severity: z.enum(['warning', 'critical']),
  actionLabel: z.string(),
  href: z.string(),
  capability: z.string().optional(),
});

const ExplainReadinessRequestSchema = z.object({
  caseId: z.string().min(1),
  caseHeader: z.object({
    caseNumber: z.string(),
    procedureName: z.string(),
    surgeonName: z.string().nullable(),
    scheduledDate: z.string().nullable(),
    scheduledTime: z.string().nullable(),
    orRoom: z.string().nullable(),
    status: z.string(),
    isActive: z.boolean(),
  }),
  readinessSnapshot: z.object({
    overall: z.enum(['READY', 'BLOCKED', 'UNKNOWN']),
    blockers: z.array(BlockerSchema),
  }),
});

// ── Rate Limiter (in-memory, per-user) ────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(userId, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    return true;
  }
  recent.push(now);
  return false;
}

// ── Routes ────────────────────────────────────────────────────────────────

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/explain-readiness', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply) => {
    // Feature flag check
    if (process.env.AI_EXPLAIN_READINESS_ENABLED !== 'true') {
      return fail(reply, 'FEATURE_DISABLED', 'AI Explain Readiness is not enabled', 501);
    }

    // Capability check: CASE_VIEW
    const userRoles = getUserRoles(request.user);
    const userCaps = deriveCapabilities(userRoles);
    if (!userCaps.includes('CASE_VIEW')) {
      return fail(reply, 'FORBIDDEN', 'Requires CASE_VIEW capability', 403);
    }

    // Rate limit
    const userId = (request.user as { id?: string })?.id ?? 'unknown';
    if (isRateLimited(userId)) {
      return fail(reply, 'RATE_LIMITED', 'Too many requests. Try again in a minute.', 429);
    }

    // Validate body
    const body = validated(reply, ExplainReadinessRequestSchema, request.body);
    if (!body) return;

    try {
      const input: ExplainReadinessInput = {
        caseHeader: body.caseHeader as ExplainReadinessInput['caseHeader'],
        readinessSnapshot: body.readinessSnapshot as ExplainReadinessInput['readinessSnapshot'],
      };

      const result = await explainReadiness(input, request.log);

      // Log usage metadata (never the prompt body)
      request.log.info({
        code: 'AI_EXPLAIN_READINESS',
        caseId: body.caseId,
        userId,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      }, 'AI explain-readiness completed');

      return ok(reply, result.response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI explanation unavailable';
      request.log.error({ err, code: 'AI_EXPLAIN_READINESS_ERROR', caseId: body.caseId }, 'AI explain-readiness failed');

      if (message.includes('timeout') || message.includes('OPENAI_API_KEY')) {
        return fail(reply, 'AI_UNAVAILABLE', 'Explanation unavailable. Try again later.', 503);
      }

      return fail(reply, 'AI_ERROR', 'Explanation unavailable.', 500);
    }
  });
}
