/**
 * User Management Routes
 * ADMIN-only endpoints for onboarding/offboarding users
 */

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import {
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
} from '../schemas/index.js';
import { requireAdmin } from '../plugins/auth.js';

interface UserRow {
  id: string;
  facility_id: string;
  username: string;
  email: string | null;
  name: string;
  role: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /users
   * List all users in facility (ADMIN only)
   */
  fastify.get<{ Querystring: { includeInactive?: string } }>('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const includeInactive = request.query.includeInactive === 'true';

    let sql = `
      SELECT id, facility_id, username, email, name, role, active, created_at, updated_at
      FROM app_user
      WHERE facility_id = $1
    `;

    if (!includeInactive) {
      sql += ` AND active = true`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await query<UserRow>(sql, [facilityId]);

    return reply.send({
      users: result.rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * GET /users/surgeons
   * Get list of surgeons (all authenticated users)
   * Used for case request forms
   */
  fastify.get('/surgeons', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    const result = await query<UserRow>(`
      SELECT id, name
      FROM app_user
      WHERE facility_id = $1 AND role = 'SURGEON' AND active = true
      ORDER BY name ASC
    `, [facilityId]);

    return reply.send({
      users: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        role: 'SURGEON',
      })),
    });
  });

  /**
   * GET /users/:id
   * Get single user details (ADMIN only)
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<UserRow>(`
      SELECT id, facility_id, username, email, name, role, active, created_at, updated_at
      FROM app_user
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const row = result.rows[0];
    return reply.send({
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /users
   * Create new user (onboard) - ADMIN only
   */
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateUserRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Check username uniqueness
    const existingUser = await query(`
      SELECT id FROM app_user
      WHERE facility_id = $1 AND LOWER(username) = LOWER($2)
    `, [facilityId, data.username]);

    if (existingUser.rows.length > 0) {
      return reply.status(400).send({ error: 'Username already exists in this facility' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const result = await query<UserRow>(`
      INSERT INTO app_user (facility_id, username, email, name, role, password_hash, active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, facility_id, username, email, name, role, active, created_at, updated_at
    `, [facilityId, data.username, data.email || null, data.name, data.role, passwordHash]);

    const row = result.rows[0];
    return reply.status(201).send({
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * PATCH /users/:id
   * Update user - ADMIN only
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateUserRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check user exists
    const existingResult = await query<{ role: string }>(`
      SELECT role FROM app_user WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // If updating to ADMIN, require email
    const newRole = data.role || existingResult.rows[0].role;
    if (newRole === 'ADMIN' && data.email === null) {
      return reply.status(400).send({ error: 'Email is required for ADMIN role' });
    }

    // If changing username, check uniqueness
    if (data.username) {
      const usernameCheck = await query(`
        SELECT id FROM app_user
        WHERE facility_id = $1 AND LOWER(username) = LOWER($2) AND id != $3
      `, [facilityId, data.username, id]);

      if (usernameCheck.rows.length > 0) {
        return reply.status(400).send({ error: 'Username already exists in this facility' });
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(data.username);
    }
    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }
    if (data.password !== undefined) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    values.push(id, facilityId);

    const result = await query<UserRow>(`
      UPDATE app_user
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING id, facility_id, username, email, name, role, active, created_at, updated_at
    `, values);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const row = result.rows[0];
    return reply.send({
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /users/:id/deactivate
   * Deactivate user (offboard) - ADMIN only
   */
  fastify.post<{ Params: { id: string } }>('/:id/deactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId, userId } = request.user;

    // Cannot deactivate yourself
    if (id === userId) {
      return reply.status(400).send({ error: 'Cannot deactivate your own account' });
    }

    // Check if user exists and is currently active
    const existingResult = await query<{ role: string; active: boolean }>(`
      SELECT role, active FROM app_user WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (!existingResult.rows[0].active) {
      return reply.status(400).send({ error: 'User is already deactivated' });
    }

    // Check if this is the last active ADMIN
    if (existingResult.rows[0].role === 'ADMIN') {
      const adminCount = await query<{ count: string }>(`
        SELECT COUNT(*) as count FROM app_user
        WHERE facility_id = $1 AND role = 'ADMIN' AND active = true AND id != $2
      `, [facilityId, id]);

      if (parseInt(adminCount.rows[0].count) === 0) {
        return reply.status(400).send({ error: 'Cannot deactivate the last admin' });
      }
    }

    // Deactivate user
    await query(`
      UPDATE app_user
      SET active = false, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });

  /**
   * POST /users/:id/activate
   * Reactivate user - ADMIN only
   */
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Check if user exists
    const existingResult = await query<{ active: boolean }>(`
      SELECT active FROM app_user WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (existingResult.rows[0].active) {
      return reply.status(400).send({ error: 'User is already active' });
    }

    // Activate user
    await query(`
      UPDATE app_user
      SET active = true, updated_at = NOW()
      WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    return reply.send({ success: true });
  });
}
