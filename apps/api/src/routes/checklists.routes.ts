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
  recordAsyncReview,
  getPendingReviews,
  getChecklistTemplates,
  getChecklistTemplateByType,
  updateChecklistTemplateItems,
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
  // CHECKLIST TEMPLATES
  // ============================================================================

  /**
   * GET /checklists/templates
   * Get all checklist templates for facility
   */
  fastify.get('/checklists/templates', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId, role } = request.user;

    // Admin only
    if (role !== 'ADMIN') {
      return reply.status(403).send({
        error: 'Only administrators can view checklist templates',
      });
    }

    const templates = await getChecklistTemplates(facilityId);

    return reply.send({ templates });
  });

  /**
   * GET /checklists/templates/:type
   * Get a specific checklist template
   */
  fastify.get('/checklists/templates/:type', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { type: string };
  }>, reply: FastifyReply) => {
    const { type } = request.params;
    const { facilityId, role } = request.user;

    // Admin only
    if (role !== 'ADMIN') {
      return reply.status(403).send({
        error: 'Only administrators can view checklist templates',
      });
    }

    const upperType = type.toUpperCase() as 'TIMEOUT' | 'DEBRIEF';
    if (upperType !== 'TIMEOUT' && upperType !== 'DEBRIEF') {
      return reply.status(400).send({
        error: 'Invalid template type. Must be TIMEOUT or DEBRIEF',
      });
    }

    const template = await getChecklistTemplateByType(facilityId, upperType);

    if (!template) {
      return reply.status(404).send({
        error: `No ${upperType} template found`,
      });
    }

    return reply.send(template);
  });

  /**
   * PUT /checklists/templates/:type
   * Update checklist template items (creates a new version)
   */
  fastify.put('/checklists/templates/:type', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { type: string };
    Body: {
      items: Array<{
        key: string;
        label: string;
        type: 'checkbox' | 'select' | 'text' | 'readonly';
        required: boolean;
        options?: string[];
      }>;
      requiredSignatures: Array<{
        role: string;
        required: boolean;
        conditional?: boolean;
        conditions?: string[];
      }>;
    };
  }>, reply: FastifyReply) => {
    const { type } = request.params;
    const { facilityId, userId, role } = request.user;

    // Admin only
    if (role !== 'ADMIN') {
      return reply.status(403).send({
        error: 'Only administrators can update checklist templates',
      });
    }

    const upperType = type.toUpperCase() as 'TIMEOUT' | 'DEBRIEF';
    if (upperType !== 'TIMEOUT' && upperType !== 'DEBRIEF') {
      return reply.status(400).send({
        error: 'Invalid template type. Must be TIMEOUT or DEBRIEF',
      });
    }

    const body = request.body as {
      items: Array<{
        key: string;
        label: string;
        type: 'checkbox' | 'select' | 'text' | 'readonly';
        required: boolean;
        options?: string[];
      }>;
      requiredSignatures: Array<{
        role: string;
        required: boolean;
        conditional?: boolean;
        conditions?: string[];
      }>;
    };

    if (!body.items || !Array.isArray(body.items)) {
      return reply.status(400).send({
        error: 'Items array is required',
      });
    }

    if (!body.requiredSignatures || !Array.isArray(body.requiredSignatures)) {
      return reply.status(400).send({
        error: 'Required signatures array is required',
      });
    }

    try {
      const updated = await updateChecklistTemplateItems(
        facilityId,
        upperType,
        body.items,
        body.requiredSignatures,
        userId
      );

      return reply.send(updated);
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Failed to update template',
      });
    }
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

  // ============================================================================
  // ASYNC REVIEW (SCRUB/SURGEON signing after debrief completion)
  // ============================================================================

  /**
   * POST /cases/:id/checklists/debrief/async-review
   * Record an async review for a completed debrief (SCRUB or SURGEON)
   */
  fastify.post('/cases/:id/checklists/debrief/async-review', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: { notes?: string; method: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { facilityId, userId, role } = request.user;

    // Only SCRUB or SURGEON can do async review
    if (role !== 'SCRUB' && role !== 'SURGEON') {
      return reply.status(403).send({
        error: 'Only SCRUB or SURGEON can perform async reviews',
      });
    }

    const body = request.body as { notes?: string; method: string };
    const { notes, method } = body;

    if (!method) {
      return reply.status(400).send({
        error: 'Signature method is required',
      });
    }

    // Get checklist instance
    const checklistsResult = await getChecklistsForCase(id, facilityId);
    const instance = checklistsResult.debrief;

    if (!instance) {
      return reply.status(404).send({
        error: 'DEBRIEF checklist not found for this case',
      });
    }

    try {
      const updated = await recordAsyncReview(
        instance.id,
        role as 'SCRUB' | 'SURGEON',
        userId,
        notes || null,
        method,
        facilityId
      );
      return reply.send(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // ============================================================================
  // PENDING REVIEWS (Admin accountability view)
  // ============================================================================

  /**
   * GET /pending-reviews
   * Get all pending SCRUB/SURGEON reviews for the facility
   * Admin accountability view
   */
  fastify.get('/pending-reviews', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId, role } = request.user;

    // Only admin can view all pending reviews
    if (role !== 'ADMIN') {
      return reply.status(403).send({
        error: 'Only administrators can view pending reviews',
      });
    }

    const pendingReviews = await getPendingReviews(facilityId);

    return reply.send({
      pendingReviews,
      total: pendingReviews.length,
    });
  });

  /**
   * GET /my-pending-reviews
   * Get pending reviews for the current user (SCRUB or SURGEON)
   */
  fastify.get('/my-pending-reviews', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId, role } = request.user;

    // Only SCRUB or SURGEON have pending reviews
    if (role !== 'SCRUB' && role !== 'SURGEON') {
      return reply.send({
        pendingReviews: [],
        total: 0,
      });
    }

    const allPending = await getPendingReviews(facilityId);

    // Filter to only reviews pending for this user's role
    const myPending = allPending.filter(review => {
      if (role === 'SCRUB') return review.pendingScrub;
      if (role === 'SURGEON') return review.pendingSurgeon;
      return false;
    });

    return reply.send({
      pendingReviews: myPending,
      total: myPending.length,
    });
  });
}
