/**
 * Standardized API Reply Helpers
 *
 * All API responses use a consistent envelope:
 *   Success: { data: <payload> }
 *   Error:   { error: { code: string, message: string, details?: any } }
 *
 * Usage:
 *   return ok(reply, { items: [...] });
 *   return ok(reply, { item }, 201);
 *   return fail(reply, 'VALIDATION_ERROR', 'Name is required', 400, zodErrors);
 *   return fail(reply, 'NOT_FOUND', 'Case card not found', 404);
 */

import { FastifyReply } from 'fastify';
import { z } from 'zod';

/**
 * Send a success response wrapped in { data }.
 */
export function ok<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
  return reply.status(statusCode).send({ data });
}

/**
 * Send an error response wrapped in { error: { code, message, details? } }.
 */
export function fail(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown,
): FastifyReply {
  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code, message },
  };
  if (details !== undefined) {
    body.error.details = details;
  }
  return reply.status(statusCode).send(body);
}

/**
 * Parse request data against a Zod schema.
 * Returns the parsed value on success, or null after sending a 400 error.
 *
 * Usage:
 *   const body = validated(reply, MySchema, request.body);
 *   if (!body) return;
 */
export function validated<T>(
  reply: FastifyReply,
  schema: z.ZodType<T>,
  data: unknown,
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, result.error.flatten());
    return null;
  }
  return result.data;
}
