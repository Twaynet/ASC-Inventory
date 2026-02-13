/**
 * Canonical Admin Settings Routes
 *
 * Provides a unified entry-point for all settings under /api/admin/settings/*.
 * Delegates to existing handlers — no duplicate business logic.
 * See docs/api-contract.md for conventions.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/index.js';
import { requireCapabilities } from '../plugins/auth.js';
import { ok } from '../utils/reply.js';
import {
  getFacilitySettings,
} from '../services/checklists.service.js';

interface RoomRow {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface ConfigItemRow {
  id: string;
  item_type: string;
  item_key: string;
  display_label: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SurgeonRow {
  id: string;
  name: string;
  username: string;
  display_color: string | null;
}

export async function adminSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /admin/settings
   * Returns all settings categories in a stable structure.
   */
  fastify.get('/', {
    preHandler: [requireCapabilities('SETTINGS_MANAGE')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { facilityId } = request.user;

    // Fetch all settings in parallel
    const [facility, roomsResult, surgeonsResult, configItemsResult] = await Promise.all([
      getFacilitySettings(facilityId),
      query<RoomRow>(`
        SELECT id, name, active, sort_order, created_at, updated_at
        FROM room WHERE facility_id = $1
        ORDER BY sort_order ASC, name ASC
      `, [facilityId]),
      query<SurgeonRow>(`
        SELECT id, name, username, display_color
        FROM app_user
        WHERE facility_id = $1 AND 'SURGEON' = ANY(roles)
        ORDER BY name ASC
      `, [facilityId]),
      query<ConfigItemRow>(`
        SELECT id, item_type, item_key, display_label, description, sort_order, active, created_at, updated_at
        FROM facility_config_item
        WHERE facility_id = $1
        ORDER BY item_type, sort_order ASC
      `, [facilityId]),
    ]);

    return ok(reply, {
      facility: facility || {
        facilityId,
        enableTimeoutDebrief: false,
      },
      rooms: roomsResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        active: r.active,
        sortOrder: r.sort_order,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      })),
      surgeons: surgeonsResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        username: r.username,
        displayColor: r.display_color,
      })),
      configItems: configItemsResult.rows.map(r => ({
        id: r.id,
        itemType: r.item_type,
        itemKey: r.item_key,
        displayLabel: r.display_label,
        description: r.description,
        sortOrder: r.sort_order,
        active: r.active,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      })),
    });
  });
}
