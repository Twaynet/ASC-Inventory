/**
 * Loaner Set Routes
 * Wave 1: Financial Attribution - Loaner tracking
 * ADMIN-only endpoints for loaner set management
 *
 * LAW COMPLIANCE:
 * - Loaner return creates an inventory_event (LOANER_RETURNED)
 * - All mutations are append-only to event log
 * - No retroactive editing of loaner sets
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';
import { getLoanerSetRepository, getVendorRepository, getInventoryRepository } from '../repositories/index.js';
import { query } from '../db/index.js';

function formatLoanerSet(set: {
  id: string;
  facilityId: string;
  vendorId: string;
  vendorName?: string;
  setIdentifier: string;
  description: string | null;
  caseId: string | null;
  caseName?: string | null;
  receivedAt: Date;
  receivedByUserId: string;
  receivedByUserName?: string;
  expectedReturnDate: Date | null;
  returnedAt: Date | null;
  returnedByUserId: string | null;
  returnedByUserName?: string | null;
  itemCount: number | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: set.id,
    vendorId: set.vendorId,
    vendorName: set.vendorName,
    setIdentifier: set.setIdentifier,
    description: set.description,
    caseId: set.caseId,
    caseName: set.caseName,
    receivedAt: set.receivedAt.toISOString(),
    receivedByUserId: set.receivedByUserId,
    receivedByUserName: set.receivedByUserName,
    expectedReturnDate: set.expectedReturnDate?.toISOString().split('T')[0] || null,
    returnedAt: set.returnedAt?.toISOString() || null,
    returnedByUserId: set.returnedByUserId,
    returnedByUserName: set.returnedByUserName,
    itemCount: set.itemCount,
    notes: set.notes,
    createdAt: set.createdAt.toISOString(),
    isOpen: set.returnedAt === null,
    isOverdue: set.returnedAt === null && set.expectedReturnDate !== null && new Date(set.expectedReturnDate) < new Date(),
  };
}

export async function loanerSetsRoutes(fastify: FastifyInstance): Promise<void> {
  const loanerSetRepo = getLoanerSetRepository();
  const vendorRepo = getVendorRepository();
  const inventoryRepo = getInventoryRepository();

  /**
   * GET /loaner-sets
   * List all loaner sets (ADMIN only)
   */
  fastify.get<{
    Querystring: {
      vendorId?: string;
      caseId?: string;
      isOpen?: string;
      isOverdue?: string;
    };
  }>('/', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Querystring: {
      vendorId?: string;
      caseId?: string;
      isOpen?: string;
      isOverdue?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { vendorId, caseId, isOpen, isOverdue } = request.query;

    const filters: {
      vendorId?: string;
      caseId?: string;
      isOpen?: boolean;
      isOverdue?: boolean;
    } = {};

    if (vendorId) filters.vendorId = vendorId;
    if (caseId) filters.caseId = caseId;
    if (isOpen !== undefined) filters.isOpen = isOpen === 'true';
    if (isOverdue !== undefined) filters.isOverdue = isOverdue === 'true';

    const sets = await loanerSetRepo.findMany(facilityId, filters);

    return ok(reply, { loanerSets: sets.map(formatLoanerSet) });
  });

  /**
   * GET /loaner-sets/open
   * List all open (unreturned) loaner sets (ADMIN only)
   */
  fastify.get('/open', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const sets = await loanerSetRepo.findOpenSets(facilityId);

    return ok(reply, { loanerSets: sets.map(formatLoanerSet) });
  });

  /**
   * GET /loaner-sets/overdue
   * List all overdue loaner sets (ADMIN only)
   */
  fastify.get('/overdue', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    const sets = await loanerSetRepo.findOverdueSets(facilityId);

    return ok(reply, { loanerSets: sets.map(formatLoanerSet) });
  });

  /**
   * GET /loaner-sets/:loanerSetId
   * Get single loaner set (ADMIN only)
   */
  fastify.get<{ Params: { loanerSetId: string } }>('/:loanerSetId', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{ Params: { loanerSetId: string } }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { loanerSetId } = request.params;

    const set = await loanerSetRepo.findById(loanerSetId, facilityId);
    if (!set) {
      return fail(reply, 'NOT_FOUND', 'Loaner set not found', 404);
    }

    return ok(reply, { loanerSet: formatLoanerSet(set) });
  });

  /**
   * POST /loaner-sets
   * Receive/create new loaner set (ADMIN only)
   */
  fastify.post<{
    Body: {
      vendorId: string;
      setIdentifier: string;
      description?: string;
      caseId?: string;
      receivedAt?: string;
      expectedReturnDate?: string;
      itemCount?: number;
      notes?: string;
    };
  }>('/', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Body: {
      vendorId: string;
      setIdentifier: string;
      description?: string;
      caseId?: string;
      receivedAt?: string;
      expectedReturnDate?: string;
      itemCount?: number;
      notes?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;
    const { vendorId, setIdentifier, description, caseId, receivedAt, expectedReturnDate, itemCount, notes } = request.body;

    // Validate required fields
    if (!vendorId) {
      return fail(reply, 'VALIDATION_ERROR', 'vendorId is required');
    }
    if (!setIdentifier?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'setIdentifier is required');
    }

    // Verify vendor exists and is a LOANER_PROVIDER
    const vendor = await vendorRepo.findById(vendorId, facilityId);
    if (!vendor) {
      return fail(reply, 'NOT_FOUND', 'Vendor not found', 404);
    }
    if (vendor.vendorType !== 'LOANER_PROVIDER') {
      return fail(reply, 'VALIDATION_ERROR', 'Vendor must be of type LOANER_PROVIDER to receive loaner sets');
    }
    if (!vendor.isActive) {
      return fail(reply, 'VALIDATION_ERROR', 'Vendor is inactive');
    }

    // Verify case exists if provided
    if (caseId) {
      const caseCheck = await query(`SELECT id FROM surgical_case WHERE id = $1 AND facility_id = $2`, [caseId, facilityId]);
      if (caseCheck.rows.length === 0) {
        return fail(reply, 'NOT_FOUND', 'Case not found', 404);
      }
    }

    const set = await loanerSetRepo.create({
      facilityId,
      vendorId,
      setIdentifier: setIdentifier.trim(),
      description: description?.trim() || null,
      caseId: caseId || null,
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      receivedByUserId: userId,
      expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
      itemCount: itemCount ?? null,
      notes: notes?.trim() || null,
    });

    return ok(reply, { loanerSet: formatLoanerSet(set) }, 201);
  });

  /**
   * POST /loaner-sets/:loanerSetId/return
   * Mark loaner set as returned (ADMIN only)
   *
   * LAW COMPLIANCE:
   * - Creates LOANER_RETURNED inventory events for all linked items
   * - This is an append-only operation
   */
  fastify.post<{
    Params: { loanerSetId: string };
    Body: {
      returnedAt?: string;
      notes?: string;
    };
  }>('/:loanerSetId/return', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Params: { loanerSetId: string };
    Body: {
      returnedAt?: string;
      notes?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId, userId } = request.user;
    const { loanerSetId } = request.params;
    const { returnedAt, notes } = request.body;

    // Check loaner set exists
    const existing = await loanerSetRepo.findById(loanerSetId, facilityId);
    if (!existing) {
      return fail(reply, 'NOT_FOUND', 'Loaner set not found', 404);
    }
    if (existing.returnedAt) {
      return fail(reply, 'ALREADY_RETURNED', 'Loaner set is already marked as returned');
    }

    const returnDate = returnedAt ? new Date(returnedAt) : new Date();

    // Find all inventory items linked to this loaner set
    const linkedItems = await query<{ id: string }>(`
      SELECT id FROM inventory_item
      WHERE facility_id = $1 AND loaner_set_id = $2
    `, [facilityId, loanerSetId]);

    // Create LOANER_RETURNED events for each linked item
    for (const item of linkedItems.rows) {
      await inventoryRepo.createEvent({
        facilityId,
        inventoryItemId: item.id,
        eventType: 'LOANER_RETURNED',
        notes: `Loaner set ${existing.setIdentifier} returned${notes ? `: ${notes}` : ''}`,
        performedByUserId: userId,
        occurredAt: returnDate,
      });

      // Update the item's loaner_returned_at
      await query(`
        UPDATE inventory_item
        SET loaner_returned_at = $1, updated_at = NOW()
        WHERE id = $2
      `, [returnDate, item.id]);
    }

    // Mark loaner set as returned
    const updated = await loanerSetRepo.markReturned(loanerSetId, facilityId, {
      returnedAt: returnDate,
      returnedByUserId: userId,
      notes: notes?.trim() || null,
    });

    return ok(reply, {
      loanerSet: updated ? formatLoanerSet(updated) : null,
      itemsReturned: linkedItems.rows.length,
    });
  });
}
