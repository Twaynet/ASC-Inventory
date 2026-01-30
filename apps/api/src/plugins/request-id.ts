/**
 * Request ID Plugin
 *
 * Assigns a correlation ID to every request:
 * - Accepts inbound X-Request-Id header from clients
 * - Generates a UUID if none provided
 * - Binds requestId to pino logger for structured logging
 * - Returns X-Request-Id header on every response
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export async function requestIdPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('requestId', '');

  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done) => {
    const inbound = request.headers['x-request-id'] as string | undefined;
    const requestId = inbound && inbound.length <= 128 ? inbound : randomUUID();
    request.requestId = requestId;
    // Rebind pino child logger with requestId for all subsequent logs
    request.log = request.log.child({ requestId });
    done();
  });

  fastify.addHook('onSend', (request: FastifyRequest, reply: FastifyReply, payload: unknown, done) => {
    reply.header('X-Request-Id', request.requestId);
    done(null, payload);
  });
}
