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
