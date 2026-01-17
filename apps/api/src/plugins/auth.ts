/**
 * Authentication Plugin
 * JWT-based auth with role-based access control
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
  role: UserRole;
}

// Extend @fastify/jwt module to type the user property
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
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

// Role-based authorization decorator
export function requireRoles(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // First, verify JWT
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Then check role
    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Required roles: ${allowedRoles.join(', ')}`,
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
