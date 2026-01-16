/**
 * Checklists Routes
 * OR Time Out and Post-op Debrief checklist endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  StartChecklistRequestSchema,
  RespondChecklistRequestSchema,
  SignChecklistRequestSchema,
  UpdateFacilitySettingsRequestSchema,
} from '../schemas/index.js';
import {
  getFacilitySettings,
  updateFacilitySettings,
  getChecklistsForCase,
  startChecklist,
  recordResponse,
  addSignature,
  completeChecklist,
  getRooms,
} from '../services/checklists.service.js';

export async function checklistsRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================================================
  // FACILITY SETTINGS
  // ============================================================================

  /**
   * GET /facility/settings
   * Get facility settings including feature flags
   */
  fastify.get('/facility/settings', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const settings = await getFacilitySettings(facilityId);

    if (!settings) {
      // Return defaults if no settings exist
      return reply.send({
        facilityId,
        enableTimeoutDebrief: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return reply.send(settings);
  });

  /**
   * PATCH /facility/settings
   * Update facility settings (Admin only)
   */
  fastify.patch('/facility/settings', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId, role } = request.user;

    // Admin only
    if (role !== 'ADMIN') {
      return reply.status(403).send({
        error: 'Only administrators can modify facility settings',
      });
    }

    const parseResult = UpdateFacilitySettingsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const settings = await updateFacilitySettings(facilityId, parseResult.data);

    return reply.send(settings);
  });

  // ============================================================================
  // ROOMS
  // ============================================================================

  /**
   * GET /rooms
   * Get all active rooms for facility
   */
  fastify.get('/rooms', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const rooms = await getRooms(facilityId);

    return reply.send({ rooms });
  });

  // ============================================================================
  // CASE CHECKLISTS
  // ============================================================================

  /**
   * GET /cases/:id/checklists
   * Get all checklists for a case
   */
  fastify.get('/cases/:id/checklists', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await getChecklistsForCase(id, facilityId);

    return reply.send({
      caseId: id,
      ...result,
    });
  });

  /**
   * POST /cases/:id/checklists/start
   * Start a checklist for a case
   */
  fastify.post('/cases/:id/checklists/start', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId, userId, role } = request.user;

    // Only staff roles can start checklists
    const allowedRoles = ['ADMIN', 'CIRCULATOR', 'SURGEON', 'SCRUB'];
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: 'Only authorized staff can start checklists',
      });
    }

    const parseResult = StartChecklistRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { type, roomId } = parseResult.data;

    try {
      const instance = await startChecklist(id, facilityId, type, userId, roomId);
      return reply.status(201).send(instance);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * POST /cases/:id/checklists/:type/respond
   * Record a response to a checklist item
   */
  fastify.post('/cases/:id/checklists/:type/respond', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string; type: string };
  }>, reply: FastifyReply) => {
    const { id, type } = request.params;
    const { facilityId, userId, role } = request.user;

    // Only staff roles can respond to checklists
    const allowedRoles = ['ADMIN', 'CIRCULATOR', 'SURGEON', 'SCRUB', 'ANESTHESIA'];
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: 'Only authorized staff can respond to checklists',
      });
    }

    const parseResult = RespondChecklistRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { itemKey, value } = parseResult.data;

    // Get checklist instance ID
    const checklistsResult = await getChecklistsForCase(id, facilityId);
    const instance = type === 'TIMEOUT' ? checklistsResult.timeout : checklistsResult.debrief;

    if (!instance) {
      return reply.status(404).send({
        error: `${type} checklist not found. Please start the checklist first.`,
      });
    }

    try {
      const updated = await recordResponse(instance.id, itemKey, value, userId, facilityId);
      return reply.send(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * POST /cases/:id/checklists/:type/sign
   * Add a signature to a checklist
   */
  fastify.post('/cases/:id/checklists/:type/sign', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string; type: string };
  }>, reply: FastifyReply) => {
    const { id, type } = request.params;
    const { facilityId, userId, role } = request.user;

    const parseResult = SignChecklistRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { method } = parseResult.data;

    // Get checklist instance ID
    const checklistsResult = await getChecklistsForCase(id, facilityId);
    const instance = type === 'TIMEOUT' ? checklistsResult.timeout : checklistsResult.debrief;

    if (!instance) {
      return reply.status(404).send({
        error: `${type} checklist not found. Please start the checklist first.`,
      });
    }

    // Map user role to signature role
    // Users can sign for their role
    const roleMapping: Record<string, string> = {
      'CIRCULATOR': 'CIRCULATOR',
      'SURGEON': 'SURGEON',
      'SCRUB': 'SCRUB',
      'ADMIN': 'CIRCULATOR', // Admins sign as circulator if needed
    };

    // Also allow ANESTHESIA role
    if (role === 'ANESTHESIA') {
      roleMapping['ANESTHESIA'] = 'ANESTHESIA';
    }

    const signatureRole = roleMapping[role];
    if (!signatureRole) {
      return reply.status(403).send({
        error: `Role ${role} cannot sign checklists`,
      });
    }

    try {
      const updated = await addSignature(instance.id, signatureRole, userId, method, facilityId);
      return reply.send(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * POST /cases/:id/checklists/:type/complete
   * Complete a checklist
   */
  fastify.post('/cases/:id/checklists/:type/complete', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string; type: string };
  }>, reply: FastifyReply) => {
    const { id, type } = request.params;
    const { facilityId, role } = request.user;

    // Only circulator or admin can complete checklists
    const allowedRoles = ['ADMIN', 'CIRCULATOR'];
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: 'Only circulator or admin can complete checklists',
      });
    }

    // Get checklist instance ID
    const checklistsResult = await getChecklistsForCase(id, facilityId);
    const instance = type === 'TIMEOUT' ? checklistsResult.timeout : checklistsResult.debrief;

    if (!instance) {
      return reply.status(404).send({
        error: `${type} checklist not found. Please start the checklist first.`,
      });
    }

    try {
      const updated = await completeChecklist(instance.id, facilityId);
      return reply.send(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
