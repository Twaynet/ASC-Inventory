/**
 * Catalog Item Images Routes
 *
 * LAW COMPLIANCE (catalog.md v2.1 Section E):
 * - Images are DOCUMENTATION ONLY, not evidence
 * - Images MUST NOT assert correctness, completeness, verification, or readiness
 * - Images exist solely to assist human recognition
 * - Facility-scoped queries mandatory
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import { requireAdmin } from '../plugins/auth.js';
import { ok, fail } from '../utils/reply.js';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const MAX_IMAGES_PER_ITEM = 10;
const MAX_CAPTION_LENGTH = 200;

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../uploads/catalog');

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB (LAW-compliant limit)
const MAX_DIMENSION = 1600; // Max longest edge in pixels
const JPEG_QUALITY = 80; // Re-encode quality

interface ImageRow {
  id: string;
  facility_id: string;
  catalog_id: string;
  kind: string;
  caption: string | null;
  sort_order: number;
  asset_url: string;
  source: string;
  created_at: Date;
}

interface CatalogRow {
  id: string;
  facility_id: string;
}

function mapImageRow(row: ImageRow) {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    kind: row.kind,
    caption: row.caption,
    sortOrder: row.sort_order,
    assetUrl: row.asset_url,
    source: row.source,
    createdAt: row.created_at.toISOString(),
  };
}

export async function catalogImagesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /:catalogId/images
   * List all images for a catalog item
   */
  fastify.get<{ Params: { catalogId: string } }>('/:catalogId/images', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { catalogId } = request.params;

    // Verify catalog item belongs to facility
    const catalogCheck = await query<CatalogRow>(
      'SELECT id, facility_id FROM item_catalog WHERE id = $1 AND facility_id = $2',
      [catalogId, facilityId]
    );
    if (catalogCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    const result = await query<ImageRow>(
      `SELECT id, facility_id, catalog_id, kind, caption, sort_order, asset_url, source, created_at
       FROM catalog_item_image
       WHERE catalog_id = $1 AND facility_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [catalogId, facilityId]
    );

    return reply.send({ images: result.rows.map(mapImageRow) });
  });

  /**
   * POST /:catalogId/images
   * Add image by URL (JSON body)
   */
  fastify.post<{
    Params: { catalogId: string };
    Body: { assetUrl: string; kind?: string; caption?: string; sortOrder?: number };
  }>('/:catalogId/images', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { catalogId } = request.params;
    const { assetUrl, kind = 'REFERENCE', caption, sortOrder = 0 } = request.body;

    if (!assetUrl || typeof assetUrl !== 'string') {
      return fail(reply, 'VALIDATION', 'assetUrl is required');
    }

    // Validate URL is http or https
    try {
      const parsed = new URL(assetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return fail(reply, 'VALIDATION', 'assetUrl must be an http or https URL');
      }
    } catch {
      return fail(reply, 'VALIDATION', 'assetUrl must be a valid URL');
    }

    if (kind !== 'PRIMARY' && kind !== 'REFERENCE') {
      return fail(reply, 'VALIDATION', 'kind must be PRIMARY or REFERENCE');
    }

    if (caption && caption.length > MAX_CAPTION_LENGTH) {
      return fail(reply, 'VALIDATION', `caption must be ${MAX_CAPTION_LENGTH} characters or fewer`);
    }

    // Verify catalog item belongs to facility
    const catalogCheck = await query<CatalogRow>(
      'SELECT id, facility_id FROM item_catalog WHERE id = $1 AND facility_id = $2',
      [catalogId, facilityId]
    );
    if (catalogCheck.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Catalog item not found', 404);
    }

    // Enforce max images per item
    const countCheck = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM catalog_item_image WHERE catalog_id = $1 AND facility_id = $2',
      [catalogId, facilityId]
    );
    if (parseInt(countCheck.rows[0].count) >= MAX_IMAGES_PER_ITEM) {
      return fail(reply, 'LIMIT_EXCEEDED', `Maximum ${MAX_IMAGES_PER_ITEM} images per catalog item`);
    }

    // If setting as PRIMARY, clear existing PRIMARY
    if (kind === 'PRIMARY') {
      await query(
        `UPDATE catalog_item_image SET kind = 'REFERENCE'
         WHERE catalog_id = $1 AND facility_id = $2 AND kind = 'PRIMARY'`,
        [catalogId, facilityId]
      );
    }

    const result = await query<ImageRow>(
      `INSERT INTO catalog_item_image (facility_id, catalog_id, kind, caption, sort_order, asset_url, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'URL')
       RETURNING id, facility_id, catalog_id, kind, caption, sort_order, asset_url, source, created_at`,
      [facilityId, catalogId, kind, caption || null, sortOrder, assetUrl]
    );

    const image = mapImageRow(result.rows[0]);

    // Audit event
    await query(
      `INSERT INTO catalog_event (facility_id, catalog_item_id, action, actor_user_id, payload)
       VALUES ($1, $2, 'IMAGE_ADDED', $3, $4)`,
      [facilityId, catalogId, request.user.userId, JSON.stringify({ imageId: image.id, url: assetUrl, caption: caption || null })]
    );

    return ok(reply, { image }, 201);
  });

  /**
   * POST /:catalogId/images/upload
   * Upload image file (multipart/form-data)
   *
   * Processing (LAW-compliant storage discipline):
   * - Max 3MB upload size
   * - Strip EXIF/metadata
   * - Resize to max 1600px longest edge
   * - Re-encode as JPEG quality 80%
   */
  fastify.post<{ Params: { catalogId: string } }>('/:catalogId/images/upload', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { catalogId } = request.params;

    // Verify catalog item belongs to facility
    const catalogCheck = await query<CatalogRow>(
      'SELECT id, facility_id FROM item_catalog WHERE id = $1 AND facility_id = $2',
      [catalogId, facilityId]
    );
    if (catalogCheck.rows.length === 0) {
      return reply.status(404).send({ error: 'Catalog item not found' });
    }

    // Parse multipart
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    // Validate content type
    if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({
        error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
      });
    }

    // Collect file into buffer with size limit
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
        });
      }
      chunks.push(chunk);
    }

    const inputBuffer = Buffer.concat(chunks);

    // Process image with sharp:
    // - Strip EXIF/metadata
    // - Resize to max dimension
    // - Re-encode as JPEG
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(inputBuffer)
        .rotate() // Auto-rotate based on EXIF, then strip EXIF
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
    } catch (err) {
      return reply.status(400).send({
        error: 'Failed to process image. Ensure file is a valid image.'
      });
    }

    // Generate filename and save processed image
    const imageId = randomUUID();
    const fileName = `${imageId}.jpg`; // Always JPEG after processing

    const facilityDir = join(UPLOADS_DIR, facilityId);
    if (!existsSync(facilityDir)) {
      mkdirSync(facilityDir, { recursive: true });
    }

    const filePath = join(facilityDir, fileName);
    writeFileSync(filePath, processedBuffer);

    // Create database record
    const assetUrl = `/uploads/catalog/${facilityId}/${fileName}`;

    // Parse optional fields from form data
    const fields = data.fields;
    const kind = (fields?.kind as { value?: string })?.value === 'PRIMARY' ? 'PRIMARY' : 'REFERENCE';
    const caption = (fields?.caption as { value?: string })?.value || null;
    const sortOrder = parseInt((fields?.sortOrder as { value?: string })?.value || '0') || 0;

    // If setting as PRIMARY, clear existing PRIMARY
    if (kind === 'PRIMARY') {
      await query(
        `UPDATE catalog_item_image SET kind = 'REFERENCE'
         WHERE catalog_id = $1 AND facility_id = $2 AND kind = 'PRIMARY'`,
        [catalogId, facilityId]
      );
    }

    const result = await query<ImageRow>(
      `INSERT INTO catalog_item_image (facility_id, catalog_id, kind, caption, sort_order, asset_url, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'UPLOAD')
       RETURNING id, facility_id, catalog_id, kind, caption, sort_order, asset_url, source, created_at`,
      [facilityId, catalogId, kind, caption, sortOrder, assetUrl]
    );

    return reply.status(201).send({ image: mapImageRow(result.rows[0]) });
  });

  /**
   * PATCH /:catalogId/images/:imageId
   * Update image metadata
   */
  fastify.patch<{
    Params: { catalogId: string; imageId: string };
    Body: { kind?: string; caption?: string; sortOrder?: number };
  }>('/:catalogId/images/:imageId', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { catalogId, imageId } = request.params;
    const { kind, caption, sortOrder } = request.body;

    // Verify image exists and belongs to this catalog/facility
    const existing = await query<ImageRow>(
      `SELECT id, facility_id, catalog_id, kind, caption, sort_order, asset_url, source, created_at
       FROM catalog_item_image
       WHERE id = $1 AND catalog_id = $2 AND facility_id = $3`,
      [imageId, catalogId, facilityId]
    );
    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (kind !== undefined) {
      if (kind !== 'PRIMARY' && kind !== 'REFERENCE') {
        return reply.status(400).send({ error: 'kind must be PRIMARY or REFERENCE' });
      }
      // If changing to PRIMARY, clear other PRIMARY
      if (kind === 'PRIMARY') {
        await query(
          `UPDATE catalog_item_image SET kind = 'REFERENCE'
           WHERE catalog_id = $1 AND facility_id = $2 AND kind = 'PRIMARY' AND id != $3`,
          [catalogId, facilityId, imageId]
        );
      }
      updates.push(`kind = $${paramIndex++}`);
      params.push(kind);
    }

    if (caption !== undefined) {
      updates.push(`caption = $${paramIndex++}`);
      params.push(caption || null);
    }

    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(sortOrder);
    }

    if (updates.length === 0) {
      return reply.send({ image: mapImageRow(existing.rows[0]) });
    }

    params.push(imageId, catalogId, facilityId);
    const result = await query<ImageRow>(
      `UPDATE catalog_item_image SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND catalog_id = $${paramIndex++} AND facility_id = $${paramIndex}
       RETURNING id, facility_id, catalog_id, kind, caption, sort_order, asset_url, source, created_at`,
      params
    );

    return reply.send({ image: mapImageRow(result.rows[0]) });
  });

  /**
   * DELETE /:catalogId/images/:imageId
   * Remove image (and delete file if uploaded)
   */
  fastify.delete<{ Params: { catalogId: string; imageId: string } }>('/:catalogId/images/:imageId', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { catalogId, imageId } = request.params;

    // Get image to check source and path
    const existing = await query<ImageRow>(
      `SELECT id, asset_url, source FROM catalog_item_image
       WHERE id = $1 AND catalog_id = $2 AND facility_id = $3`,
      [imageId, catalogId, facilityId]
    );
    if (existing.rows.length === 0) {
      return fail(reply, 'NOT_FOUND', 'Image not found', 404);
    }

    const image = existing.rows[0];

    // Delete file if it was uploaded
    if (image.source === 'UPLOAD') {
      // Extract path from asset_url: /uploads/catalog/{facilityId}/{filename}
      const match = image.asset_url.match(/^\/uploads\/catalog\/([^/]+)\/([^/]+)$/);
      if (match) {
        const [, urlFacilityId, fileName] = match;
        // Security: verify facility ID matches
        if (urlFacilityId === facilityId) {
          const filePath = join(UPLOADS_DIR, facilityId, fileName);
          if (existsSync(filePath)) {
            unlinkSync(filePath);
          }
        }
      }
    }

    // Audit event
    await query(
      `INSERT INTO catalog_event (facility_id, catalog_item_id, action, actor_user_id, payload)
       VALUES ($1, $2, 'IMAGE_REMOVED', $3, $4)`,
      [facilityId, catalogId, request.user.userId, JSON.stringify({ imageId, url: image.asset_url })]
    );

    // Delete database record
    await query(
      'DELETE FROM catalog_item_image WHERE id = $1 AND catalog_id = $2 AND facility_id = $3',
      [imageId, catalogId, facilityId]
    );

    return reply.status(204).send();
  });
}
