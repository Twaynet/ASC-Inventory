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
  CreateContainerRequestSchema,
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
  is_container: boolean;
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
   * List all container catalog items (Sets/Trays/Kits)
   * Only returns items where is_container = true
   *
   * Query params:
   *   includeEmpty=true: Include containers with no contents defined yet
   */
  fastify.get<{ Querystring: { includeEmpty?: string } }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { includeEmpty } = request.query;

    // Only return container items (is_container = true)
    // If includeEmpty=true, return all containers
    // Otherwise, only return containers that already have contents defined
    let sql: string;

    if (includeEmpty === 'true') {
      // Return all active container items with component count
      sql = `
        SELECT
          c.id, c.facility_id, c.name, c.category, c.manufacturer, c.catalog_number,
          c.is_container, c.active,
          (SELECT COUNT(*) FROM catalog_set_component csc WHERE csc.set_catalog_id = c.id) as component_count
        FROM item_catalog c
        WHERE c.facility_id = $1 AND c.active = true AND c.is_container = true
        ORDER BY c.name ASC
      `;
    } else {
      // Return only containers with contents
      sql = `
        SELECT
          c.id, c.facility_id, c.name, c.category, c.manufacturer, c.catalog_number,
          c.is_container, c.active,
          (SELECT COUNT(*) FROM catalog_set_component csc WHERE csc.set_catalog_id = c.id) as component_count
        FROM item_catalog c
        WHERE c.facility_id = $1 AND c.active = true AND c.is_container = true
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
        isContainer: row.is_container,
        active: row.active,
        componentCount: parseInt(row.component_count),
      })),
    });
  });

  /**
   * POST /catalog/sets
   * Create a new container catalog item (Set/Tray/Kit) - ADMIN only
   *
   * LAW NOTICE:
   * - Only INSTRUMENT or EQUIPMENT categories allowed for containers
   * - IMPLANT, CONSUMABLE, MEDICATION, PPE cannot be containers
   * - This creates a catalog entry with is_container = true
   */
  fastify.post('/', {
    preHandler: [requireCapabilities('CATALOG_MANAGE')],
  }, async (request, reply) => {
    const { facilityId } = request.user;

    const parseResult = CreateContainerRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, parseResult.error.flatten());
    }

    const data = parseResult.data;

    // Insert container catalog item with is_container = true
    const insertResult = await query<{
      id: string;
      name: string;
      description: string | null;
      category: string;
      manufacturer: string | null;
      catalog_number: string | null;
      is_container: boolean;
      active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(`
      INSERT INTO item_catalog (
        facility_id, name, description, category, manufacturer, catalog_number,
        is_container, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, true)
      RETURNING id, name, description, category, manufacturer, catalog_number,
                is_container, active, created_at, updated_at
    `, [
      facilityId,
      data.name,
      data.description || null,
      data.category,
      data.manufacturer || null,
      data.catalogNumber || null,
    ]);

    const row = insertResult.rows[0];
    return ok(reply, {
      set: {
        id: row.id,
        facilityId: facilityId,
        name: row.name,
        category: row.category,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalog_number,
        isContainer: row.is_container,
        active: row.active,
        componentCount: 0,
      },
    }, 201);
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

    // Verify set catalog item exists, belongs to facility, AND is a container
    const setCatalogCheck = await query<{ id: string; is_container: boolean }>(`
      SELECT id, is_container FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [catalogId, facilityId]);

    if (setCatalogCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Set catalog item not found', 404);
    }

    // Server-side enforcement: Only containers can have expected contents
    if (!setCatalogCheck.rows[0].is_container) {
      return fail(reply, 'VALIDATION_ERROR',
        'Only container items (Sets/Trays/Kits) can have expected contents. Mark this item as a container first.',
        400);
    }

    // Verify component catalog item exists and belongs to same facility
    const componentCatalogCheck = await query(`
      SELECT id FROM item_catalog WHERE id = $1 AND facility_id = $2
    `, [data.componentCatalogId, facilityId]);

    if (componentCatalogCheck.rows.length === 0) {
      return fail(reply, 'VALIDATION_ERROR', 'Component catalog item not found');
    }

    // Prevent self-reference (A → A)
    if (catalogId === data.componentCatalogId) {
      return fail(reply, 'VALIDATION_ERROR', 'A set cannot contain itself as a component');
    }

    // Prevent cycles: Check if the component (or any of its nested components) already contains this set
    // This uses a recursive CTE to detect cycles at any depth (A → B → A, A → B → C → A, etc.)
    const cycleCheck = await query<{ creates_cycle: boolean }>(`
      WITH RECURSIVE component_tree AS (
        -- Base case: direct components of the item we're trying to add
        SELECT component_catalog_id, set_catalog_id, 1 as depth
        FROM catalog_set_component
        WHERE set_catalog_id = $1

        UNION ALL

        -- Recursive case: components of components (up to depth 10 to prevent infinite loops)
        SELECT csc.component_catalog_id, csc.set_catalog_id, ct.depth + 1
        FROM catalog_set_component csc
        INNER JOIN component_tree ct ON csc.set_catalog_id = ct.component_catalog_id
        WHERE ct.depth < 10
      )
      SELECT EXISTS (
        SELECT 1 FROM component_tree WHERE component_catalog_id = $2
      ) as creates_cycle
    `, [data.componentCatalogId, catalogId]);

    if (cycleCheck.rows[0]?.creates_cycle) {
      return fail(reply, 'VALIDATION_ERROR',
        'Adding this component would create a circular reference. The component (or one of its nested contents) already contains this set.',
        400);
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
