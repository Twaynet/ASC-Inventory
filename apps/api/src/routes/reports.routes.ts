/**
 * Operational Reports Routes
 * Provides filtered views and CSV export for inventory, cases, and compliance data
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

// ============================================================================
// Types
// ============================================================================

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: 'inventory' | 'cases' | 'compliance' | 'audit';
  filters: string[];
  exportFormats: string[];
}

const AVAILABLE_REPORTS: ReportDefinition[] = [
  {
    id: 'inventory-readiness',
    name: 'Inventory Readiness Report',
    description: 'Case readiness status with item verification details by date range',
    category: 'inventory',
    filters: ['startDate', 'endDate', 'readinessState', 'surgeonId'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'verification-activity',
    name: 'Verification Activity Report',
    description: 'Inventory event activity by type, user, and time period',
    category: 'inventory',
    filters: ['startDate', 'endDate', 'eventType', 'userId'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'checklist-compliance',
    name: 'Checklist Compliance Report',
    description: 'Timeout and debrief checklist completion rates and signature coverage',
    category: 'compliance',
    filters: ['startDate', 'endDate', 'checklistType'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'case-summary',
    name: 'Case Summary Report',
    description: 'Cases by status, surgeon, and procedure with completion metrics',
    category: 'cases',
    filters: ['startDate', 'endDate', 'status', 'surgeonId'],
    exportFormats: ['csv', 'json'],
  },
  // Wave 1: Financial Attribution Reports
  {
    id: 'vendor-concessions',
    name: 'Vendor Concessions Report',
    description: 'Cost overrides and gratis items by vendor and reason',
    category: 'inventory',
    filters: ['startDate', 'endDate', 'vendorId', 'overrideReason'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'inventory-valuation',
    name: 'Inventory Valuation Report',
    description: 'Current inventory value by ownership type and category',
    category: 'inventory',
    filters: ['ownershipType', 'category'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'loaner-exposure',
    name: 'Loaner Exposure Report',
    description: 'Open loaner sets with estimated values and due dates',
    category: 'inventory',
    filters: ['vendorId', 'isOverdue'],
    exportFormats: ['csv', 'json'],
  },
  // Audit Reports
  {
    id: 'cancelled-cases',
    name: 'Cancelled Cases Report',
    description: 'Cancelled cases with reasons, prior status, and cancelling user',
    category: 'audit',
    filters: ['startDate', 'endDate', 'surgeonId'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'case-timelines',
    name: 'Case Timelines Report',
    description: 'Case status transition history with actors and reasons',
    category: 'audit',
    filters: ['startDate', 'endDate', 'surgeonId', 'toStatus'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'debrief-summary',
    name: 'Debrief Summary Report',
    description: 'Debrief checklist completion, duration, signatures, and flagged items',
    category: 'audit',
    filters: ['startDate', 'endDate', 'surgeonId', 'debriefStatus'],
    exportFormats: ['csv', 'json'],
  },
  {
    id: 'case-event-log',
    name: 'Case Event Log Report',
    description: 'Cross-case event log with type, user, and description',
    category: 'audit',
    filters: ['startDate', 'endDate', 'eventType'],
    exportFormats: ['csv', 'json'],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatDateForCSV(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

function formatTimestampForCSV(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(escapeCSVField).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSVField(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

// ============================================================================
// Routes
// ============================================================================

export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /reports
   * List available reports
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.send({ reports: AVAILABLE_REPORTS });
  });

  /**
   * GET /reports/inventory-readiness
   * Inventory readiness by case with verification details
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      readinessState?: string;
      surgeonId?: string;
      format?: 'json' | 'csv';
    };
  }>('/inventory-readiness', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, readinessState, surgeonId, format = 'json' } = request.query;

    // Default to last 7 days if no dates provided
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        sc.id as case_id,
        sc.procedure_name,
        sc.scheduled_date,
        sc.scheduled_time,
        sc.status as case_status,
        sc.or_room,
        u.name as surgeon_name,
        crc.readiness_state,
        crc.total_required_items as total_required,
        crc.total_verified_items as total_verified,
        crc.missing_items,
        crc.has_attestation,
        crc.attested_at,
        crc.attested_by_name
      FROM surgical_case sc
      JOIN app_user u ON sc.surgeon_id = u.id
      LEFT JOIN case_readiness_cache crc ON sc.id = crc.case_id
      WHERE sc.facility_id = $1
        AND sc.scheduled_date BETWEEN $2 AND $3
        AND sc.is_cancelled = false
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (readinessState) {
      sql += ` AND crc.readiness_state = $${paramIndex++}`;
      params.push(readinessState);
    }

    if (surgeonId) {
      sql += ` AND sc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    sql += ` ORDER BY sc.scheduled_date ASC, sc.scheduled_time ASC NULLS LAST`;

    const result = await query<{
      case_id: string;
      procedure_name: string;
      scheduled_date: Date;
      scheduled_time: string | null;
      case_status: string;
      or_room: string | null;
      surgeon_name: string;
      readiness_state: string | null;
      total_required: number | null;
      total_verified: number | null;
      missing_items: unknown | null;
      has_attestation: boolean | null;
      attested_at: Date | null;
      attested_by_name: string | null;
    }>(sql, params);

    const rows = result.rows.map(row => ({
      caseId: row.case_id,
      procedureName: row.procedure_name,
      scheduledDate: formatDateForCSV(row.scheduled_date),
      scheduledTime: row.scheduled_time || '',
      caseStatus: row.case_status,
      orRoom: row.or_room || '',
      surgeonName: row.surgeon_name,
      readinessState: row.readiness_state || 'UNKNOWN',
      totalRequired: row.total_required || 0,
      totalVerified: row.total_verified || 0,
      missingCount: Array.isArray(row.missing_items) ? row.missing_items.length : 0,
      hasAttestation: row.has_attestation ? 'Yes' : 'No',
      attestedAt: formatTimestampForCSV(row.attested_at),
      attestedByName: row.attested_by_name || '',
    }));

    // Calculate summary
    const summary = {
      totalCases: rows.length,
      greenCount: rows.filter(r => r.readinessState === 'GREEN').length,
      orangeCount: rows.filter(r => r.readinessState === 'ORANGE').length,
      redCount: rows.filter(r => r.readinessState === 'RED').length,
      attestedCount: rows.filter(r => r.hasAttestation === 'Yes').length,
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'scheduledDate', 'scheduledTime', 'procedureName', 'surgeonName', 'orRoom',
        'caseStatus', 'readinessState', 'totalRequired', 'totalVerified',
        'missingCount', 'hasAttestation', 'attestedAt', 'attestedByName',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="inventory-readiness_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/verification-activity
   * Inventory event activity by type and user
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      eventType?: string;
      userId?: string;
      groupBy?: 'day' | 'user' | 'type';
      format?: 'json' | 'csv';
    };
  }>('/verification-activity', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, eventType, userId, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get detailed events
    let detailSql = `
      SELECT
        ie.id,
        ie.event_type,
        ie.occurred_at,
        ie.notes,
        u.name as performed_by_name,
        u.id as performed_by_id,
        ii.barcode,
        ic.name as catalog_name,
        ic.category,
        l.name as location_name
      FROM inventory_event ie
      JOIN app_user u ON ie.performed_by_user_id = u.id
      JOIN inventory_item ii ON ie.inventory_item_id = ii.id
      JOIN item_catalog ic ON ii.catalog_id = ic.id
      LEFT JOIN location l ON ii.location_id = l.id
      WHERE ie.facility_id = $1
        AND ie.occurred_at >= $2::date
        AND ie.occurred_at < ($3::date + interval '1 day')
    `;
    const detailParams: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (eventType) {
      detailSql += ` AND ie.event_type = $${paramIndex++}`;
      detailParams.push(eventType);
    }

    if (userId) {
      detailSql += ` AND ie.performed_by_user_id = $${paramIndex++}`;
      detailParams.push(userId);
    }

    detailSql += ` ORDER BY ie.occurred_at DESC LIMIT 1000`;

    const detailResult = await query<{
      id: string;
      event_type: string;
      occurred_at: Date;
      notes: string | null;
      performed_by_name: string;
      performed_by_id: string;
      barcode: string | null;
      catalog_name: string;
      category: string;
      location_name: string | null;
    }>(detailSql, detailParams);

    const rows = detailResult.rows.map(row => ({
      eventId: row.id,
      eventType: row.event_type,
      occurredAt: formatTimestampForCSV(row.occurred_at),
      occurredDate: formatDateForCSV(row.occurred_at),
      performedByName: row.performed_by_name,
      performedById: row.performed_by_id,
      barcode: row.barcode || '',
      catalogName: row.catalog_name,
      category: row.category,
      locationName: row.location_name || '',
      notes: row.notes || '',
    }));

    // Get summary by type
    const summaryResult = await query<{
      event_type: string;
      count: string;
      unique_items: string;
    }>(`
      SELECT
        event_type,
        COUNT(*) as count,
        COUNT(DISTINCT inventory_item_id) as unique_items
      FROM inventory_event
      WHERE facility_id = $1
        AND occurred_at >= $2::date
        AND occurred_at < ($3::date + interval '1 day')
      GROUP BY event_type
      ORDER BY count DESC
    `, [facilityId, start, end]);

    const summary = {
      totalEvents: rows.length,
      byType: summaryResult.rows.map(r => ({
        eventType: r.event_type,
        count: parseInt(r.count),
        uniqueItems: parseInt(r.unique_items),
      })),
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'occurredDate', 'occurredAt', 'eventType', 'performedByName',
        'catalogName', 'category', 'barcode', 'locationName', 'notes',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="verification-activity_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/checklist-compliance
   * Checklist completion and signature coverage
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      checklistType?: 'TIMEOUT' | 'DEBRIEF';
      format?: 'json' | 'csv';
    };
  }>('/checklist-compliance', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, checklistType, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        sc.id as case_id,
        sc.procedure_name,
        sc.scheduled_date,
        u.name as surgeon_name,
        cci.type as checklist_type,
        cci.status as checklist_status,
        cci.started_at,
        cci.completed_at,
        cci.pending_scrub_review,
        cci.pending_surgeon_review,
        (
          SELECT json_agg(json_build_object('role', ccs.role, 'signedAt', ccs.signed_at, 'signedByName', su.name))
          FROM case_checklist_signature ccs
          JOIN app_user su ON ccs.signed_by_user_id = su.id
          WHERE ccs.instance_id = cci.id
        ) as signatures
      FROM case_checklist_instance cci
      JOIN surgical_case sc ON cci.case_id = sc.id
      JOIN app_user u ON sc.surgeon_id = u.id
      WHERE cci.facility_id = $1
        AND sc.scheduled_date BETWEEN $2 AND $3
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (checklistType) {
      sql += ` AND cci.type = $${paramIndex++}`;
      params.push(checklistType);
    }

    sql += ` ORDER BY sc.scheduled_date ASC, cci.type ASC`;

    const result = await query<{
      case_id: string;
      procedure_name: string;
      scheduled_date: Date;
      surgeon_name: string;
      checklist_type: string;
      checklist_status: string;
      started_at: Date | null;
      completed_at: Date | null;
      pending_scrub_review: boolean;
      pending_surgeon_review: boolean;
      signatures: Array<{ role: string; signedAt: string; signedByName: string }> | null;
    }>(sql, params);

    const rows = result.rows.map(row => {
      const sigs = row.signatures || [];
      return {
        caseId: row.case_id,
        procedureName: row.procedure_name,
        scheduledDate: formatDateForCSV(row.scheduled_date),
        surgeonName: row.surgeon_name,
        checklistType: row.checklist_type,
        checklistStatus: row.checklist_status,
        startedAt: formatTimestampForCSV(row.started_at),
        completedAt: formatTimestampForCSV(row.completed_at),
        circulatorSigned: sigs.some(s => s.role === 'CIRCULATOR') ? 'Yes' : 'No',
        surgeonSigned: sigs.some(s => s.role === 'SURGEON') ? 'Yes' : 'No',
        scrubSigned: sigs.some(s => s.role === 'SCRUB') ? 'Yes' : 'No',
        anesthesiaSigned: sigs.some(s => s.role === 'ANESTHESIA') ? 'Yes' : 'No',
        pendingScrubReview: row.pending_scrub_review ? 'Yes' : 'No',
        pendingSurgeonReview: row.pending_surgeon_review ? 'Yes' : 'No',
        signatureCount: sigs.length,
      };
    });

    // Calculate summary
    const timeoutRows = rows.filter(r => r.checklistType === 'TIMEOUT');
    const debriefRows = rows.filter(r => r.checklistType === 'DEBRIEF');

    const summary = {
      totalChecklists: rows.length,
      timeout: {
        total: timeoutRows.length,
        completed: timeoutRows.filter(r => r.checklistStatus === 'COMPLETED').length,
        inProgress: timeoutRows.filter(r => r.checklistStatus === 'IN_PROGRESS').length,
        notStarted: timeoutRows.filter(r => r.checklistStatus === 'NOT_STARTED').length,
        completionRate: timeoutRows.length > 0
          ? Math.round((timeoutRows.filter(r => r.checklistStatus === 'COMPLETED').length / timeoutRows.length) * 100)
          : 0,
      },
      debrief: {
        total: debriefRows.length,
        completed: debriefRows.filter(r => r.checklistStatus === 'COMPLETED').length,
        inProgress: debriefRows.filter(r => r.checklistStatus === 'IN_PROGRESS').length,
        notStarted: debriefRows.filter(r => r.checklistStatus === 'NOT_STARTED').length,
        completionRate: debriefRows.length > 0
          ? Math.round((debriefRows.filter(r => r.checklistStatus === 'COMPLETED').length / debriefRows.length) * 100)
          : 0,
        pendingReviews: debriefRows.filter(r => r.pendingScrubReview === 'Yes' || r.pendingSurgeonReview === 'Yes').length,
      },
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'scheduledDate', 'procedureName', 'surgeonName', 'checklistType', 'checklistStatus',
        'startedAt', 'completedAt', 'circulatorSigned', 'surgeonSigned', 'scrubSigned',
        'anesthesiaSigned', 'pendingScrubReview', 'pendingSurgeonReview', 'signatureCount',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="checklist-compliance_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/case-summary
   * Cases by status, surgeon, and procedure
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      status?: string;
      surgeonId?: string;
      format?: 'json' | 'csv';
    };
  }>('/case-summary', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, status, surgeonId, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        sc.id as case_id,
        sc.procedure_name,
        sc.scheduled_date,
        sc.scheduled_time,
        sc.status,
        sc.or_room,
        sc.is_active,
        sc.is_cancelled,
        sc.cancelled_at,
        sc.estimated_duration_minutes,
        u.name as surgeon_name,
        crc.readiness_state,
        crc.has_attestation,
        cc.procedure_name as case_card_name,
        (SELECT COUNT(*) FROM case_checklist_instance cci WHERE cci.case_id = sc.id AND cci.status = 'COMPLETED') as checklists_completed
      FROM surgical_case sc
      JOIN app_user u ON sc.surgeon_id = u.id
      LEFT JOIN case_readiness_cache crc ON sc.id = crc.case_id
      LEFT JOIN case_card_version ccv ON sc.case_card_version_id = ccv.id
      LEFT JOIN case_card cc ON ccv.case_card_id = cc.id
      WHERE sc.facility_id = $1
        AND sc.scheduled_date BETWEEN $2 AND $3
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (status) {
      sql += ` AND sc.status = $${paramIndex++}`;
      params.push(status);
    }

    if (surgeonId) {
      sql += ` AND sc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    sql += ` ORDER BY sc.scheduled_date ASC, sc.scheduled_time ASC NULLS LAST`;

    const result = await query<{
      case_id: string;
      procedure_name: string;
      scheduled_date: Date;
      scheduled_time: string | null;
      status: string;
      or_room: string | null;
      is_active: boolean;
      is_cancelled: boolean;
      cancelled_at: Date | null;
      estimated_duration_minutes: number | null;
      surgeon_name: string;
      readiness_state: string | null;
      has_attestation: boolean | null;
      case_card_name: string | null;
      checklists_completed: string;
    }>(sql, params);

    const rows = result.rows.map(row => ({
      caseId: row.case_id,
      procedureName: row.procedure_name,
      scheduledDate: formatDateForCSV(row.scheduled_date),
      scheduledTime: row.scheduled_time || '',
      status: row.status,
      orRoom: row.or_room || '',
      isActive: row.is_active ? 'Yes' : 'No',
      isCancelled: row.is_cancelled ? 'Yes' : 'No',
      cancelledAt: formatTimestampForCSV(row.cancelled_at),
      estimatedDuration: row.estimated_duration_minutes || '',
      surgeonName: row.surgeon_name,
      readinessState: row.readiness_state || 'UNKNOWN',
      hasAttestation: row.has_attestation ? 'Yes' : 'No',
      caseCardName: row.case_card_name || '',
      checklistsCompleted: parseInt(row.checklists_completed),
    }));

    // Calculate summary by status
    const statusCounts: Record<string, number> = {};
    rows.forEach(r => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    const summary = {
      totalCases: rows.length,
      byStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      activeCases: rows.filter(r => r.isActive === 'Yes').length,
      cancelledCases: rows.filter(r => r.isCancelled === 'Yes').length,
      withCaseCard: rows.filter(r => r.caseCardName !== '').length,
      attestedCases: rows.filter(r => r.hasAttestation === 'Yes').length,
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'scheduledDate', 'scheduledTime', 'procedureName', 'surgeonName', 'orRoom',
        'status', 'isActive', 'isCancelled', 'cancelledAt', 'estimatedDuration',
        'readinessState', 'hasAttestation', 'caseCardName', 'checklistsCompleted',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="case-summary_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  // ============================================================================
  // Wave 1: Financial Attribution Reports
  // ============================================================================

  /**
   * GET /reports/vendor-concessions
   * Cost overrides and gratis items by vendor and reason
   * Read-only reconcilable reporting endpoint
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      vendorId?: string;
      overrideReason?: string;
      format?: 'json' | 'csv';
    };
  }>('/vendor-concessions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, vendorId, overrideReason, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        ie.id AS event_id,
        ie.occurred_at,
        ie.event_type,
        ie.cost_snapshot_cents,
        ie.cost_override_cents,
        ie.cost_override_reason,
        ie.cost_override_note,
        ie.is_gratis,
        ie.gratis_reason,
        ie.provided_by_rep_name,
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.vendor_type,
        ic.name AS catalog_name,
        ic.category,
        ii.serial_number,
        ii.lot_number,
        sc.procedure_name AS case_name,
        sc.scheduled_date AS case_date,
        u.name AS performed_by_name,
        au.name AS attested_by_name
      FROM inventory_event ie
      JOIN inventory_item ii ON ie.inventory_item_id = ii.id
      JOIN item_catalog ic ON ii.catalog_id = ic.id
      LEFT JOIN vendor v ON ie.provided_by_vendor_id = v.id
      LEFT JOIN surgical_case sc ON ie.case_id = sc.id
      JOIN app_user u ON ie.performed_by_user_id = u.id
      LEFT JOIN app_user au ON ie.financial_attestation_user_id = au.id
      WHERE ie.facility_id = $1
        AND ie.occurred_at >= $2::date
        AND ie.occurred_at < ($3::date + interval '1 day')
        AND (ie.cost_override_cents IS NOT NULL OR ie.is_gratis = true)
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (vendorId) {
      sql += ` AND ie.provided_by_vendor_id = $${paramIndex++}`;
      params.push(vendorId);
    }

    if (overrideReason) {
      sql += ` AND ie.cost_override_reason = $${paramIndex++}`;
      params.push(overrideReason);
    }

    sql += ` ORDER BY ie.occurred_at DESC`;

    const result = await query<{
      event_id: string;
      occurred_at: Date;
      event_type: string;
      cost_snapshot_cents: number | null;
      cost_override_cents: number | null;
      cost_override_reason: string | null;
      cost_override_note: string | null;
      is_gratis: boolean;
      gratis_reason: string | null;
      provided_by_rep_name: string | null;
      vendor_id: string | null;
      vendor_name: string | null;
      vendor_type: string | null;
      catalog_name: string;
      category: string;
      serial_number: string | null;
      lot_number: string | null;
      case_name: string | null;
      case_date: Date | null;
      performed_by_name: string;
      attested_by_name: string | null;
    }>(sql, params);

    const rows = result.rows.map(row => {
      const catalogCostCents = row.cost_snapshot_cents || 0;
      const actualCostCents = row.is_gratis ? 0 : (row.cost_override_cents ?? row.cost_snapshot_cents ?? 0);
      const savingsCents = catalogCostCents - actualCostCents;

      return {
        eventId: row.event_id,
        occurredAt: formatTimestampForCSV(row.occurred_at),
        eventType: row.event_type,
        vendorId: row.vendor_id || '',
        vendorName: row.vendor_name || 'Unknown',
        vendorType: row.vendor_type || '',
        repName: row.provided_by_rep_name || '',
        catalogName: row.catalog_name,
        category: row.category,
        serialNumber: row.serial_number || '',
        lotNumber: row.lot_number || '',
        caseName: row.case_name || '',
        caseDate: formatDateForCSV(row.case_date),
        catalogCostCents,
        catalogCostDollars: (catalogCostCents / 100).toFixed(2),
        actualCostCents,
        actualCostDollars: (actualCostCents / 100).toFixed(2),
        savingsCents,
        savingsDollars: (savingsCents / 100).toFixed(2),
        isGratis: row.is_gratis ? 'Yes' : 'No',
        gratisReason: row.gratis_reason || '',
        overrideReason: row.cost_override_reason || '',
        overrideNote: row.cost_override_note || '',
        performedBy: row.performed_by_name,
        attestedBy: row.attested_by_name || '',
      };
    });

    // Calculate summary
    const totalCatalogCents = rows.reduce((sum, r) => sum + r.catalogCostCents, 0);
    const totalActualCents = rows.reduce((sum, r) => sum + r.actualCostCents, 0);
    const totalSavingsCents = rows.reduce((sum, r) => sum + r.savingsCents, 0);
    const gratisCount = rows.filter(r => r.isGratis === 'Yes').length;

    // Group by vendor
    const byVendor: Record<string, { count: number; savingsCents: number }> = {};
    rows.forEach(r => {
      const vn = r.vendorName;
      if (!byVendor[vn]) byVendor[vn] = { count: 0, savingsCents: 0 };
      byVendor[vn].count++;
      byVendor[vn].savingsCents += r.savingsCents;
    });

    // Group by reason
    const byReason: Record<string, { count: number; savingsCents: number }> = {};
    rows.forEach(r => {
      const reason = r.isGratis === 'Yes' ? `GRATIS:${r.gratisReason || 'OTHER'}` : (r.overrideReason || 'NONE');
      if (!byReason[reason]) byReason[reason] = { count: 0, savingsCents: 0 };
      byReason[reason].count++;
      byReason[reason].savingsCents += r.savingsCents;
    });

    const summary = {
      totalEvents: rows.length,
      totalCatalogValue: { cents: totalCatalogCents, dollars: (totalCatalogCents / 100).toFixed(2) },
      totalActualCost: { cents: totalActualCents, dollars: (totalActualCents / 100).toFixed(2) },
      totalSavings: { cents: totalSavingsCents, dollars: (totalSavingsCents / 100).toFixed(2) },
      gratisCount,
      byVendor: Object.entries(byVendor).map(([name, data]) => ({
        vendorName: name,
        count: data.count,
        savingsCents: data.savingsCents,
        savingsDollars: (data.savingsCents / 100).toFixed(2),
      })),
      byReason: Object.entries(byReason).map(([reason, data]) => ({
        reason,
        count: data.count,
        savingsCents: data.savingsCents,
        savingsDollars: (data.savingsCents / 100).toFixed(2),
      })),
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'occurredAt', 'vendorName', 'repName', 'catalogName', 'category',
        'serialNumber', 'lotNumber', 'caseName', 'caseDate',
        'catalogCostDollars', 'actualCostDollars', 'savingsDollars',
        'isGratis', 'gratisReason', 'overrideReason', 'overrideNote',
        'performedBy', 'attestedBy',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="vendor-concessions_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/inventory-valuation
   * Current inventory value by ownership type and category
   * Read-only reconcilable reporting endpoint
   */
  fastify.get<{
    Querystring: {
      ownershipType?: string;
      category?: string;
      format?: 'json' | 'csv';
    };
  }>('/inventory-valuation', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { ownershipType, category, format = 'json' } = request.query;

    let sql = `
      SELECT
        ii.id AS item_id,
        ii.serial_number,
        ii.lot_number,
        ii.barcode,
        ii.sterility_expires_at,
        ii.availability_status,
        ii.ownership_type,
        ic.id AS catalog_id,
        ic.name AS catalog_name,
        ic.category,
        ic.manufacturer,
        ic.unit_cost_cents,
        ic.ownership_type AS catalog_ownership_type,
        v.name AS consignment_vendor_name,
        ls.set_identifier AS loaner_set_id,
        lsv.name AS loaner_vendor_name
      FROM inventory_item ii
      JOIN item_catalog ic ON ii.catalog_id = ic.id
      LEFT JOIN vendor v ON ic.consignment_vendor_id = v.id
      LEFT JOIN loaner_set ls ON ii.loaner_set_id = ls.id
      LEFT JOIN vendor lsv ON ls.vendor_id = lsv.id
      WHERE ii.facility_id = $1
        AND ii.availability_status NOT IN ('UNAVAILABLE', 'MISSING')
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    if (ownershipType) {
      sql += ` AND (ii.ownership_type = $${paramIndex} OR ic.ownership_type = $${paramIndex})`;
      params.push(ownershipType);
      paramIndex++;
    }

    if (category) {
      sql += ` AND ic.category = $${paramIndex++}`;
      params.push(category);
    }

    sql += ` ORDER BY ic.category, ic.name, ii.created_at`;

    const result = await query<{
      item_id: string;
      serial_number: string | null;
      lot_number: string | null;
      barcode: string | null;
      sterility_expires_at: Date | null;
      availability_status: string;
      ownership_type: string | null;
      catalog_id: string;
      catalog_name: string;
      category: string;
      manufacturer: string | null;
      unit_cost_cents: number | null;
      catalog_ownership_type: string | null;
      consignment_vendor_name: string | null;
      loaner_set_id: string | null;
      loaner_vendor_name: string | null;
    }>(sql, params);

    const rows = result.rows.map(row => {
      const effectiveOwnership = row.ownership_type || row.catalog_ownership_type || 'OWNED';
      const costCents = row.unit_cost_cents || 0;

      return {
        itemId: row.item_id,
        catalogId: row.catalog_id,
        catalogName: row.catalog_name,
        category: row.category,
        manufacturer: row.manufacturer || '',
        serialNumber: row.serial_number || '',
        lotNumber: row.lot_number || '',
        barcode: row.barcode || '',
        expiresAt: formatDateForCSV(row.sterility_expires_at),
        availabilityStatus: row.availability_status,
        ownershipType: effectiveOwnership,
        unitCostCents: costCents,
        unitCostDollars: (costCents / 100).toFixed(2),
        consignmentVendor: row.consignment_vendor_name || '',
        loanerSetId: row.loaner_set_id || '',
        loanerVendor: row.loaner_vendor_name || '',
      };
    });

    // Calculate summary by ownership type
    const byOwnership: Record<string, { count: number; valueCents: number }> = {};
    rows.forEach(r => {
      const ot = r.ownershipType;
      if (!byOwnership[ot]) byOwnership[ot] = { count: 0, valueCents: 0 };
      byOwnership[ot].count++;
      byOwnership[ot].valueCents += r.unitCostCents;
    });

    // Calculate summary by category
    const byCategory: Record<string, { count: number; valueCents: number }> = {};
    rows.forEach(r => {
      const cat = r.category;
      if (!byCategory[cat]) byCategory[cat] = { count: 0, valueCents: 0 };
      byCategory[cat].count++;
      byCategory[cat].valueCents += r.unitCostCents;
    });

    const totalValueCents = rows.reduce((sum, r) => sum + r.unitCostCents, 0);

    const summary = {
      totalItems: rows.length,
      totalValue: { cents: totalValueCents, dollars: (totalValueCents / 100).toFixed(2) },
      byOwnershipType: Object.entries(byOwnership).map(([type, data]) => ({
        ownershipType: type,
        itemCount: data.count,
        valueCents: data.valueCents,
        valueDollars: (data.valueCents / 100).toFixed(2),
      })),
      byCategory: Object.entries(byCategory).map(([cat, data]) => ({
        category: cat,
        itemCount: data.count,
        valueCents: data.valueCents,
        valueDollars: (data.valueCents / 100).toFixed(2),
      })),
      generatedAt: new Date().toISOString(),
    };

    if (format === 'csv') {
      const headers = [
        'catalogName', 'category', 'manufacturer', 'serialNumber', 'lotNumber',
        'barcode', 'expiresAt', 'availabilityStatus', 'ownershipType',
        'unitCostDollars', 'consignmentVendor', 'loanerSetId', 'loanerVendor',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="inventory-valuation_${new Date().toISOString().split('T')[0]}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/loaner-exposure
   * Open loaner sets with estimated values and due dates
   * Read-only reconcilable reporting endpoint
   */
  fastify.get<{
    Querystring: {
      vendorId?: string;
      isOverdue?: string;
      format?: 'json' | 'csv';
    };
  }>('/loaner-exposure', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { vendorId, isOverdue, format = 'json' } = request.query;

    let sql = `
      SELECT
        ls.id AS loaner_set_id,
        ls.set_identifier,
        ls.description,
        ls.received_at,
        ls.expected_return_date,
        ls.item_count AS declared_item_count,
        ls.notes,
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.contact_name AS vendor_contact,
        v.contact_email AS vendor_email,
        v.contact_phone AS vendor_phone,
        sc.id AS case_id,
        sc.procedure_name AS case_name,
        sc.scheduled_date AS case_date,
        ru.name AS received_by_name,
        (
          SELECT COUNT(*)
          FROM inventory_item ii
          WHERE ii.loaner_set_id = ls.id
        ) AS actual_item_count,
        (
          SELECT COALESCE(SUM(ic.unit_cost_cents), 0)
          FROM inventory_item ii
          JOIN item_catalog ic ON ii.catalog_id = ic.id
          WHERE ii.loaner_set_id = ls.id
        ) AS estimated_value_cents
      FROM loaner_set ls
      JOIN vendor v ON ls.vendor_id = v.id
      LEFT JOIN surgical_case sc ON ls.case_id = sc.id
      JOIN app_user ru ON ls.received_by_user_id = ru.id
      WHERE ls.facility_id = $1
        AND ls.returned_at IS NULL
    `;
    const params: unknown[] = [facilityId];
    let paramIndex = 2;

    if (vendorId) {
      sql += ` AND ls.vendor_id = $${paramIndex++}`;
      params.push(vendorId);
    }

    if (isOverdue === 'true') {
      sql += ` AND ls.expected_return_date < CURRENT_DATE`;
    }

    sql += ` ORDER BY ls.expected_return_date ASC NULLS LAST, ls.received_at ASC`;

    const result = await query<{
      loaner_set_id: string;
      set_identifier: string;
      description: string | null;
      received_at: Date;
      expected_return_date: Date | null;
      declared_item_count: number | null;
      notes: string | null;
      vendor_id: string;
      vendor_name: string;
      vendor_contact: string | null;
      vendor_email: string | null;
      vendor_phone: string | null;
      case_id: string | null;
      case_name: string | null;
      case_date: Date | null;
      received_by_name: string;
      actual_item_count: string;
      estimated_value_cents: string;
    }>(sql, params);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = result.rows.map(row => {
      const expectedReturn = row.expected_return_date ? new Date(row.expected_return_date) : null;
      let daysOverdue: number | null = null;
      let isSetOverdue = false;

      if (expectedReturn) {
        expectedReturn.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - expectedReturn.getTime();
        daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isSetOverdue = daysOverdue > 0;
      }

      const valueCents = parseInt(row.estimated_value_cents) || 0;

      return {
        loanerSetId: row.loaner_set_id,
        setIdentifier: row.set_identifier,
        description: row.description || '',
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        vendorContact: row.vendor_contact || '',
        vendorEmail: row.vendor_email || '',
        vendorPhone: row.vendor_phone || '',
        caseId: row.case_id || '',
        caseName: row.case_name || '',
        caseDate: formatDateForCSV(row.case_date),
        receivedAt: formatDateForCSV(row.received_at),
        receivedBy: row.received_by_name,
        expectedReturnDate: formatDateForCSV(row.expected_return_date),
        isOverdue: isSetOverdue ? 'Yes' : 'No',
        daysOverdue: daysOverdue !== null && daysOverdue > 0 ? daysOverdue : 0,
        declaredItemCount: row.declared_item_count || 0,
        actualItemCount: parseInt(row.actual_item_count) || 0,
        estimatedValueCents: valueCents,
        estimatedValueDollars: (valueCents / 100).toFixed(2),
        notes: row.notes || '',
      };
    });

    // Calculate summary
    const totalValueCents = rows.reduce((sum, r) => sum + r.estimatedValueCents, 0);
    const overdueRows = rows.filter(r => r.isOverdue === 'Yes');
    const overdueValueCents = overdueRows.reduce((sum, r) => sum + r.estimatedValueCents, 0);

    // Group by vendor
    const byVendor: Record<string, { count: number; valueCents: number; overdueCount: number }> = {};
    rows.forEach(r => {
      const vn = r.vendorName;
      if (!byVendor[vn]) byVendor[vn] = { count: 0, valueCents: 0, overdueCount: 0 };
      byVendor[vn].count++;
      byVendor[vn].valueCents += r.estimatedValueCents;
      if (r.isOverdue === 'Yes') byVendor[vn].overdueCount++;
    });

    const summary = {
      totalOpenSets: rows.length,
      totalEstimatedValue: { cents: totalValueCents, dollars: (totalValueCents / 100).toFixed(2) },
      overdueCount: overdueRows.length,
      overdueValue: { cents: overdueValueCents, dollars: (overdueValueCents / 100).toFixed(2) },
      byVendor: Object.entries(byVendor).map(([name, data]) => ({
        vendorName: name,
        openSets: data.count,
        overdueSets: data.overdueCount,
        valueCents: data.valueCents,
        valueDollars: (data.valueCents / 100).toFixed(2),
      })),
      generatedAt: new Date().toISOString(),
    };

    if (format === 'csv') {
      const headers = [
        'setIdentifier', 'vendorName', 'description', 'caseName', 'caseDate',
        'receivedAt', 'receivedBy', 'expectedReturnDate', 'isOverdue', 'daysOverdue',
        'declaredItemCount', 'actualItemCount', 'estimatedValueDollars',
        'vendorContact', 'vendorEmail', 'vendorPhone', 'notes',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="loaner-exposure_${new Date().toISOString().split('T')[0]}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  // ============================================================================
  // Audit Reports
  // ============================================================================

  /**
   * GET /reports/cancelled-cases
   * Cancelled cases with reasons, prior status, and cancelling user
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      surgeonId?: string;
      format?: 'json' | 'csv';
    };
  }>('/cancelled-cases', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, surgeonId, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        sc.id AS case_id,
        sc.procedure_name,
        sc.scheduled_date,
        sc.or_room,
        u.name AS surgeon_name,
        sc.cancelled_at,
        cancel_event.from_status,
        cancel_event.reason AS cancellation_reason,
        canceller.name AS cancelled_by_name
      FROM surgical_case sc
      JOIN app_user u ON sc.surgeon_id = u.id
      LEFT JOIN LATERAL (
        SELECT scse.from_status, scse.reason, scse.actor_user_id
        FROM surgical_case_status_event scse
        WHERE scse.surgical_case_id = sc.id
          AND scse.to_status = 'CANCELLED'
        ORDER BY scse.created_at DESC
        LIMIT 1
      ) cancel_event ON true
      LEFT JOIN app_user canceller ON cancel_event.actor_user_id = canceller.id
      WHERE sc.facility_id = $1
        AND sc.is_cancelled = true
        AND sc.scheduled_date BETWEEN $2 AND $3
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (surgeonId) {
      sql += ` AND sc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    sql += ` ORDER BY sc.cancelled_at DESC NULLS LAST, sc.scheduled_date DESC`;

    const result = await query<{
      case_id: string;
      procedure_name: string;
      scheduled_date: Date;
      or_room: string | null;
      surgeon_name: string;
      cancelled_at: Date | null;
      from_status: string | null;
      cancellation_reason: string | null;
      cancelled_by_name: string | null;
    }>(sql, params);

    const rows = result.rows.map(row => ({
      caseId: row.case_id,
      procedureName: row.procedure_name,
      scheduledDate: formatDateForCSV(row.scheduled_date),
      orRoom: row.or_room || '',
      surgeonName: row.surgeon_name,
      cancelledAt: formatTimestampForCSV(row.cancelled_at),
      priorStatus: row.from_status || 'UNKNOWN',
      cancellationReason: row.cancellation_reason || '',
      cancelledByName: row.cancelled_by_name || 'System',
    }));

    // Summary: total, by surgeon, by prior status
    const bySurgeon: Record<string, number> = {};
    const byPriorStatus: Record<string, number> = {};
    rows.forEach(r => {
      bySurgeon[r.surgeonName] = (bySurgeon[r.surgeonName] || 0) + 1;
      byPriorStatus[r.priorStatus] = (byPriorStatus[r.priorStatus] || 0) + 1;
    });

    const summary = {
      totalCancelled: rows.length,
      bySurgeon: Object.entries(bySurgeon).map(([name, count]) => ({ surgeonName: name, count })),
      byPriorStatus: Object.entries(byPriorStatus).map(([status, count]) => ({ status, count })),
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'scheduledDate', 'procedureName', 'surgeonName', 'orRoom',
        'priorStatus', 'cancellationReason', 'cancelledByName', 'cancelledAt',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="cancelled-cases_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/case-timelines
   * Case status transition history with actors and reasons
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      surgeonId?: string;
      toStatus?: string;
      format?: 'json' | 'csv';
    };
  }>('/case-timelines', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, surgeonId, toStatus, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        scse.id AS event_id,
        scse.created_at,
        scse.from_status,
        scse.to_status,
        scse.reason,
        sc.procedure_name,
        surgeon.name AS surgeon_name,
        actor.name AS actor_name
      FROM surgical_case_status_event scse
      JOIN surgical_case sc ON scse.surgical_case_id = sc.id
      JOIN app_user surgeon ON sc.surgeon_id = surgeon.id
      LEFT JOIN app_user actor ON scse.actor_user_id = actor.id
      WHERE sc.facility_id = $1
        AND scse.created_at >= $2::date
        AND scse.created_at < ($3::date + interval '1 day')
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (surgeonId) {
      sql += ` AND sc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    if (toStatus) {
      sql += ` AND scse.to_status = $${paramIndex++}`;
      params.push(toStatus);
    }

    sql += ` ORDER BY scse.created_at DESC LIMIT 2000`;

    const result = await query<{
      event_id: string;
      created_at: Date;
      from_status: string | null;
      to_status: string;
      reason: string | null;
      procedure_name: string;
      surgeon_name: string;
      actor_name: string | null;
    }>(sql, params);

    const rows = result.rows.map(row => ({
      eventId: row.event_id,
      occurredAt: formatTimestampForCSV(row.created_at),
      procedureName: row.procedure_name,
      surgeonName: row.surgeon_name,
      fromStatus: row.from_status || '(created)',
      toStatus: row.to_status,
      reason: row.reason || '',
      actorName: row.actor_name || 'System',
    }));

    // Summary: total, by transition type
    const byTransition: Record<string, number> = {};
    rows.forEach(r => {
      const key = `${r.fromStatus} → ${r.toStatus}`;
      byTransition[key] = (byTransition[key] || 0) + 1;
    });

    const summary = {
      totalTransitions: rows.length,
      byTransition: Object.entries(byTransition).map(([transition, count]) => ({ transition, count })),
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'occurredAt', 'procedureName', 'surgeonName', 'fromStatus', 'toStatus', 'reason', 'actorName',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="case-timelines_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/debrief-summary
   * Debrief checklist completion, duration, signatures, and flagged items
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      surgeonId?: string;
      debriefStatus?: string;
      format?: 'json' | 'csv';
    };
  }>('/debrief-summary', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, surgeonId, debriefStatus, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        sc.id AS case_id,
        sc.procedure_name,
        sc.scheduled_date,
        u.name AS surgeon_name,
        cci.status AS checklist_status,
        cci.started_at,
        cci.completed_at,
        cci.pending_scrub_review,
        cci.pending_surgeon_review,
        cci.surgeon_flagged,
        (
          SELECT json_agg(json_build_object('role', ccs.role, 'signedAt', ccs.signed_at, 'signedByName', su.name))
          FROM case_checklist_signature ccs
          JOIN app_user su ON ccs.signed_by_user_id = su.id
          WHERE ccs.instance_id = cci.id
        ) AS signatures
      FROM case_checklist_instance cci
      JOIN surgical_case sc ON cci.case_id = sc.id
      JOIN app_user u ON sc.surgeon_id = u.id
      WHERE cci.facility_id = $1
        AND cci.type = 'DEBRIEF'
        AND sc.scheduled_date BETWEEN $2 AND $3
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (surgeonId) {
      sql += ` AND sc.surgeon_id = $${paramIndex++}`;
      params.push(surgeonId);
    }

    if (debriefStatus) {
      sql += ` AND cci.status = $${paramIndex++}`;
      params.push(debriefStatus);
    }

    sql += ` ORDER BY sc.scheduled_date ASC, sc.procedure_name ASC`;

    const result = await query<{
      case_id: string;
      procedure_name: string;
      scheduled_date: Date;
      surgeon_name: string;
      checklist_status: string;
      started_at: Date | null;
      completed_at: Date | null;
      pending_scrub_review: boolean;
      pending_surgeon_review: boolean;
      surgeon_flagged: boolean;
      signatures: Array<{ role: string; signedAt: string; signedByName: string }> | null;
    }>(sql, params);

    const rows = result.rows.map(row => {
      const sigs = row.signatures || [];
      let durationMinutes: number | null = null;
      if (row.started_at && row.completed_at) {
        durationMinutes = Math.round((new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 60000);
      }

      return {
        caseId: row.case_id,
        procedureName: row.procedure_name,
        scheduledDate: formatDateForCSV(row.scheduled_date),
        surgeonName: row.surgeon_name,
        checklistStatus: row.checklist_status,
        startedAt: formatTimestampForCSV(row.started_at),
        completedAt: formatTimestampForCSV(row.completed_at),
        durationMinutes: durationMinutes !== null ? durationMinutes : '',
        circulatorSigned: sigs.some(s => s.role === 'CIRCULATOR') ? 'Yes' : 'No',
        surgeonSigned: sigs.some(s => s.role === 'SURGEON') ? 'Yes' : 'No',
        scrubSigned: sigs.some(s => s.role === 'SCRUB') ? 'Yes' : 'No',
        pendingReviews: (row.pending_scrub_review ? 'Scrub ' : '') + (row.pending_surgeon_review ? 'Surgeon' : '') || 'None',
        flagged: row.surgeon_flagged ? 'Yes' : 'No',
      };
    });

    // Summary
    const completedRows = rows.filter(r => r.checklistStatus === 'COMPLETED');
    const durations = rows.filter(r => typeof r.durationMinutes === 'number').map(r => r.durationMinutes as number);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;

    const summary = {
      totalDebriefs: rows.length,
      completionRate: rows.length > 0 ? Math.round((completedRows.length / rows.length) * 100) : 0,
      avgDurationMinutes: avgDuration,
      pendingCount: rows.filter(r => r.pendingReviews !== 'None').length,
      flaggedCount: rows.filter(r => r.flagged === 'Yes').length,
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'scheduledDate', 'procedureName', 'surgeonName', 'checklistStatus',
        'startedAt', 'completedAt', 'durationMinutes',
        'circulatorSigned', 'surgeonSigned', 'scrubSigned', 'pendingReviews', 'flagged',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="debrief-summary_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });

  /**
   * GET /reports/case-event-log
   * Cross-case event log with type, user, and description
   */
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      eventType?: string;
      format?: 'json' | 'csv';
    };
  }>('/case-event-log', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { facilityId } = request.user;
    const { startDate, endDate, eventType, format = 'json' } = request.query;

    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let sql = `
      SELECT
        cel.id AS event_id,
        cel.created_at,
        cel.event_type,
        cel.user_name,
        cel.user_role,
        cel.description,
        sc.procedure_name
      FROM case_event_log cel
      JOIN surgical_case sc ON cel.case_id = sc.id
      WHERE cel.facility_id = $1
        AND cel.created_at >= $2::date
        AND cel.created_at < ($3::date + interval '1 day')
    `;
    const params: unknown[] = [facilityId, start, end];
    let paramIndex = 4;

    if (eventType) {
      sql += ` AND cel.event_type = $${paramIndex++}`;
      params.push(eventType);
    }

    sql += ` ORDER BY cel.created_at DESC LIMIT 2000`;

    const result = await query<{
      event_id: string;
      created_at: Date;
      event_type: string;
      user_name: string;
      user_role: string;
      description: string;
      procedure_name: string;
    }>(sql, params);

    const rows = result.rows.map(row => ({
      eventId: row.event_id,
      occurredAt: formatTimestampForCSV(row.created_at),
      eventType: row.event_type,
      procedureName: row.procedure_name,
      userName: row.user_name,
      userRole: row.user_role,
      description: row.description,
    }));

    // Summary: total, by event type
    const byEventType: Record<string, number> = {};
    rows.forEach(r => {
      byEventType[r.eventType] = (byEventType[r.eventType] || 0) + 1;
    });

    const summary = {
      totalEvents: rows.length,
      byEventType: Object.entries(byEventType).map(([type, count]) => ({ eventType: type, count })),
      dateRange: { start, end },
    };

    if (format === 'csv') {
      const headers = [
        'occurredAt', 'eventType', 'procedureName', 'userName', 'userRole', 'description',
      ];
      const csv = generateCSV(headers, rows);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="case-event-log_${start}_${end}.csv"`)
        .send(csv);
    }

    return reply.send({ rows, summary });
  });
}
