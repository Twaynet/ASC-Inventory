/**
 * Authentication Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { LoginRequestSchema } from '../schemas/index.js';
import type { JwtPayload } from '../plugins/auth.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/login
   * Authenticate user and return JWT
   */
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { email, password } = parseResult.data;

    // Find user by email (case-insensitive)
    const result = await query<{
      id: string;
      facility_id: string;
      email: string;
      name: string;
      role: string;
      password_hash: string;
      active: boolean;
    }>(`
      SELECT u.id, u.facility_id, u.email, u.name, u.role, u.password_hash, u.active
      FROM app_user u
      WHERE LOWER(u.email) = LOWER($1)
    `, [email]);

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

    // Get facility name
    const facilityResult = await query<{ name: string }>(`
      SELECT name FROM facility WHERE id = $1
    `, [user.facility_id]);

    const facilityName = facilityResult.rows[0]?.name || 'Unknown';

    // Generate JWT
    const payload: JwtPayload = {
      userId: user.id,
      facilityId: user.facility_id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    };

    const token = fastify.jwt.sign(payload);

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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

    return reply.send({
      user: {
        id: request.user.userId,
        email: request.user.email,
        name: request.user.name,
        role: request.user.role,
        facilityId: request.user.facilityId,
        facilityName: facilityResult.rows[0]?.name || 'Unknown',
      },
    });
  });
}
