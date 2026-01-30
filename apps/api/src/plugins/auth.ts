/**
 * Authentication Plugin
 * JWT-based auth with role-based and capability-based access control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { UserRole, type Capability, deriveCapabilities } from '@asc/domain';

// JWT payload type
export interface JwtPayload {
  userId: string;
  facilityId: string;
  username: string;
  email: string | null;
  name: string;
  role: UserRole; // Primary role (backward compat)
  roles: UserRole[]; // All assigned roles
}

// Extend @fastify/jwt module to type the user property
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// Re-export capability system from canonical domain source
export { type Capability, ROLE_CAPABILITIES, deriveCapabilities } from '@asc/domain';

/**
 * Normalize to roles[] — always returns an array regardless of input shape.
 *
 * TODO(PERSONA-REMOVE-LEGACY): Remove the user.role fallback once all JWTs
 * in circulation contain a populated roles[] array. Gate: no ERROR_CODE
 * AUTH_LEGACY_ROLE_FALLBACK seen in logs for 30 days.
 */
export function getUserRoles(user: JwtPayload): UserRole[] {
  if (user.roles && user.roles.length > 0) {
    return user.roles;
  }
  // Legacy JWT fallback — log as ERROR so we can track removal readiness
  console.error(
    JSON.stringify({
      code: 'AUTH_LEGACY_ROLE_FALLBACK',
      level: 'error',
      message: 'JWT missing roles[]; falling back to deprecated user.role',
      userId: user.userId,
      role: user.role,
    }),
  );
  return [user.role];
}

export async function authPlugin(fastify: FastifyInstance): Promise<void> {
  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    sign: {
      expiresIn: '24h',
    },
  });

  // Decorate request with authenticate method
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );
}

// ============================================================================
// Authorization helpers (preHandler functions)
// ============================================================================

/**
 * Require ANY of the listed roles. Uses roles[] as truth.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // First, verify JWT
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const userRoles = getUserRoles(request.user);
    const hasAllowedRole = userRoles.some(role => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Required roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/**
 * Require ANY of the listed capabilities. Capabilities are derived from roles[].
 */
export function requireCapabilities(...requiredCaps: Capability[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const userRoles = getUserRoles(request.user);
    const userCaps = deriveCapabilities(userRoles);
    const hasRequired = requiredCaps.some(cap => userCaps.includes(cap));

    if (!hasRequired) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Required capabilities: ${requiredCaps.join(', ')}`,
      });
    }
  };
}

// Pre-built role checks
export const requireAdmin = requireRoles('ADMIN');
export const requireScheduler = requireRoles('ADMIN', 'SCHEDULER');
export const requireInventoryTech = requireRoles('ADMIN', 'INVENTORY_TECH');
export const requireCirculator = requireRoles('ADMIN', 'CIRCULATOR', 'INVENTORY_TECH');
export const requireSurgeon = requireRoles('SURGEON');
export const requireAnyStaff = requireRoles('ADMIN', 'SCHEDULER', 'INVENTORY_TECH', 'CIRCULATOR');
export const requireAttestation = requireRoles('ADMIN', 'CIRCULATOR', 'INVENTORY_TECH');
