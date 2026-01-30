/**
 * Contract Route Adapter
 *
 * Registers Fastify routes from contract definitions with automatic:
 * - params/query/body validation (Zod, before handler)
 * - response validation (Zod, after handler, before send)
 * - standardized error envelope for validation failures
 *
 * Wave 6B.2: Makes the shared contract AUTHORITATIVE for registered endpoints.
 */

import { FastifyInstance, FastifyRequest, FastifyReply, RouteHandlerMethod } from 'fastify';
import type { ContractRoute } from '@asc/contract';
import { z } from 'zod';
import { fail } from '../utils/reply.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed and validated contract data attached to request. */
export interface ContractData {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

/** Handler receives request with .contractData populated. */
export type ContractHandler = (
  request: FastifyRequest & { contractData: ContractData },
  reply: FastifyReply,
) => Promise<FastifyReply | void>;

export interface ContractRouteOptions {
  /** Fastify preHandler hooks (auth, capabilities, etc.) */
  preHandler?: RouteHandlerMethod | RouteHandlerMethod[];
  /** The route handler function. */
  handler: ContractHandler;
  /**
   * Status code for success (default 200).
   * Use 201 for creation endpoints.
   */
  successStatus?: number;
}

// ---------------------------------------------------------------------------
// Path conversion: contract `:param` → fastify `:param` (same format, pass-through)
// ---------------------------------------------------------------------------

/**
 * Convert contract path (e.g. `/cases/:caseId`) to fastify-compatible path.
 * Fastify uses the same `:param` syntax, so this is identity — but we strip
 * the prefix since routes are registered under a prefix.
 */
function contractPathToFastify(contractPath: string, prefix: string): string {
  // Contract paths are absolute (e.g. /cases/:caseId).
  // Fastify routes are relative to their prefix (e.g. /:caseId under /api/cases).
  if (contractPath.startsWith(prefix)) {
    const relative = contractPath.slice(prefix.length);
    return relative || '/';
  }
  // If no prefix match, use as-is
  return contractPath;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/**
 * Validate the final { data: ... } response against the contract response schema.
 * On failure, log details and send SERVER_RESPONSE_INVALID (500).
 */
function validateResponse(
  responseSchema: z.ZodTypeAny | 'void',
  payload: unknown,
  request: FastifyRequest,
): { valid: true } | { valid: false; issues: z.ZodIssue[] } {
  if (responseSchema === 'void') {
    return { valid: true };
  }

  // The response schema describes the unwrapped payload (inside { data: ... }).
  // We validate the payload directly.
  const result = responseSchema.safeParse(payload);
  if (result.success) {
    return { valid: true };
  }

  // Log server-side (no PHI — only field paths and types)
  request.log.error({
    code: 'SERVER_RESPONSE_INVALID',
    method: request.method,
    url: request.url,
    issues: result.error.issues.map(i => ({
      path: i.path,
      code: i.code,
      message: i.message,
    })),
  });

  return { valid: false, issues: result.error.issues };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register a single contract-authoritative route on a Fastify instance.
 *
 * @param fastify - The Fastify instance (or plugin scope).
 * @param route - Contract route definition from @asc/contract.
 * @param prefix - Route prefix (e.g. '/cases') that the contract path starts with.
 *                 Used to compute the relative URL for fastify registration.
 * @param options - Handler and pre-handlers.
 */
export function registerContractRoute(
  fastify: FastifyInstance,
  route: ContractRoute,
  prefix: string,
  options: ContractRouteOptions,
): void {
  const { preHandler, handler, successStatus } = options;
  const url = contractPathToFastify(route.path, prefix);
  const method = route.method;

  const preHandlerArray = preHandler
    ? (Array.isArray(preHandler) ? preHandler : [preHandler])
    : [];

  fastify.route({
    method,
    url,
    preHandler: preHandlerArray,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // ── Validate params ──
      let parsedParams: Record<string, unknown> = {};
      if (route.params) {
        const result = (route.params as z.ZodTypeAny).safeParse(request.params);
        if (!result.success) {
          return fail(reply, 'INVALID_REQUEST', 'Invalid path parameters', 400,
            result.error.flatten());
        }
        parsedParams = result.data as Record<string, unknown>;
      }

      // ── Validate query ──
      let parsedQuery: Record<string, unknown> = {};
      if (route.query) {
        const result = (route.query as z.ZodTypeAny).safeParse(request.query);
        if (!result.success) {
          return fail(reply, 'INVALID_REQUEST', 'Invalid query parameters', 400,
            result.error.flatten());
        }
        parsedQuery = result.data as Record<string, unknown>;
      }

      // ── Validate body ──
      let parsedBody: unknown = undefined;
      if (route.body) {
        const result = (route.body as z.ZodTypeAny).safeParse(request.body);
        if (!result.success) {
          return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400,
            result.error.flatten());
        }
        parsedBody = result.data;
      }

      // Attach contract data to request
      const contractRequest = request as FastifyRequest & { contractData: ContractData };
      contractRequest.contractData = {
        params: parsedParams,
        query: parsedQuery,
        body: parsedBody,
      };

      // ── Intercept response for validation ──
      // We hook into reply.send() to validate the response before it goes out.
      if (route.response !== 'void') {
        const originalSend = reply.send.bind(reply);
        reply.send = function interceptedSend(payload: unknown): FastifyReply {
          // Only validate success responses (status < 400) that have { data }
          const statusCode = reply.statusCode || 200;
          if (statusCode < 400 && payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
            const dataPayload = (payload as Record<string, unknown>).data;
            const validation = validateResponse(route.response, dataPayload, request);
            if (!validation.valid) {
              // Replace response with error
              reply.statusCode = 500;
              return originalSend({
                error: {
                  code: 'SERVER_RESPONSE_INVALID',
                  message: 'Response validation failed',
                },
              });
            }
          }
          return originalSend(payload);
        } as typeof reply.send;
      }

      // ── Call handler ──
      const result = await handler(contractRequest, reply);

      // Handle 204 void responses
      if (route.response === 'void' && !reply.sent) {
        return reply.status(successStatus ?? 204).send();
      }

      return result;
    },
  });
}

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    contractData?: ContractData;
  }
}
