/**
 * Attention Routes
 * Surfaces cross-domain exceptions (overdue loaners, expiring inventory)
 * as derived-truth attention items. No stored state — items exist IFF the
 * underlying condition is true.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ok } from '../utils/reply.js';
import { query } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

interface AttentionItem {
  key: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
  dueAt: string | null;
  deepLink: string;
  source: { entity: string; id: string };
}

const VALID_TYPES = ['LOANER_OVERDUE', 'LOANER_DUE_SOON', 'ITEM_EXPIRED', 'ITEM_EXPIRING_SOON'] as const;
const VALID_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const;

// Default windows (days)
const LOANER_DUE_SOON_DAYS = 2;
const ITEM_EXPIRING_SOON_DAYS = 30;

// ============================================================================
// Queries
// ============================================================================

interface LoanerRow {
  id: string;
  set_identifier: string;
  vendor_name: string;
  expected_return_date: Date;
}

interface InventoryRow {
  id: string;
  catalog_name: string;
  lot_number: string | null;
  serial_number: string | null;
  sterility_expires_at: Date;
  location_name: string | null;
}

async function getOverdueLoaners(facilityId: string): Promise<AttentionItem[]> {
  const result = await query<LoanerRow>(`
    SELECT ls.id, ls.set_identifier, v.name AS vendor_name, ls.expected_return_date
    FROM loaner_set ls
    JOIN vendor v ON v.id = ls.vendor_id
    WHERE ls.facility_id = $1
      AND ls.returned_at IS NULL
      AND ls.expected_return_date IS NOT NULL
      AND ls.expected_return_date < CURRENT_DATE
    ORDER BY ls.expected_return_date ASC
  `, [facilityId]);

  return result.rows.map((r) => ({
    key: `LOANER_OVERDUE:${r.id}`,
    type: 'LOANER_OVERDUE',
    severity: 'CRITICAL' as const,
    title: `Overdue loaner: ${r.set_identifier}`,
    detail: `${r.vendor_name} — was due ${r.expected_return_date.toISOString().split('T')[0]}`,
    dueAt: r.expected_return_date.toISOString().split('T')[0],
    deepLink: '/admin/loaner-sets?filter=overdue',
    source: { entity: 'loaner_set', id: r.id },
  }));
}

async function getDueSoonLoaners(facilityId: string): Promise<AttentionItem[]> {
  const result = await query<LoanerRow>(`
    SELECT ls.id, ls.set_identifier, v.name AS vendor_name, ls.expected_return_date
    FROM loaner_set ls
    JOIN vendor v ON v.id = ls.vendor_id
    WHERE ls.facility_id = $1
      AND ls.returned_at IS NULL
      AND ls.expected_return_date IS NOT NULL
      AND ls.expected_return_date >= CURRENT_DATE
      AND ls.expected_return_date <= CURRENT_DATE + $2::int
    ORDER BY ls.expected_return_date ASC
  `, [facilityId, LOANER_DUE_SOON_DAYS]);

  return result.rows.map((r) => ({
    key: `LOANER_DUE_SOON:${r.id}`,
    type: 'LOANER_DUE_SOON',
    severity: 'WARNING' as const,
    title: `Loaner due soon: ${r.set_identifier}`,
    detail: `${r.vendor_name} — due ${r.expected_return_date.toISOString().split('T')[0]}`,
    dueAt: r.expected_return_date.toISOString().split('T')[0],
    deepLink: '/admin/loaner-sets?filter=open',
    source: { entity: 'loaner_set', id: r.id },
  }));
}

async function getExpiredItems(facilityId: string): Promise<AttentionItem[]> {
  const result = await query<InventoryRow>(`
    SELECT ii.id, ic.name AS catalog_name, ii.lot_number, ii.serial_number,
           ii.sterility_expires_at, l.name AS location_name
    FROM inventory_item ii
    JOIN item_catalog ic ON ic.id = ii.catalog_id
    LEFT JOIN location l ON l.id = ii.location_id
    WHERE ii.facility_id = $1
      AND ii.sterility_expires_at IS NOT NULL
      AND ii.sterility_expires_at < NOW()
      AND ii.availability_status NOT IN ('UNAVAILABLE', 'MISSING')
    ORDER BY ii.sterility_expires_at ASC
  `, [facilityId]);

  return result.rows.map((r) => {
    const identifier = r.serial_number || r.lot_number || r.id.slice(0, 8);
    return {
      key: `ITEM_EXPIRED:${r.id}`,
      type: 'ITEM_EXPIRED',
      severity: 'CRITICAL' as const,
      title: `Expired: ${r.catalog_name}`,
      detail: `${identifier}${r.location_name ? ` @ ${r.location_name}` : ''} — expired ${r.sterility_expires_at.toISOString().split('T')[0]}`,
      dueAt: r.sterility_expires_at.toISOString().split('T')[0],
      deepLink: '/admin/inventory/risk-queue?rule=EXPIRED',
      source: { entity: 'inventory_item', id: r.id },
    };
  });
}

async function getExpiringSoonItems(facilityId: string): Promise<AttentionItem[]> {
  const result = await query<InventoryRow>(`
    SELECT ii.id, ic.name AS catalog_name, ii.lot_number, ii.serial_number,
           ii.sterility_expires_at, l.name AS location_name
    FROM inventory_item ii
    JOIN item_catalog ic ON ic.id = ii.catalog_id
    LEFT JOIN location l ON l.id = ii.location_id
    WHERE ii.facility_id = $1
      AND ii.sterility_expires_at IS NOT NULL
      AND ii.sterility_expires_at >= NOW()
      AND ii.sterility_expires_at <= NOW() + make_interval(days => $2)
      AND ii.availability_status NOT IN ('UNAVAILABLE', 'MISSING')
    ORDER BY ii.sterility_expires_at ASC
  `, [facilityId, ITEM_EXPIRING_SOON_DAYS]);

  return result.rows.map((r) => {
    const identifier = r.serial_number || r.lot_number || r.id.slice(0, 8);
    return {
      key: `ITEM_EXPIRING_SOON:${r.id}`,
      type: 'ITEM_EXPIRING_SOON',
      severity: 'WARNING' as const,
      title: `Expiring soon: ${r.catalog_name}`,
      detail: `${identifier}${r.location_name ? ` @ ${r.location_name}` : ''} — expires ${r.sterility_expires_at.toISOString().split('T')[0]}`,
      dueAt: r.sterility_expires_at.toISOString().split('T')[0],
      deepLink: '/admin/inventory/risk-queue?rule=EXPIRING_SOON',
      source: { entity: 'inventory_item', id: r.id },
    };
  });
}

// ============================================================================
// Sorting
// ============================================================================

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function sortAttentionItems(items: AttentionItem[]): AttentionItem[] {
  return items.sort((a, b) => {
    // 1. CRITICAL first
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sevDiff !== 0) return sevDiff;

    // 2. Earliest dueAt
    if (a.dueAt && b.dueAt) {
      const dateDiff = a.dueAt.localeCompare(b.dueAt);
      if (dateDiff !== 0) return dateDiff;
    } else if (a.dueAt) {
      return -1;
    } else if (b.dueAt) {
      return 1;
    }

    // 3. Stable tie-break by source id
    return a.source.id.localeCompare(b.source.id);
  });
}

// ============================================================================
// Route
// ============================================================================

export async function attentionRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /attention
   * Returns derived-truth attention items for the authenticated user's facility.
   *
   * Query params:
   *   types    — comma-separated list of attention types to include
   *   severity — filter to a single severity level
   */
  fastify.get<{
    Querystring: {
      types?: string;
      severity?: string;
    };
  }>('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: {
      types?: string;
      severity?: string;
    };
  }>, reply: FastifyReply) => {
    const { facilityId } = request.user;

    if (!facilityId) {
      return ok(reply, { items: [] });
    }

    // Parse optional filters
    const requestedTypes = request.query.types
      ? request.query.types.split(',').filter((t) => (VALID_TYPES as readonly string[]).includes(t))
      : [...VALID_TYPES];

    const severityFilter = request.query.severity
      && (VALID_SEVERITIES as readonly string[]).includes(request.query.severity)
      ? request.query.severity
      : null;

    // Run only requested queries in parallel
    const queries: Promise<AttentionItem[]>[] = [];

    if (requestedTypes.includes('LOANER_OVERDUE')) queries.push(getOverdueLoaners(facilityId));
    if (requestedTypes.includes('LOANER_DUE_SOON')) queries.push(getDueSoonLoaners(facilityId));
    if (requestedTypes.includes('ITEM_EXPIRED')) queries.push(getExpiredItems(facilityId));
    if (requestedTypes.includes('ITEM_EXPIRING_SOON')) queries.push(getExpiringSoonItems(facilityId));

    const results = await Promise.all(queries);
    let items = results.flat();

    // Apply severity filter if specified
    if (severityFilter) {
      items = items.filter((item) => item.severity === severityFilter);
    }

    return ok(reply, { items: sortAttentionItems(items) });
  });
}
