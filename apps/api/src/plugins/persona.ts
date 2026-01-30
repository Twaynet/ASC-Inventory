/**
 * Persona Plugin
 *
 * Reads the untrusted X-Active-Persona header and decorates the request
 * for audit/logging purposes. The persona value is NEVER used for
 * authorization decisions.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { PERSONA_HEADER, resolvePersona } from '@asc/domain';
import { getUserRoles } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** UX-only active persona. Untrusted. For audit metadata only. */
    activePersona: string | null;
  }
}

export async function personaPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('activePersona', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const raw = request.headers[PERSONA_HEADER.toLowerCase()] as string | undefined;
    if (!raw) return;

    // Only resolve if user is authenticated (JWT already verified)
    try {
      await request.jwtVerify();
      const roles = getUserRoles(request.user);
      const persona = resolvePersona(raw, roles);
      request.activePersona = persona;
    } catch {
      // Not authenticated or invalid JWT — ignore persona header silently
    }
  });
}
