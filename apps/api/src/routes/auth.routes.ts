/**
 * Authentication Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { LoginRequestSchema } from '../schemas/index.js';
import type { JwtPayload } from '../plugins/auth.js';
import { logAuthEvent } from '../services/auth-audit.service.js';

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
        error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: parseResult.error.flatten(), requestId: request.requestId },
      });
    }

    const { facilityKey, username, password } = parseResult.data;

    // LAW §3.1: PLATFORM_ADMIN login - use "PLATFORM" as special facility key
    if (facilityKey.toUpperCase() === 'PLATFORM') {
      // Find platform admin user (no facility)
      const result = await query<{
        id: string;
        facility_id: string | null;
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
        WHERE u.facility_id IS NULL AND LOWER(u.username) = LOWER($1)
      `, [username]);

      if (result.rows.length === 0) {
        request.log.warn({ code: 'LOGIN_FAILED', username, reason: 'platform_user_not_found', requestId: request.requestId }, 'Login failed: platform user not found');
        await logAuthEvent({
          eventType: 'LOGIN_FAILED',
          facilityId: null,
          userId: null,
          username,
          userRoles: null,
          success: false,
          failureReason: 'user_not_found',
          requestId: request.requestId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: request.requestId } });
      }

      const user = result.rows[0];

      if (!user.active) {
        request.log.warn({ code: 'LOGIN_FAILED', username, userId: user.id, reason: 'account_disabled', requestId: request.requestId }, 'Login failed: account disabled');
        await logAuthEvent({
          eventType: 'LOGIN_FAILED',
          facilityId: null,
          userId: user.id,
          username,
          userRoles: normalizeRoles(user.roles, user.role),
          success: false,
          failureReason: 'account_disabled',
          requestId: request.requestId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Account is disabled', requestId: request.requestId } });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        request.log.warn({ code: 'LOGIN_FAILED', username, userId: user.id, reason: 'bad_password', requestId: request.requestId }, 'Login failed: invalid password');
        await logAuthEvent({
          eventType: 'LOGIN_FAILED',
          facilityId: null,
          userId: user.id,
          username,
          userRoles: normalizeRoles(user.roles, user.role),
          success: false,
          failureReason: 'bad_password',
          requestId: request.requestId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: request.requestId } });
      }

      const userRoles = normalizeRoles(user.roles, user.role);

      const payload: JwtPayload = {
        userId: user.id,
        facilityId: null, // LAW §3.1: No-tenant identity
        username: user.username,
        email: user.email,
        name: user.name,
        role: userRoles[0] as JwtPayload['role'],
        roles: userRoles as JwtPayload['roles'],
      };

      const token = fastify.jwt.sign(payload);

      request.log.info({ code: 'LOGIN_SUCCESS', userId: user.id, username: user.username, plane: 'control', requestId: request.requestId }, 'Platform admin login successful');
      await logAuthEvent({
        eventType: 'LOGIN_SUCCESS',
        facilityId: null,
        userId: user.id,
        username: user.username,
        userRoles,
        success: true,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: userRoles[0],
          roles: userRoles,
          facilityId: null,
          facilityName: 'Platform',
        },
      });
    }

    // Standard tenant login flow
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
      request.log.warn({ code: 'LOGIN_FAILED', username, reason: 'facility_not_found', requestId: request.requestId }, 'Login failed: facility not found');
      await logAuthEvent({
        eventType: 'LOGIN_FAILED',
        facilityId: null,
        userId: null,
        username,
        userRoles: null,
        success: false,
        failureReason: 'facility_not_found',
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: request.requestId } });
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
      request.log.warn({ code: 'LOGIN_FAILED', username, reason: 'user_not_found', requestId: request.requestId }, 'Login failed: user not found');
      await logAuthEvent({
        eventType: 'LOGIN_FAILED',
        facilityId: facility.id,
        userId: null,
        username,
        userRoles: null,
        success: false,
        failureReason: 'user_not_found',
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: request.requestId } });
    }

    const user = result.rows[0];

    if (!user.active) {
      request.log.warn({ code: 'LOGIN_FAILED', username, userId: user.id, reason: 'account_disabled', requestId: request.requestId }, 'Login failed: account disabled');
      await logAuthEvent({
        eventType: 'LOGIN_FAILED',
        facilityId: facility.id,
        userId: user.id,
        username,
        userRoles: normalizeRoles(user.roles, user.role),
        success: false,
        failureReason: 'account_disabled',
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Account is disabled', requestId: request.requestId } });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      request.log.warn({ code: 'LOGIN_FAILED', username, userId: user.id, reason: 'bad_password', requestId: request.requestId }, 'Login failed: invalid password');
      await logAuthEvent({
        eventType: 'LOGIN_FAILED',
        facilityId: facility.id,
        userId: user.id,
        username,
        userRoles: normalizeRoles(user.roles, user.role),
        success: false,
        failureReason: 'bad_password',
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: request.requestId } });
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
      role: userRoles[0] as JwtPayload['role'], // Primary role (first in array)
      roles: userRoles as JwtPayload['roles'],
    };

    const token = fastify.jwt.sign(payload);

    request.log.info({ code: 'LOGIN_SUCCESS', userId: user.id, username: user.username, facilityId: user.facility_id, requestId: request.requestId }, 'Login successful');
    await logAuthEvent({
      eventType: 'LOGIN_SUCCESS',
      facilityId: user.facility_id,
      userId: user.id,
      username: user.username,
      userRoles,
      success: true,
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

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
    // Get roles (normalize to array)
    const userRoles = normalizeRoles(request.user.roles, request.user.role);

    // LAW §3.1: PLATFORM_ADMIN has no facility
    let facilityName = 'Platform';
    if (request.user.facilityId) {
      const facilityResult = await query<{ name: string }>(`
        SELECT name FROM facility WHERE id = $1
      `, [request.user.facilityId]);
      facilityName = facilityResult.rows[0]?.name || 'Unknown';
    }

    // Demo users: include expiry date for client-side UX
    let demoExpiresAt: string | null = null;
    if (request.user.isDemo) {
      const demoResult = await query<{ expires_at: string }>(
        'SELECT expires_at FROM demo_account WHERE user_id = $1',
        [request.user.userId],
      );
      demoExpiresAt = demoResult.rows[0]?.expires_at ?? null;
    }

    return reply.send({
      user: {
        id: request.user.userId,
        username: request.user.username,
        email: request.user.email,
        name: request.user.name,
        role: userRoles[0], // Primary role (backward compat)
        roles: userRoles,
        facilityId: request.user.facilityId,
        facilityName,
        ...(demoExpiresAt ? { demoExpiresAt } : {}),
      },
    });
  });

  /**
   * POST /auth/logout
   * Log the logout event and invalidate session
   */
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userRoles = normalizeRoles(request.user.roles, request.user.role);

    await logAuthEvent({
      eventType: 'LOGOUT',
      facilityId: request.user.facilityId || null,
      userId: request.user.userId,
      username: request.user.username,
      userRoles,
      success: true,
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    request.log.info({ code: 'LOGOUT', userId: request.user.userId, username: request.user.username, requestId: request.requestId }, 'User logged out');

    return reply.send({ success: true });
  });
}
