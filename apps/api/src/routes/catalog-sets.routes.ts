/**
 * Catalog Set Components Routes
 * LAW Reference: docs/LAW/catalog.md v2.1 Amendment - Set Definitions
 *
 * ADMIN-only endpoints for managing catalog set component definitions.
 *
 * LAW NOTICE (NON-NEGOTIABLE):
 * - Set Definitions declare EXPECTED composition ONLY
 * - DO NOT prove component exists, is present, or is sterile
 * - DO NOT prove readiness or replace verification workflows
 * - DO NOT create inventory records
 * - Catalog Sets are inputs to verification workflows, never outputs
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  CreateSetComponentRequestSchema,
  UpdateSetComponentRequestSchema,
} from '../schemas/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';

interface CatalogSetRow {
  id: string;
  facility_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  catalog_number: string | null;
  active: boolean;
  component_count: string;
}

interface SetComponentRow {
  id: string;
  set_catalog_id: string;
  component_catalog_id: string;
  component_name: string;
  component_category: string;
  component_manufacturer: string | null;
  component_catalog_number: string | null;
  required_quantity: number;
  optional_quantity: number;
  notes: string | null;
  created_at: Date;
}

export async function catalogSetsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /catalog/sets
   * List all catalog items that have defined components (are Sets)
   * Returns catalog items with at least one component definition
   */
  fastify.get<{ Querystring: { includeEmpty?: string } }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { includeEmpty } = request.query;

    // If includeEmpty=true, return all catalog items that COULD be sets
    // Otherwise, only return items that already have components defined
    let sql: string;

    if (includeEmpty === 'true') {
      // Return all active catalog items with component count
      sql = `
        SELECT
          c.id, c.facility_id, c.name, c.category, c.manufacturer, c.catalog_number, c.active,
          (SELECT COUNT(*) FROM catalog_set_component csc WHERE csc.set_catalog_id = c.id) as component_count
        FROM item_catalog c
        WHERE c.facility_id = $1 AND c.active = true
        ORDER BY c.name ASC
      `;
    } else {
      // Return only items with components
      sql = `
        SELECT
          c.id, c.facility_id, c.name, c.category, c.manufacturer, c.catalog_number, c.active,
          (SELECT COUNT(*) FROM catalog_set_component csc WHERE csc.set_catalog_id = c.id) as component_count
        FROM item_catalog c
        WHERE c.facility_id = $1 AND c.active = true
          AND EXISTS (SELECT 1 FROM catalog_set_component csc WHERE csc.set_catalog_id = c.id)
        ORDER BY c.name ASC
      `;
    }

    const result = await query<CatalogSetRow>(sql, [facilityId]);

    return ok(reply, {
      sets: result.rows.map(row => ({
        id: row.id,
        facilityId: row.facility_id,
        name: row.name,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        active: row.active,
        componentCount: parseInt(row.component_count),
      })),
    });
  });

  /**
   * GET /catalog/sets/:catalogId/components
   * List all component definitions for a catalog set
   */
  fastify.get<{ Params: { catalogId: string } }>('/:catalogId/components', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { catalogId } = request.params;
    const { facilityId } = request.user;

    // Verify catalog item exists and belongs to facility
    const catalogCheck = await query(`
      SELECT id FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [catalogId, facilityId]);

    if (catalogCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Catalog item not found', 404);
    }

    const sql = `
      SELECT
        csc.id,
        csc.set_catalog_id,
        csc.component_catalog_id,
        c.name as component_name,
        c.category as component_category,
        c.manufacturer as component_manufacturer,
        c.catalog_number as component_catalog_number,
        csc.required_quantity,
        csc.optional_quantity,
        csc.notes,
        csc.created_at
      FROM catalog_set_component csc
      INNER JOIN item_catalog c ON c.id = csc.component_catalog_id
      WHERE csc.set_catalog_id = $1 AND csc.facility_id = $2
      ORDER BY c.name ASC
    `;

    const result = await query<SetComponentRow>(sql, [catalogId, facilityId]);

    return ok(reply, {
      setCatalogId: catalogId,
      components: result.rows.map(row => ({
        id: row.id,
        setCatalogId: row.set_catalog_id,
        componentCatalogId: row.component_catalog_id,
        componentName: row.component_name,
        componentCategory: row.component_category,
        componentManufacturer: row.component_manufacturer,
        componentCatalogNumber: row.component_catalog_number,
        requiredQuantity: row.required_quantity,
        optionalQuantity: row.optional_quantity,
        notes: row.notes,
        createdAt: row.created_at.toISOString(),
      })),
    });
  });

  /**
   * POST /catalog/sets/:catalogId/components
   * Add a component definition to a catalog set (ADMIN only)
   */
  fastify.post<{ Params: { catalogId: string } }>('/:catalogId/components', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { catalogId } = request.params;
    const { facilityId } = request.user;

    const parseResult = CreateSetComponentRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Verify set catalog item exists and belongs to facility
    const setCatalogCheck = await query(`
      SELECT id FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [catalogId, facilityId]);

    if (setCatalogCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Set catalog item not found', 404);
    }

    // Verify component catalog item exists and belongs to same facility
    const componentCatalogCheck = await query(`
      SELECT id FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [data.componentCatalogId, facilityId]);

    if (componentCatalogCheck.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Component catalog item not found');
    }

    // Prevent self-reference
    if (catalogId === data.componentCatalogId) {
      return fail(reply, 'VALIDATION_ERROR', 'A set cannot contain itself as a component');
    }

    // Check for duplicate
    const dupCheck = await query(`
      SELECT id FROM catalog_set_component
      WHERE set_catalog_id = $1 AND component_catalog_id = $2
    `, [catalogId, data.componentCatalogId]);

    if (dupCheck.rows.length > 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Component already exists in this set');
    }

    // Insert component
    const insertResult = await query<{ id: string; created_at: Date }>(`
      INSERT INTO catalog_set_component (
        facility_id, set_catalog_id, component_catalog_id,
        required_quantity, optional_quantity, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [
      facilityId,
      catalogId,
      data.componentCatalogId,
      data.requiredQuantity || 0,
      data.optionalQuantity || 0,
      data.notes || null,
    ]);

    // Fetch full component data with joined info
    const componentResult = await query<SetComponentRow>(`
      SELECT
        csc.id,
        csc.set_catalog_id,
        csc.component_catalog_id,
        c.name as component_name,
        c.category as component_category,
        c.manufacturer as component_manufacturer,
        c.catalog_number as component_catalog_number,
        csc.required_quantity,
        csc.optional_quantity,
        csc.notes,
        csc.created_at
      FROM catalog_set_component csc
      INNER JOIN item_catalog c ON c.id = csc.component_catalog_id
      WHERE csc.id = $1
    `, [insertResult.rows[0].id]);

    const row = componentResult.rows[0];
    return ok(reply, {
      component: {
        id: row.id,
        setCatalogId: row.set_catalog_id,
        componentCatalogId: row.component_catalog_id,
        componentName: row.component_name,
        componentCategory: row.component_category,
        componentManufacturer: row.component_manufacturer,
        componentCatalogNumber: row.component_catalog_number,
        requiredQuantity: row.required_quantity,
        optionalQuantity: row.optional_quantity,
        notes: row.notes,
        createdAt: row.created_at.toISOString(),
      },
    }, 201);
  });

  /**
   * PATCH /catalog/sets/:catalogId/components/:componentId
   * Update a component definition (ADMIN only)
   */
  fastify.patch<{ Params: { catalogId: string; componentId: string } }>('/:catalogId/components/:componentId', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { catalogId, componentId } = request.params;
    const { facilityId } = request.user;

    const parseResult = UpdateSetComponentRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Verify component exists and belongs to this set and facility
    const existingResult = await query(`
      SELECT id FROM catalog_set_component
      WHERE id = $1 AND set_catalog_id = $2 AND facility_id = $3
    `, [componentId, catalogId, facilityId]);

    if (existingResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Component not found', 404);
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.requiredQuantity !== undefined) {
      updates.push(`required_quantity = $${paramIndex++}`);
      values.push(data.requiredQuantity);
    }
    if (data.optionalQuantity !== undefined) {
      updates.push(`optional_quantity = $${paramIndex++}`);
      values.push(data.optionalQuantity);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'No updates provided');
    }

    values.push(componentId);

    await query(`
      UPDATE catalog_set_component
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    // Fetch updated component with joined info
    const componentResult = await query<SetComponentRow>(`
      SELECT
        csc.id,
        csc.set_catalog_id,
        csc.component_catalog_id,
        c.name as component_name,
        c.category as component_category,
        c.manufacturer as component_manufacturer,
        c.catalog_number as component_catalog_number,
        csc.required_quantity,
        csc.optional_quantity,
        csc.notes,
        csc.created_at
      FROM catalog_set_component csc
      INNER JOIN item_catalog c ON c.id = csc.component_catalog_id
      WHERE csc.id = $1
    `, [componentId]);

    const row = componentResult.rows[0];
    return ok(reply, {
      component: {
        id: row.id,
        setCatalogId: row.set_catalog_id,
        componentCatalogId: row.component_catalog_id,
        componentName: row.component_name,
        componentCategory: row.component_category,
        componentManufacturer: row.component_manufacturer,
        componentCatalogNumber: row.component_catalog_number,
        requiredQuantity: row.required_quantity,
        optionalQuantity: row.optional_quantity,
        notes: row.notes,
        createdAt: row.created_at.toISOString(),
      },
    });
  });

  /**
   * DELETE /catalog/sets/:catalogId/components/:componentId
   * Remove a component definition from a set (ADMIN only)
   */
  fastify.delete<{ Params: { catalogId: string; componentId: string } }>('/:catalogId/components/:componentId', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { catalogId, componentId } = request.params;
    const { facilityId } = request.user;

    // Verify component exists and belongs to this set and facility
    const existingResult = await query(`
      SELECT id FROM catalog_set_component
      WHERE id = $1 AND set_catalog_id = $2 AND facility_id = $3
    `, [componentId, catalogId, facilityId]);

    if (existingResult.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Component not found', 404);
    }

    // Delete component
    await query(`
      DELETE FROM catalog_set_component WHERE id = $1
    `, [componentId]);

    return ok(reply, { success: true });
  });
}
