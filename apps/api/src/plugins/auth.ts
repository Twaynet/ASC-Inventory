/**
 * Authentication Plugin
 * JWT-based auth with role-based and capability-based access control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { UserRole, type Capability, deriveCapabilities } from '@asc/domain';

// JWT payload type
// LAW §3.1-3.2: PLATFORM_ADMIN is no-tenant identity (facilityId = null)
export interface JwtPayload {
  userId: string;
  facilityId: string | null;  // Null for PLATFORM_ADMIN (no-tenant identity)
  username: string;
  email: string | null;
  name: string;
  role: UserRole; // Primary role (backward compat)
  roles: UserRole[]; // All assigned roles
  isDemo?: boolean; // True for demo playground accounts
}

/**
 * Type guard: Check if user is a Platform Admin (no-tenant identity)
 * LAW §3.1: PLATFORM_ADMIN users have no implicit facility context
 */
export function isPlatformAdmin(user: JwtPayload): boolean {
  const roles = getUserRoles(user);
  return roles.includes('PLATFORM_ADMIN');
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
        request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
        reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId } });
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
      request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId } });
    }

    const userRoles = getUserRoles(request.user);
    const hasAllowedRole = userRoles.some(role => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      request.log.warn({ code: 'AUTHZ_DENIED', userId: request.user.userId, facilityId: request.user.facilityId, requiredRoles: allowedRoles }, 'Authorization denied — missing roles');
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `Required roles: ${allowedRoles.join(', ')}`, requestId: request.requestId },
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
      request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId } });
    }

    const userRoles = getUserRoles(request.user);
    const userCaps = deriveCapabilities(userRoles);
    const hasRequired = requiredCaps.some(cap => userCaps.includes(cap));

    if (!hasRequired) {
      request.log.warn({ code: 'AUTHZ_DENIED', userId: request.user.userId, facilityId: request.user.facilityId, requiredCapabilities: requiredCaps }, 'Authorization denied — missing capabilities');
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `Required capabilities: ${requiredCaps.join(', ')}`, requestId: request.requestId },
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

// ============================================================================
// Platform Control Plane Authorization (LAW §2-3)
// ============================================================================

/**
 * Require PLATFORM_ADMIN role for Control Plane endpoints.
 * LAW §2.4: Tenant users must never access Control Plane routes.
 * LAW §3.1: PLATFORM_ADMIN is a non-tenant identity.
 */
export function requirePlatformAdmin() {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId },
      });
    }

    const userRoles = getUserRoles(request.user);
    if (!userRoles.includes('PLATFORM_ADMIN')) {
      request.log.warn(
        { code: 'PLATFORM_ACCESS_DENIED', userId: request.user.userId, roles: userRoles },
        'Control Plane access denied — requires PLATFORM_ADMIN'
      );
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Requires PLATFORM_ADMIN role', requestId: request.requestId },
      });
    }
  };
}

/**
 * Require tenant context (facilityId) for Tenant Plane endpoints.
 * LAW §3.4: Tenant Plane endpoints remain facility-scoped.
 * Use as preHandler on tenant endpoints to reject PLATFORM_ADMIN without explicit targeting.
 */
export function requireTenantContext() {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId },
      });
    }

    if (request.user.facilityId === null) {
      request.log.warn(
        { code: 'TENANT_CONTEXT_REQUIRED', userId: request.user.userId },
        'Tenant endpoint requires facility context'
      );
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'This endpoint requires tenant context (facilityId)', requestId: request.requestId },
      });
    }
  };
}
