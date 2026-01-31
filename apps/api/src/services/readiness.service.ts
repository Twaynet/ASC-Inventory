/**
 * Readiness Service
 *
 * Bridges database queries with pure domain readiness evaluation logic.
 * Handles caching via case_readiness_cache table.
 */

import { query, transaction } from '../db/index.js';
import {
  evaluateCaseReadiness,
  evaluateBatchReadiness,
  type CaseForReadiness,
  type ReadinessOutput,
  type CaseRequirement,
  type ItemCatalog,
  type InventoryItem,
  type Attestation,
  type User,
  type CaseId,
  type FacilityId,
} from '@asc/domain';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a Date to YYYY-MM-DD string without timezone conversion.
 * PostgreSQL DATE columns are returned at midnight UTC, so we need to
 * extract the date components directly to avoid day shifts.
 */
function formatDateLocal(date: Date): string {
  // For PostgreSQL DATE columns, the date is stored without timezone
  // When retrieved, it comes as midnight UTC. We want the UTC date parts.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a date string (YYYY-MM-DD) to a Date at midnight UTC.
 * This ensures consistent handling when passing to PostgreSQL.
 */
function parseDateUTC(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00.000Z');
}

/**
 * Normalize a date input to both string and Date formats.
 */
function normalizeDateInput(input: Date | string): { dateStr: string; dateObj: Date } {
  if (typeof input === 'string') {
    return { dateStr: input, dateObj: parseDateUTC(input) };
  }
  return { dateStr: formatDateLocal(input), dateObj: input };
}

// ============================================================================
// TYPES
// ============================================================================

interface CaseReadinessCacheRow {
  case_id: string;
  facility_id: string;
  scheduled_date: Date;
  procedure_name: string;
  surgeon_name: string;
  readiness_state: string;
  missing_items: unknown[];
  total_required_items: number;
  total_verified_items: number;
  has_attestation: boolean;
  attested_at: Date | null;
  attested_by_name: string | null;
  attestation_id: string | null;
  has_surgeon_acknowledgment: boolean;
  surgeon_acknowledged_at: Date | null;
  surgeon_acknowledgment_id: string | null;
  computed_at: Date;
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

async function getCasesForDate(
  facilityId: string,
  targetDate: Date | string
): Promise<CaseForReadiness[]> {
  const dateStr = typeof targetDate === 'string' ? targetDate : formatDateLocal(targetDate);
  const result = await query<{
    id: string;
    facility_id: string;
    scheduled_date: Date;
    scheduled_time: string | null;
    procedure_name: string;
    surgeon_id: string;
  }>(`
    SELECT id, facility_id, scheduled_date, scheduled_time, procedure_name, surgeon_id
    FROM surgical_case
    WHERE facility_id = $1
      AND scheduled_date = $2
      AND status NOT IN ('CANCELLED', 'COMPLETED')
    ORDER BY scheduled_time NULLS LAST, created_at
  `, [facilityId, dateStr]);

  return result.rows.map(row => ({
    id: row.id as CaseId,
    facilityId: row.facility_id,
    scheduledDate: row.scheduled_date,
    procedureName: row.procedure_name,
    surgeonId: row.surgeon_id,
  }));
}

async function getRequirementsForCases(
  caseIds: string[]
): Promise<Map<string, CaseRequirement[]>> {
  if (caseIds.length === 0) return new Map();

  const result = await query<{
    id: string;
    case_id: string;
    catalog_id: string;
    quantity: number;
    is_surgeon_override: boolean;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT id, case_id, catalog_id, quantity, is_surgeon_override, notes, created_at, updated_at
    FROM case_requirement
    WHERE case_id = ANY($1)
  `, [caseIds]);

  const map = new Map<string, CaseRequirement[]>();
  for (const row of result.rows) {
    const existing = map.get(row.case_id) || [];
    existing.push({
      id: row.id as any,
      caseId: row.case_id as CaseId,
      catalogId: row.catalog_id as any,
      quantity: row.quantity,
      isSurgeonOverride: row.is_surgeon_override,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    map.set(row.case_id, existing);
  }
  return map;
}

async function getCatalogItems(facilityId: string): Promise<Map<string, ItemCatalog>> {
  const result = await query<{
    id: string;
    facility_id: string;
    name: string;
    description: string | null;
    category: string;
    manufacturer: string | null;
    catalog_number: string | null;
    requires_sterility: boolean;
    is_loaner: boolean;
    active: boolean;
    // v1.1 Risk-Intent Extensions
    requires_lot_tracking: boolean;
    requires_serial_tracking: boolean;
    requires_expiration_tracking: boolean;
    criticality: string;
    readiness_required: boolean;
    expiration_warning_days: number | null;
    substitutable: boolean;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT * FROM item_catalog
    WHERE facility_id = $1 AND active = true
  `, [facilityId]);

  const map = new Map<string, ItemCatalog>();
  for (const row of result.rows) {
    map.set(row.id, {
      id: row.id as any,
      facilityId: row.facility_id as FacilityId,
      name: row.name,
      description: row.description ?? undefined,
      category: row.category as any,
      manufacturer: row.manufacturer ?? undefined,
      catalogNumber: row.catalog_number ?? undefined,
      requiresSterility: row.requires_sterility,
      isLoaner: row.is_loaner,
      active: row.active,
      // v1.1 Risk-Intent Extensions
      requiresLotTracking: row.requires_lot_tracking,
      requiresSerialTracking: row.requires_serial_tracking,
      requiresExpirationTracking: row.requires_expiration_tracking,
      criticality: row.criticality as any,
      readinessRequired: row.readiness_required,
      expirationWarningDays: row.expiration_warning_days,
      substitutable: row.substitutable,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

async function getAvailableInventory(facilityId: string): Promise<InventoryItem[]> {
  const result = await query<{
    id: string;
    facility_id: string;
    catalog_id: string;
    serial_number: string | null;
    lot_number: string | null;
    barcode: string | null;
    location_id: string | null;
    sterility_status: string;
    sterility_expires_at: Date | null;
    availability_status: string;
    reserved_for_case_id: string | null;
    last_verified_at: Date | null;
    last_verified_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT * FROM inventory_item
    WHERE facility_id = $1
      AND availability_status IN ('AVAILABLE', 'RESERVED')
  `, [facilityId]);

  return result.rows.map(row => ({
    id: row.id as any,
    facilityId: row.facility_id as FacilityId,
    catalogId: row.catalog_id as any,
    serialNumber: row.serial_number ?? undefined,
    lotNumber: row.lot_number ?? undefined,
    barcode: row.barcode ?? undefined,
    locationId: row.location_id as any,
    sterilityStatus: row.sterility_status as any,
    sterilityExpiresAt: row.sterility_expires_at ?? undefined,
    availabilityStatus: row.availability_status as any,
    reservedForCaseId: row.reserved_for_case_id as CaseId | undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    lastVerifiedByUserId: row.last_verified_by_user_id as any,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getAttestationsForCases(
  caseIds: string[]
): Promise<Map<string, Attestation[]>> {
  if (caseIds.length === 0) return new Map();

  const result = await query<{
    id: string;
    facility_id: string;
    case_id: string;
    type: string;
    attested_by_user_id: string;
    readiness_state_at_time: string;
    notes: string | null;
    created_at: Date;
  }>(`
    SELECT * FROM attestation
    WHERE case_id = ANY($1) AND voided_at IS NULL
  `, [caseIds]);

  const map = new Map<string, Attestation[]>();
  for (const row of result.rows) {
    const existing = map.get(row.case_id) || [];
    existing.push({
      id: row.id as any,
      facilityId: row.facility_id as FacilityId,
      caseId: row.case_id as CaseId,
      type: row.type as any,
      attestedByUserId: row.attested_by_user_id as any,
      readinessStateAtTime: row.readiness_state_at_time as any,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    });
    map.set(row.case_id, existing);
  }
  return map;
}

async function getSurgeons(facilityId: string): Promise<Map<string, User>> {
  const result = await query<{
    id: string;
    facility_id: string;
    username: string;
    email: string | null;
    name: string;
    role: string;
    roles: string[];
    password_hash: string;
    active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT * FROM app_user
    WHERE facility_id = $1 AND role = 'SURGEON'
  `, [facilityId]);

  const map = new Map<string, User>();
  for (const row of result.rows) {
    map.set(row.id, {
      id: row.id as any,
      facilityId: row.facility_id as FacilityId,
      username: row.username,
      email: row.email ?? undefined,
      name: row.name,
      role: row.role as any,
      roles: (row.roles ?? [row.role]) as any,
      passwordHash: row.password_hash,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

async function getUserName(userId: string): Promise<string | undefined> {
  const result = await query<{ name: string }>(`
    SELECT name FROM app_user WHERE id = $1
  `, [userId]);
  return result.rows[0]?.name;
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Compute readiness for all cases on a given date (day-before query)
 * @param targetDate - Date string (YYYY-MM-DD) or Date object
 */
export async function computeDayBeforeReadiness(
  facilityId: string,
  targetDate: Date | string
): Promise<{
  cases: ReadinessOutput[];
  surgeonNames: Map<string, string>;
}> {
  const { dateStr, dateObj } = normalizeDateInput(targetDate);

  // Fetch all required data
  const cases = await getCasesForDate(facilityId, dateStr);
  const caseIds = cases.map(c => c.id);

  const [requirementsByCase, catalog, inventory, attestationsByCase, surgeons] = await Promise.all([
    getRequirementsForCases(caseIds),
    getCatalogItems(facilityId),
    getAvailableInventory(facilityId),
    getAttestationsForCases(caseIds),
    getSurgeons(facilityId),
  ]);

  // Calculate cutoff (case date at start of day in UTC)
  const cutoffDate = dateObj;

  // Use pure domain logic for evaluation
  const results = evaluateBatchReadiness({
    cases,
    requirementsByCase,
    catalog,
    inventory,
    attestationsByCase,
    surgeons,
    cutoffDate,
  });

  // Build surgeon name map
  const surgeonNames = new Map<string, string>();
  for (const [id, surgeon] of surgeons) {
    surgeonNames.set(id, surgeon.name);
  }

  return { cases: results, surgeonNames };
}

/**
 * Update the case_readiness_cache table
 * @param targetDate - Date string (YYYY-MM-DD) or Date object
 */
export async function updateReadinessCache(
  facilityId: string,
  targetDate: Date | string
): Promise<void> {
  const { dateStr } = normalizeDateInput(targetDate);

  const { cases: readinessResults, surgeonNames } = await computeDayBeforeReadiness(
    facilityId,
    dateStr
  );

  // Get attestation info
  const attestationInfo = new Map<string, { name: string; id: string }>();
  const surgeonAckInfo = new Map<string, { id: string }>();
  const casesForDate = await getCasesForDate(facilityId, dateStr);
  const caseIds = casesForDate.map(c => c.id);
  const attestationsByCase = await getAttestationsForCases(caseIds);

  for (const [caseId, attestations] of attestationsByCase) {
    // Get latest CASE_READINESS attestation
    const readinessAttestations = attestations.filter(a => a.type === 'CASE_READINESS');
    if (readinessAttestations.length > 0) {
      const latest = readinessAttestations.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b
      );
      const name = await getUserName(latest.attestedByUserId);
      if (name) attestationInfo.set(caseId, { name, id: latest.id });
    }

    // Get latest SURGEON_ACKNOWLEDGMENT
    const surgeonAcks = attestations.filter(a => a.type === 'SURGEON_ACKNOWLEDGMENT');
    if (surgeonAcks.length > 0) {
      const latest = surgeonAcks.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b
      );
      surgeonAckInfo.set(caseId, { id: latest.id });
    }
  }

  await transaction(async (client) => {
    // Delete existing cache entries for these cases
    await client.query(`
      DELETE FROM case_readiness_cache
      WHERE case_id = ANY($1)
    `, [readinessResults.map(r => r.caseId)]);

    // Insert new cache entries
    for (const result of readinessResults) {
      const caseData = casesForDate.find(c => c.id === result.caseId);
      if (!caseData) continue;

      const surgeonName = surgeonNames.get(caseData.surgeonId) || 'Unknown';
      const attInfo = attestationInfo.get(result.caseId);
      const ackInfo = surgeonAckInfo.get(result.caseId);

      await client.query(`
        INSERT INTO case_readiness_cache (
          case_id, facility_id, scheduled_date, procedure_name, surgeon_name,
          readiness_state, missing_items, total_required_items, total_verified_items,
          has_attestation, attested_at, attested_by_name, attestation_id,
          has_surgeon_acknowledgment, surgeon_acknowledged_at, surgeon_acknowledgment_id, computed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      `, [
        result.caseId,
        facilityId,
        dateStr,
        caseData.procedureName,
        surgeonName,
        result.readinessState,
        JSON.stringify(result.missingItems),
        result.totalRequiredItems,
        result.totalVerifiedItems,
        result.hasAttestation,
        result.attestedAt || null,
        attInfo?.name || null,
        attInfo?.id || null,
        result.hasSurgeonAcknowledgment,
        result.surgeonAcknowledgedAt || null,
        ackInfo?.id || null,
      ]);
    }
  });
}

/**
 * Get cached readiness or compute fresh
 * @param targetDate - Date string in YYYY-MM-DD format or Date object
 */
export async function getDayBeforeReadiness(
  facilityId: string,
  targetDate: Date | string,
  forceRefresh = false
): Promise<CaseReadinessCacheRow[]> {
  // Convert to string if Date object
  const dateStr = typeof targetDate === 'string' ? targetDate : formatDateLocal(targetDate);

  if (forceRefresh) {
    await updateReadinessCache(facilityId, dateStr);
  }

  const result = await query<CaseReadinessCacheRow>(`
    SELECT * FROM case_readiness_cache
    WHERE facility_id = $1 AND scheduled_date = $2
    ORDER BY readiness_state DESC, procedure_name
  `, [facilityId, dateStr]);

  // If no cached data, compute and cache
  if (result.rows.length === 0) {
    await updateReadinessCache(facilityId, dateStr);
    const freshResult = await query<CaseReadinessCacheRow>(`
      SELECT * FROM case_readiness_cache
      WHERE facility_id = $1 AND scheduled_date = $2
      ORDER BY readiness_state DESC, procedure_name
    `, [facilityId, dateStr]);
    return freshResult.rows;
  }

  return result.rows;
}

// ============================================================================
// CALENDAR SUMMARY FUNCTIONS
// ============================================================================

export interface CalendarDaySummary {
  date: string;
  caseCount: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
}

export interface CalendarCaseSummary {
  caseId: string;
  caseNumber: string;
  scheduledDate: string;
  scheduledTime: string | null;
  procedureName: string;
  laterality: string | null;
  surgeonName: string;
  surgeonColor: string | null;
  readinessState: 'GREEN' | 'ORANGE' | 'RED' | null;
  isActive: boolean;
  roomId: string | null;
  roomName: string | null;
}

/**
 * Get calendar summary for a date range
 * granularity 'day' returns daily aggregates, 'case' returns individual cases
 * @param startDate - Date string (YYYY-MM-DD) or Date object
 * @param endDate - Date string (YYYY-MM-DD) or Date object
 */
export async function getCalendarSummary(
  facilityId: string,
  startDate: Date | string,
  endDate: Date | string,
  granularity: 'day' | 'case'
): Promise<{ days?: CalendarDaySummary[]; cases?: CalendarCaseSummary[] }> {
  const startStr = typeof startDate === 'string' ? startDate : formatDateLocal(startDate);
  const endStr = typeof endDate === 'string' ? endDate : formatDateLocal(endDate);

  if (granularity === 'day') {
    // Get daily aggregates from cache or compute
    const result = await query<{
      scheduled_date: Date;
      case_count: string;
      green_count: string;
      orange_count: string;
      red_count: string;
    }>(`
      SELECT
        sc.scheduled_date,
        COUNT(*)::text as case_count,
        COUNT(*) FILTER (WHERE COALESCE(crc.readiness_state, 'ORANGE') = 'GREEN')::text as green_count,
        COUNT(*) FILTER (WHERE COALESCE(crc.readiness_state, 'ORANGE') = 'ORANGE')::text as orange_count,
        COUNT(*) FILTER (WHERE COALESCE(crc.readiness_state, 'ORANGE') = 'RED')::text as red_count
      FROM surgical_case sc
      LEFT JOIN case_readiness_cache crc ON sc.id = crc.case_id
      WHERE sc.facility_id = $1
        AND sc.scheduled_date >= $2
        AND sc.scheduled_date <= $3
        AND sc.status NOT IN ('CANCELLED', 'COMPLETED')
      GROUP BY sc.scheduled_date
      ORDER BY sc.scheduled_date
    `, [facilityId, startStr, endStr]);

    const days: CalendarDaySummary[] = result.rows.map(row => ({
      date: formatDateLocal(row.scheduled_date),
      caseCount: parseInt(row.case_count, 10),
      greenCount: parseInt(row.green_count, 10),
      orangeCount: parseInt(row.orange_count, 10),
      redCount: parseInt(row.red_count, 10),
    }));

    return { days };
  } else {
    // Get individual cases for the date range
    const result = await query<{
      id: string;
      case_number: string;
      scheduled_date: Date;
      scheduled_time: string | null;
      procedure_name: string;
      laterality: string | null;
      surgeon_name: string;
      surgeon_color: string | null;
      readiness_state: string | null;
      is_active: boolean;
      room_id: string | null;
      room_name: string | null;
    }>(`
      SELECT
        sc.id,
        sc.case_number,
        sc.scheduled_date,
        sc.scheduled_time,
        sc.procedure_name,
        sc.laterality,
        u.name as surgeon_name,
        u.display_color as surgeon_color,
        crc.readiness_state,
        sc.is_active,
        sc.room_id,
        r.name as room_name
      FROM surgical_case sc
      JOIN app_user u ON sc.surgeon_id = u.id
      LEFT JOIN case_readiness_cache crc ON sc.id = crc.case_id
      LEFT JOIN room r ON sc.room_id = r.id
      WHERE sc.facility_id = $1
        AND sc.scheduled_date >= $2
        AND sc.scheduled_date <= $3
        AND sc.status NOT IN ('CANCELLED', 'COMPLETED')
      ORDER BY sc.scheduled_date, r.name NULLS LAST, sc.scheduled_time NULLS LAST
    `, [facilityId, startStr, endStr]);

    const cases: CalendarCaseSummary[] = result.rows.map(row => ({
      caseId: row.id,
      caseNumber: row.case_number,
      scheduledDate: formatDateLocal(row.scheduled_date),
      scheduledTime: row.scheduled_time,
      procedureName: row.procedure_name,
      laterality: row.laterality,
      surgeonName: row.surgeon_name,
      surgeonColor: row.surgeon_color,
      readinessState: (row.readiness_state as 'GREEN' | 'ORANGE' | 'RED') ?? null,
      isActive: row.is_active,
      roomId: row.room_id,
      roomName: row.room_name,
    }));

    return { cases };
  }
}

/**
 * Compute readiness for a single case (for attestation validation)
 */
export async function computeSingleCaseReadiness(
  caseId: string,
  facilityId: string
): Promise<ReadinessOutput | null> {
  const caseResult = await query<{
    id: string;
    facility_id: string;
    scheduled_date: Date;
    procedure_name: string;
    surgeon_id: string;
  }>(`
    SELECT id, facility_id, scheduled_date, procedure_name, surgeon_id
    FROM surgical_case
    WHERE id = $1 AND facility_id = $2
  `, [caseId, facilityId]);

  if (caseResult.rows.length === 0) return null;

  const caseRow = caseResult.rows[0];
  const case_: CaseForReadiness = {
    id: caseRow.id as CaseId,
    facilityId: caseRow.facility_id,
    scheduledDate: caseRow.scheduled_date,
    procedureName: caseRow.procedure_name,
    surgeonId: caseRow.surgeon_id,
  };

  const [requirementsByCase, catalog, inventory, attestationsByCase, surgeons] = await Promise.all([
    getRequirementsForCases([caseId]),
    getCatalogItems(facilityId),
    getAvailableInventory(facilityId),
    getAttestationsForCases([caseId]),
    getSurgeons(facilityId),
  ]);

  const surgeon = surgeons.get(caseRow.surgeon_id);
  if (!surgeon) return null;

  const cutoffDate = new Date(caseRow.scheduled_date);
  cutoffDate.setHours(0, 0, 0, 0);

  return evaluateCaseReadiness({
    case_,
    requirements: requirementsByCase.get(caseId) || [],
    catalog,
    inventory,
    attestations: attestationsByCase.get(caseId) || [],
    surgeon,
    cutoffDate,
  });
}
