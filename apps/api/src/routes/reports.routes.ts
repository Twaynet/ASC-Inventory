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
  category: 'inventory' | 'cases' | 'compliance';
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
}
