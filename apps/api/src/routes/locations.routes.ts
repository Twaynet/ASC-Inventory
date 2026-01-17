/**
 * Location Management Routes
 * CRUD endpoints for storage locations
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateLocationRequestSchema,
  UpdateLocationRequestSchema,
} from '../schemas/index.js';
import { requireAdmin } from '../plugins/auth.js';

interface LocationRow {
  id: string;
  facility_id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
  parent_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LocationWithCounts extends LocationRow {
  child_count: string;
  item_count: string;
}

export async function locationsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /locations
   * List all locations in facility
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    const result = await query<LocationWithCounts>(`
      SELECT
        l.id, l.facility_id, l.name, l.description,
        l.parent_location_id, p.name as parent_name,
        l.created_at, l.updated_at,
        (SELECT COUNT(*) FROM location c WHERE c.parent_location_id = l.id) as child_count,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.location_id = l.id) as item_count
      FROM location l
      LEFT JOIN location p ON l.parent_location_id = p.id
      WHERE l.facility_id = $1
      ORDER BY l.name ASC
    `, [facilityId]);

    return reply.send({
      locations: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        parentLocationId: row.parent_location_id,
        parentName: row.parent_name,
        childCount: parseInt(row.child_count),
        itemCount: parseInt(row.item_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  });

  /**
   * GET /locations/:id
   * Get single location details
   */
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const result = await query<LocationWithCounts>(`
      SELECT
        l.id, l.facility_id, l.name, l.description,
        l.parent_location_id, p.name as parent_name,
        l.created_at, l.updated_at,
        (SELECT COUNT(*) FROM location c WHERE c.parent_location_id = l.id) as child_count,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.location_id = l.id) as item_count
      FROM location l
      LEFT JOIN location p ON l.parent_location_id = p.id
      WHERE l.id = $1 AND l.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    const row = result.rows[0];
    return reply.send({
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        parentLocationId: row.parent_location_id,
        parentName: row.parent_name,
        childCount: parseInt(row.child_count),
        itemCount: parseInt(row.item_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * POST /locations
   * Create new location (ADMIN only)
   */
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const parseResult = CreateLocationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { facilityId } = request.user;
    const data = parseResult.data;

    // Verify parent location exists if specified
    if (data.parentLocationId) {
      const parentCheck = await query(`
        SELECT id FROM location WHERE id = $1 AND facility_id = $2
      `, [data.parentLocationId, facilityId]);

      if (parentCheck.rows.length === 0) {
        return reply.status(400).send({ error: 'Parent location not found' });
      }
    }

    // Check name uniqueness within facility
    const nameCheck = await query(`
      SELECT id FROM location WHERE facility_id = $1 AND LOWER(name) = LOWER($2)
    `, [facilityId, data.name]);

    if (nameCheck.rows.length > 0) {
      return reply.status(400).send({ error: 'Location name already exists' });
    }

    const result = await query<LocationRow>(`
      INSERT INTO location (facility_id, name, description, parent_location_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, facility_id, name, description, parent_location_id, created_at, updated_at
    `, [facilityId, data.name, data.description || null, data.parentLocationId || null]);

    const row = result.rows[0];
    return reply.status(201).send({
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        parentLocationId: row.parent_location_id,
        parentName: null,
        childCount: 0,
        itemCount: 0,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * PATCH /locations/:id
   * Update location (ADMIN only)
   */
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateLocationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Check location exists
    const existingResult = await query(`
      SELECT id FROM location WHERE id = $1 AND facility_id = $2
    `, [id, facilityId]);

    if (existingResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    // Verify parent location if changing
    if (data.parentLocationId !== undefined) {
      if (data.parentLocationId === id) {
        return reply.status(400).send({ error: 'Location cannot be its own parent' });
      }
      if (data.parentLocationId) {
        const parentCheck = await query(`
          SELECT id FROM location WHERE id = $1 AND facility_id = $2
        `, [data.parentLocationId, facilityId]);

        if (parentCheck.rows.length === 0) {
          return reply.status(400).send({ error: 'Parent location not found' });
        }
      }
    }

    // Check name uniqueness if changing
    if (data.name) {
      const nameCheck = await query(`
        SELECT id FROM location WHERE facility_id = $1 AND LOWER(name) = LOWER($2) AND id != $3
      `, [facilityId, data.name, id]);

      if (nameCheck.rows.length > 0) {
        return reply.status(400).send({ error: 'Location name already exists' });
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.parentLocationId !== undefined) {
      updates.push(`parent_location_id = $${paramIndex++}`);
      values.push(data.parentLocationId);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    values.push(id, facilityId);

    const result = await query<LocationRow>(`
      UPDATE location
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
      RETURNING id, facility_id, name, description, parent_location_id, created_at, updated_at
    `, values);

    // Get parent name and counts
    const fullResult = await query<LocationWithCounts>(`
      SELECT
        l.id, l.facility_id, l.name, l.description,
        l.parent_location_id, p.name as parent_name,
        l.created_at, l.updated_at,
        (SELECT COUNT(*) FROM location c WHERE c.parent_location_id = l.id) as child_count,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.location_id = l.id) as item_count
      FROM location l
      LEFT JOIN location p ON l.parent_location_id = p.id
      WHERE l.id = $1
    `, [id]);

    const row = fullResult.rows[0];
    return reply.send({
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        parentLocationId: row.parent_location_id,
        parentName: row.parent_name,
        childCount: parseInt(row.child_count),
        itemCount: parseInt(row.item_count),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    });
  });

  /**
   * DELETE /locations/:id
   * Delete location (ADMIN only) - only if no children or items
   */
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { facilityId } = request.user;

    // Check location exists and get counts
    const result = await query<LocationWithCounts>(`
      SELECT
        l.id,
        (SELECT COUNT(*) FROM location c WHERE c.parent_location_id = l.id) as child_count,
        (SELECT COUNT(*) FROM inventory_item i WHERE i.location_id = l.id) as item_count
      FROM location l
      WHERE l.id = $1 AND l.facility_id = $2
    `, [id, facilityId]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    const row = result.rows[0];
    if (parseInt(row.child_count) > 0) {
      return reply.status(400).send({ error: 'Cannot delete location with child locations' });
    }
    if (parseInt(row.item_count) > 0) {
      return reply.status(400).send({ error: 'Cannot delete location with inventory items' });
    }

    await query(`DELETE FROM location WHERE id = $1 AND facility_id = $2`, [id, facilityId]);

    return reply.send({ success: true });
  });
}
