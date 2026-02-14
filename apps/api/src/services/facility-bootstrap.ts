/**
 * Facility Bootstrap Service
 *
 * Creates a new facility with all baseline tenant rows in a single transaction.
 * Used by the PLATFORM_ADMIN facility creation endpoint.
 *
 * Baseline rows created:
 *   - facility
 *   - organization (ASC type, required by PHI scoping)
 *   - facility_settings (feature flags with safe defaults)
 *   - room (3 default operating rooms)
 *   - facility_config_item (patient flags + anesthesia modalities)
 *   - app_user (initial tenant ADMIN)
 *   - user_organization_affiliation (admin → ASC org)
 */

import type pg from 'pg';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateFacilityInput {
  facilityKey: string;
  name: string;
  timezone?: string;
  address?: string;
  initialAdmin: {
    username: string;
    password: string;
    name: string;
    email?: string;
  };
}

export interface BootstrapResult {
  facility: {
    id: string;
    facilityKey: string;
    name: string;
  };
  adminUser: {
    id: string;
    username: string;
    name: string;
    roles: string[];
  };
  counts: {
    rooms: number;
    configItems: number;
    organizations: number;
  };
}

export interface BootstrapStatus {
  facilityId: string;
  facilityName: string;
  facilityKey: string;
  hasSettings: boolean;
  roomCount: number;
  configItemCount: number;
  organizationCount: number;
  adminUserCount: number;
}

// ---------------------------------------------------------------------------
// Default data (deterministic, minimal)
// ---------------------------------------------------------------------------

const DEFAULT_ROOMS = [
  { name: 'OR 1', sortOrder: 0 },
  { name: 'OR 2', sortOrder: 1 },
  { name: 'OR 3', sortOrder: 2 },
];

const DEFAULT_PATIENT_FLAGS = [
  { key: 'latexAllergy', label: 'Latex-Free Required', sort: 1 },
  { key: 'iodineAllergy', label: 'Iodine-Free Required', sort: 2 },
  { key: 'nickelFree', label: 'Nickel-Free Implants', sort: 3 },
  { key: 'anticoagulation', label: 'Anticoagulation Consideration', sort: 4 },
  { key: 'infectionRisk', label: 'Infection Risk', sort: 5 },
  { key: 'neuromonitoringRequired', label: 'Neuromonitoring Required', sort: 6 },
];

const DEFAULT_ANESTHESIA_MODALITIES = [
  { key: 'GENERAL', label: 'General', sort: 1 },
  { key: 'SPINAL', label: 'Spinal', sort: 2 },
  { key: 'REGIONAL', label: 'Regional', sort: 3 },
  { key: 'MAC', label: 'MAC', sort: 4 },
  { key: 'LOCAL', label: 'Local', sort: 5 },
  { key: 'TIVA', label: 'TIVA', sort: 6 },
];

// ---------------------------------------------------------------------------
// Bootstrap implementation (runs inside caller-provided transaction client)
// ---------------------------------------------------------------------------

/**
 * Creates all baseline rows for a new facility.
 * MUST be called within a transaction — caller manages BEGIN/COMMIT/ROLLBACK.
 */
export async function createFacilityBootstrap(
  client: pg.PoolClient,
  input: CreateFacilityInput,
): Promise<BootstrapResult> {
  const timezone = input.timezone || 'America/New_York';

  // 1. Create facility
  const facilityResult = await client.query<{ id: string }>(
    `INSERT INTO facility (name, facility_key, timezone, address)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.name, input.facilityKey, timezone, input.address || null],
  );
  const facilityId = facilityResult.rows[0].id;

  // 2. Create ASC organization (required by PHI scoping — one per facility)
  await client.query(
    `INSERT INTO organization (facility_id, name, organization_type)
     VALUES ($1, $2, 'ASC')`,
    [facilityId, input.name],
  );

  // 3. Create facility_settings with safe defaults
  await client.query(
    `INSERT INTO facility_settings (facility_id, enable_timeout_debrief)
     VALUES ($1, false)`,
    [facilityId],
  );

  // 4. Create default rooms
  for (const room of DEFAULT_ROOMS) {
    await client.query(
      `INSERT INTO room (facility_id, name, sort_order)
       VALUES ($1, $2, $3)`,
      [facilityId, room.name, room.sortOrder],
    );
  }

  // 5. Create default config items (patient flags + anesthesia modalities)
  let configItemCount = 0;
  for (const flag of DEFAULT_PATIENT_FLAGS) {
    await client.query(
      `INSERT INTO facility_config_item (facility_id, item_type, item_key, display_label, sort_order)
       VALUES ($1, 'PATIENT_FLAG', $2, $3, $4)`,
      [facilityId, flag.key, flag.label, flag.sort],
    );
    configItemCount++;
  }
  for (const mod of DEFAULT_ANESTHESIA_MODALITIES) {
    await client.query(
      `INSERT INTO facility_config_item (facility_id, item_type, item_key, display_label, sort_order)
       VALUES ($1, 'ANESTHESIA_MODALITY', $2, $3, $4)`,
      [facilityId, mod.key, mod.label, mod.sort],
    );
    configItemCount++;
  }

  // 6. Create initial tenant ADMIN user
  const passwordHash = await bcrypt.hash(input.initialAdmin.password, 10);
  const adminResult = await client.query<{ id: string }>(
    `INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
     VALUES ($1, $2, $3, $4, 'ADMIN', ARRAY['ADMIN'::user_role], $5)
     RETURNING id`,
    [
      facilityId,
      input.initialAdmin.username,
      input.initialAdmin.email || null,
      input.initialAdmin.name,
      passwordHash,
    ],
  );
  const adminUserId = adminResult.rows[0].id;

  // 7. Affiliate admin user with ASC organization
  await client.query(
    `INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type)
     SELECT $1, o.id, 'PRIMARY'
     FROM organization o
     WHERE o.facility_id = $2 AND o.organization_type = 'ASC'`,
    [adminUserId, facilityId],
  );

  return {
    facility: {
      id: facilityId,
      facilityKey: input.facilityKey,
      name: input.name,
    },
    adminUser: {
      id: adminUserId,
      username: input.initialAdmin.username,
      name: input.initialAdmin.name,
      roles: ['ADMIN'],
    },
    counts: {
      rooms: DEFAULT_ROOMS.length,
      configItems: configItemCount,
      organizations: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Bootstrap status query (read-only, no transaction needed)
// ---------------------------------------------------------------------------

/** A minimal query interface compatible with both pg.PoolClient and the db/index query helper */
type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export async function getFacilityBootstrapStatus(
  client: { query: QueryFn },
  facilityId: string,
): Promise<BootstrapStatus | null> {
  const facilityResult = await client.query(
    'SELECT id, name, facility_key FROM facility WHERE id = $1',
    [facilityId],
  );
  if (facilityResult.rows.length === 0) return null;

  const facility = facilityResult.rows[0];

  const [settings, rooms, configItems, orgs, admins] = await Promise.all([
    client.query('SELECT 1 FROM facility_settings WHERE facility_id = $1', [facilityId]),
    client.query('SELECT count(*)::int AS n FROM room WHERE facility_id = $1', [facilityId]),
    client.query('SELECT count(*)::int AS n FROM facility_config_item WHERE facility_id = $1', [facilityId]),
    client.query(
      "SELECT count(*)::int AS n FROM organization WHERE facility_id = $1 AND organization_type = 'ASC' AND is_active = true",
      [facilityId],
    ),
    client.query(
      "SELECT count(*)::int AS n FROM app_user WHERE facility_id = $1 AND 'ADMIN' = ANY(roles) AND active = true",
      [facilityId],
    ),
  ]);

  return {
    facilityId: facility.id,
    facilityName: facility.name,
    facilityKey: facility.facility_key,
    hasSettings: settings.rows.length > 0,
    roomCount: rooms.rows[0].n,
    configItemCount: configItems.rows[0].n,
    organizationCount: orgs.rows[0].n,
    adminUserCount: admins.rows[0].n,
  };
}
