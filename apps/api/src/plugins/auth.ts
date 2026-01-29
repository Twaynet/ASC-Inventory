/**
 * Authentication Plugin
 * JWT-based auth with role-based and capability-based access control
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { UserRole } from '@asc/domain';

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

// ============================================================================
// Capability system — single source of truth for role → capability mapping
// ============================================================================

export type Capability =
  | 'CASE_VIEW'
  | 'VERIFY_SCAN'
  | 'CHECKLIST_ATTEST'
  | 'OR_DEBRIEF'
  | 'OR_TIMEOUT'
  | 'INVENTORY_READ'
  | 'INVENTORY_CHECKIN'
  | 'INVENTORY_MANAGE'
  | 'USER_MANAGE'
  | 'LOCATION_MANAGE'
  | 'CATALOG_MANAGE'
  | 'REPORTS_VIEW'
  | 'SETTINGS_MANAGE';

export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  SCRUB: ['CASE_VIEW', 'VERIFY_SCAN', 'CHECKLIST_ATTEST'],
  CIRCULATOR: ['CASE_VIEW', 'CHECKLIST_ATTEST', 'OR_DEBRIEF', 'OR_TIMEOUT'],
  INVENTORY_TECH: ['INVENTORY_READ', 'INVENTORY_CHECKIN'],
  ADMIN: [
    'USER_MANAGE', 'LOCATION_MANAGE', 'CATALOG_MANAGE',
    'INVENTORY_MANAGE', 'REPORTS_VIEW', 'SETTINGS_MANAGE', 'CASE_VIEW',
  ],
  SURGEON: ['CASE_VIEW', 'CHECKLIST_ATTEST'],
  SCHEDULER: ['CASE_VIEW'],
  ANESTHESIA: ['CASE_VIEW', 'CHECKLIST_ATTEST'],
};

/**
 * Derive the UNION of all capabilities from a user's roles array.
 */
export function deriveCapabilities(roles: UserRole[]): Capability[] {
  const caps = new Set<Capability>();
  for (const role of roles) {
    for (const cap of (ROLE_CAPABILITIES[role] || [])) {
      caps.add(cap);
    }
  }
  return Array.from(caps);
}

/**
 * Normalize to roles[] — always returns an array regardless of input shape.
 */
export function getUserRoles(user: JwtPayload): UserRole[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
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
