/**
 * Vendor Routes
 * Wave 1: Financial Attribution - Vendor management
 * ADMIN-only endpoints for vendor CRUD
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';
import { getVendorRepository } from '../repositories/index.js';
import { VendorType } from '../repositories/interfaces/vendor.repository.js';

const VENDOR_TYPES: VendorType[] = ['MANUFACTURER', 'DISTRIBUTOR', 'LOANER_PROVIDER', 'CONSIGNMENT'];

function formatVendor(vendor: {
  id: string;
  facilityId: string;
  name: string;
  vendorType: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: vendor.id,
    name: vendor.name,
    vendorType: vendor.vendorType,
    contactName: vendor.contactName,
    contactEmail: vendor.contactEmail,
    contactPhone: vendor.contactPhone,
    isActive: vendor.isActive,
    notes: vendor.notes,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
  };
}

export async function vendorsRoutes(fastify: FastifyInstance): Promise<void> {
  const vendorRepo = getVendorRepository();

  /**
   * GET /vendors
   * List all vendors for facility (ADMIN only)
   */
  fastify.get<{
    Querystring: {
      vendorType?: string;
      isActive?: string;
      search?: string;
    };
  }>('/', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Querystring: {
      vendorType?: string;
      isActive?: string;
      search?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { vendorType, isActive, search } = request.query;

    const filters: { vendorType?: VendorType; isActive?: boolean; search?: string } = {};

    if (vendorType && VENDOR_TYPES.includes(vendorType as VendorType)) {
      filters.vendorType = vendorType as VendorType;
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    if (search) {
      filters.search = search;
    }

    const vendors = await vendorRepo.findMany(facilityId, filters);

    return ok(reply, { vendors: vendors.map(formatVendor) });
  });

  /**
   * GET /vendors/:vendorId
   * Get single vendor (ADMIN only)
   */
  fastify.get<{ Params: { vendorId: string } }>('/:vendorId', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{ Params: { vendorId: string } }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { vendorId } = request.params;

    const vendor = await vendorRepo.findById(vendorId, facilityId);
    if (!vendor) {
      return fail(reply, 'NOT_FOUND', 'Vendor not found', 404);
    }

    return ok(reply, { vendor: formatVendor(vendor) });
  });

  /**
   * POST /vendors
   * Create new vendor (ADMIN only)
   */
  fastify.post<{
    Body: {
      name: string;
      vendorType: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
    };
  }>('/', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Body: {
      name: string;
      vendorType: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { name, vendorType, contactName, contactEmail, contactPhone, notes } = request.body;

    // Validate required fields
    if (!name?.trim()) {
      return fail(reply, 'VALIDATION_ERROR', 'Name is required');
    }
    if (!vendorType || !VENDOR_TYPES.includes(vendorType as VendorType)) {
      return fail(reply, 'VALIDATION_ERROR', `Invalid vendorType. Must be one of: ${VENDOR_TYPES.join(', ')}`);
    }

    // Check for duplicate name
    const existing = await vendorRepo.findByName(name.trim(), facilityId);
    if (existing) {
      return fail(reply, 'DUPLICATE', 'A vendor with this name already exists');
    }

    const vendor = await vendorRepo.create({
      facilityId,
      name: name.trim(),
      vendorType: vendorType as VendorType,
      contactName: contactName?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      notes: notes?.trim() || null,
    });

    return ok(reply, { vendor: formatVendor(vendor) }, 201);
  });

  /**
   * PATCH /vendors/:vendorId
   * Update vendor (ADMIN only)
   */
  fastify.patch<{
    Params: { vendorId: string };
    Body: {
      name?: string;
      vendorType?: string;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      isActive?: boolean;
      notes?: string | null;
    };
  }>('/:vendorId', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest<{
    Params: { vendorId: string };
    Body: {
      name?: string;
      vendorType?: string;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      isActive?: boolean;
      notes?: string | null;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;
    const { vendorId } = request.params;
    const data = request.body;

    // Check vendor exists
    const existing = await vendorRepo.findById(vendorId, facilityId);
    if (!existing) {
      return fail(reply, 'NOT_FOUND', 'Vendor not found', 404);
    }

    // Validate vendorType if provided
    if (data.vendorType && !VENDOR_TYPES.includes(data.vendorType as VendorType)) {
      return fail(reply, 'VALIDATION_ERROR', `Invalid vendorType. Must be one of: ${VENDOR_TYPES.join(', ')}`);
    }

    // Check name uniqueness if changing
    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const nameCheck = await vendorRepo.findByName(data.name.trim(), facilityId);
      if (nameCheck && nameCheck.id !== vendorId) {
        return fail(reply, 'DUPLICATE', 'A vendor with this name already exists');
      }
    }

    const updated = await vendorRepo.update(vendorId, facilityId, {
      name: data.name?.trim(),
      vendorType: data.vendorType as VendorType | undefined,
      contactName: data.contactName !== undefined ? (data.contactName?.trim() || null) : undefined,
      contactEmail: data.contactEmail !== undefined ? (data.contactEmail?.trim() || null) : undefined,
      contactPhone: data.contactPhone !== undefined ? (data.contactPhone?.trim() || null) : undefined,
      isActive: data.isActive,
      notes: data.notes !== undefined ? (data.notes?.trim() || null) : undefined,
    });

    if (!updated) {
      return fail(reply, 'NOT_FOUND', 'Vendor not found', 404);
    }

    return ok(reply, { vendor: formatVendor(updated) });
  });
}
