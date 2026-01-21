/**
 * Authentication Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { LoginRequestSchema } from '../schemas/index.js';
import type { JwtPayload } from '../plugins/auth.js';

// Helper to normalize roles to always be an array
function normalizeRoles(roles: string[] | string | undefined, fallbackRole: string): string[] {
  if (Array.isArray(roles)) {
    return roles;
  } else if (typeof roles === 'string') {
    return roles.replace(/[{}]/g, '').split(',').filter(Boolean);
  } else {
    return [fallbackRole];
  }
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/login
   * Authenticate user and return JWT (by username)
   */
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityKey, username, password } = parseResult.data;

    // Find facility by key first
    const facilityResult = await query<{
      id: string;
      name: string;
      facility_key: string;
    }>(`
      SELECT id, name, facility_key
      FROM facility
      WHERE facility_key = $1
    `, [facilityKey]);

    if (facilityResult.rows.length === 0) {
      return reply.status(401).send({ error: 'Facility not found' });
    }

    const facility = facilityResult.rows[0];

    // Find user by username within the facility (case-insensitive)
    const result = await query<{
      id: string;
      facility_id: string;
      username: string;
      email: string | null;
      name: string;
      role: string;
      roles: string[];
      password_hash: string;
      active: boolean;
    }>(`
      SELECT u.id, u.facility_id, u.username, u.email, u.name, u.role, u.roles, u.password_hash, u.active
      FROM app_user u
      WHERE u.facility_id = $1 AND LOWER(u.username) = LOWER($2)
    `, [facility.id, username]);

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.active) {
      return reply.status(401).send({ error: 'Account is disabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const facilityName = facility.name;

    // Get roles (normalize to array)
    const userRoles = normalizeRoles(user.roles, user.role);

    // Generate JWT
    const payload: JwtPayload = {
      userId: user.id,
      facilityId: user.facility_id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: userRoles[0] as any, // Primary role (first in array)
      roles: userRoles as any[],
    };

    const token = fastify.jwt.sign(payload);

    return reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: userRoles[0], // Primary role (backward compat)
        roles: userRoles,
        facilityId: user.facility_id,
        facilityName,
      },
    });
  });

  /**
   * GET /auth/me
   * Get current user info
   */
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const facilityResult = await query<{ name: string }>(`
      SELECT name FROM facility WHERE id = $1
    `, [request.user.facilityId]);

    // Get roles (normalize to array)
    const userRoles = normalizeRoles(request.user.roles, request.user.role);

    return reply.send({
      user: {
        id: request.user.userId,
        username: request.user.username,
        email: request.user.email,
        name: request.user.name,
        role: userRoles[0], // Primary role (backward compat)
        roles: userRoles,
        facilityId: request.user.facilityId,
        facilityName: facilityResult.rows[0]?.name || 'Unknown',
      },
    });
  });
}
