/**
 * Database Seed Script
 *
 * Two phases:
 *   1. Platform bootstrap — ALWAYS runs (idempotent). Creates the
 *      PLATFORM_ADMIN user required for platform-level access.
 *   2. Demo / tenant data — only runs once (or with --reset).
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac } from 'crypto';

const { Pool } = pg;

const useSSL = (process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'asc_inventory',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

// ========================================================================
// Phase 1: Platform Bootstrap (ALWAYS runs, idempotent)
// ========================================================================
async function bootstrapPlatform(client: pg.PoolClient) {
  console.log('--- Platform Bootstrap ---');

  const existing = await client.query(
    "SELECT id FROM app_user WHERE username = 'platform-admin'"
  );
  if (existing.rows.length > 0) {
    console.log('PLATFORM_ADMIN user already exists — skipping');
    return;
  }

  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'platform123';
  const passwordHash = await bcrypt.hash(platformPassword, 10);

  const result = await client.query(`
    INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
    VALUES (NULL, 'platform-admin', 'platform@admin.local', 'Platform Administrator',
            'PLATFORM_ADMIN', ARRAY['PLATFORM_ADMIN'::user_role], $1)
    ON CONFLICT (username) DO NOTHING
    RETURNING id
  `, [passwordHash]);

  if (result.rows.length > 0) {
    console.log('Created PLATFORM_ADMIN user:');
    console.log('  Username: platform-admin');
    console.log('  Password: ' + (process.env.PLATFORM_ADMIN_PASSWORD ? '(from env)' : 'platform123'));
    console.log('  ID:', result.rows[0].id);
  }
}

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding database...');

    // Phase 1: Platform bootstrap — ALWAYS runs
    await bootstrapPlatform(client);

    // Phase 2: Demo / tenant data — only runs once (or with --reset)
    const forceReseed = process.argv.includes('--reset');
    const { rows: facilities } = await client.query('SELECT id FROM facility LIMIT 1');
    if (facilities.length > 0 && !forceReseed) {
      console.log('Tenant data already seeded. Skipping. Use --reset to reseed.');
      return;
    }
    if (forceReseed) {
      console.log('Resetting existing data...');
      await client.query('TRUNCATE facility CASCADE');
      await client.query('TRUNCATE clinic CASCADE');
    }

    await client.query('BEGIN');

  // Create facility
const facilityKey = process.env.SEED_FACILITY_KEY || 'ORTHOWISE_BETA';

const facilityResult = await client.query(
  `
    INSERT INTO facility (name, facility_key, timezone, address)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `,
  ['Demo Surgery Center', facilityKey, 'America/New_York', '123 Medical Drive, Suite 100']
);

const facilityId = facilityResult.rows[0].id;
console.log(`Created facility: ${facilityId} (key=${facilityKey})`);

    // Create ASC organization for the facility (migrations backfill won't cover seed-created facilities)
    const orgResult = await client.query(`
      INSERT INTO organization (facility_id, name, organization_type)
      VALUES ($1, 'Demo Surgery Center', 'ASC')
      RETURNING id
    `, [facilityId]);
    const ascOrgId = orgResult.rows[0].id;
    console.log(`Created ASC organization: ${ascOrgId}`);

    // Create users with hashed passwords
    const passwordHash = await bcrypt.hash('password123', 10);

    const usersData = [
      { username: 'admin', email: 'admin@demo.com', name: 'Admin User', role: 'ADMIN' },
      { username: 'scheduler', email: 'scheduler@demo.com', name: 'Sarah Scheduler', role: 'SCHEDULER' },
      { username: 'tech', email: 'tech@demo.com', name: 'Tom Tech', role: 'INVENTORY_TECH' },
      { username: 'circulator', email: 'circulator@demo.com', name: 'Carla Circulator', role: 'CIRCULATOR' },
      { username: 'scrub', email: 'scrub@demo.com', name: 'Steve Scrub', role: 'SCRUB' },
      { username: 'drsmith', email: 'drsmith@demo.com', name: 'Dr. John Smith', role: 'SURGEON' },
      { username: 'drjones', email: 'drjones@demo.com', name: 'Dr. Sarah Jones', role: 'SURGEON' },
    ];

    const users: Record<string, string> = {};
    for (const user of usersData) {
      const result = await client.query(`
        INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
        VALUES ($1, $2, $3, $4, $5, ARRAY[$5::user_role], $6)
        RETURNING id
      `, [facilityId, user.username, user.email, user.name, user.role, passwordHash]);
      users[user.role + '_' + user.name] = result.rows[0].id;
      console.log(`Created user: ${user.name} (${user.username})`);
    }

    // Auto-affiliate all seeded users with the facility's ASC organization
    await client.query(`
      INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type)
      SELECT u.id, o.id, 'PRIMARY'
      FROM app_user u
      JOIN organization o ON o.facility_id = u.facility_id AND o.organization_type = 'ASC'
      WHERE u.facility_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM user_organization_affiliation
          WHERE user_id = u.id AND organization_id = o.id AND is_active = true
        )
    `, [facilityId]);
    console.log('Affiliated all users with ASC organization');

    const drSmithId = users['SURGEON_Dr. John Smith'];
    const drJonesId = users['SURGEON_Dr. Sarah Jones'];
    const techId = users['INVENTORY_TECH_Tom Tech'];

    // Create locations
    const locationsData = [
      { name: 'OR Storage Room A', description: 'Main instrument storage' },
      { name: 'OR Storage Room B', description: 'Implant storage' },
      { name: 'Sterile Processing', description: 'Central sterilization' },
      { name: 'Loaner Storage', description: 'Vendor loaner equipment' },
    ];

    const locations: Record<string, string> = {};
    for (const loc of locationsData) {
      const result = await client.query(`
        INSERT INTO location (facility_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [facilityId, loc.name, loc.description]);
      locations[loc.name] = result.rows[0].id;
    }
    console.log(`Created ${locationsData.length} locations`);

    // Create catalog items
    const catalogData = [
      { name: 'Hip Stem - Size 12', category: 'IMPLANT', manufacturer: 'OrthoMed', catalogNumber: 'HS-12' },
      { name: 'Hip Stem - Size 14', category: 'IMPLANT', manufacturer: 'OrthoMed', catalogNumber: 'HS-14' },
      { name: 'Acetabular Cup - 54mm', category: 'IMPLANT', manufacturer: 'OrthoMed', catalogNumber: 'AC-54' },
      { name: 'Knee Tibial Tray', category: 'IMPLANT', manufacturer: 'KneeCo', catalogNumber: 'KTT-01' },
      { name: 'Arthroscopy Scope 30deg', category: 'INSTRUMENT', manufacturer: 'ScopeTech', catalogNumber: 'AS-30' },
      { name: 'Arthroscopy Shaver Set', category: 'INSTRUMENT', manufacturer: 'ScopeTech', catalogNumber: 'ASS-01' },
      { name: 'Power Drill System', category: 'INSTRUMENT', manufacturer: 'PowerOrtho', catalogNumber: 'PDS-100', isLoaner: false },
      { name: 'Vendor Specialty Tray - Spine', category: 'INSTRUMENT', manufacturer: 'SpineVendor', catalogNumber: 'VST-SP', isLoaner: true },
      { name: 'Surgical Mesh 10x15cm', category: 'CONSUMABLE', manufacturer: 'MeshCorp', catalogNumber: 'SM-1015' },
    ];

    const catalog: Record<string, string> = {};
    for (const item of catalogData) {
      const result = await client.query(`
        INSERT INTO item_catalog (facility_id, name, category, manufacturer, catalog_number, is_loaner, requires_sterility)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING id
      `, [facilityId, item.name, item.category, item.manufacturer, item.catalogNumber, item.isLoaner || false]);
      catalog[item.name] = result.rows[0].id;
    }
    console.log(`Created ${catalogData.length} catalog items`);

    // Create inventory items
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7); // Sterility valid for 7 days

    const inventoryData = [
      { catalog: 'Hip Stem - Size 12', location: 'OR Storage Room B', barcode: 'HS12-001', sterility: 'STERILE' },
      { catalog: 'Hip Stem - Size 14', location: 'OR Storage Room B', barcode: 'HS14-001', sterility: 'STERILE' },
      { catalog: 'Acetabular Cup - 54mm', location: 'OR Storage Room B', barcode: 'AC54-001', sterility: 'STERILE' },
      { catalog: 'Knee Tibial Tray', location: 'OR Storage Room B', barcode: 'KTT-001', sterility: 'STERILE' },
      { catalog: 'Arthroscopy Scope 30deg', location: 'OR Storage Room A', barcode: 'AS30-001', sterility: 'STERILE' },
      { catalog: 'Arthroscopy Shaver Set', location: 'OR Storage Room A', barcode: 'ASS-001', sterility: 'STERILE' },
      { catalog: 'Power Drill System', location: 'OR Storage Room A', barcode: 'PDS-001', sterility: 'STERILE' },
      { catalog: 'Surgical Mesh 10x15cm', location: 'OR Storage Room A', barcode: 'SM1015-001', sterility: 'STERILE' },
      { catalog: 'Surgical Mesh 10x15cm', location: 'OR Storage Room A', barcode: 'SM1015-002', sterility: 'STERILE' },
      // Missing item - for red case demo
      // { catalog: 'Vendor Specialty Tray - Spine', location: 'Loaner Storage', barcode: 'VST-001', sterility: 'STERILE' },
    ];

    for (const item of inventoryData) {
      await client.query(`
        INSERT INTO inventory_item (
          facility_id, catalog_id, barcode, location_id,
          sterility_status, sterility_expires_at, availability_status,
          last_verified_at, last_verified_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE', NOW(), $7)
      `, [
        facilityId,
        catalog[item.catalog],
        item.barcode,
        locations[item.location],
        item.sterility,
        tomorrow,
        techId,
      ]);
    }
    console.log(`Created ${inventoryData.length} inventory items`);

    // Create preference cards
    const hipCardResult = await client.query(`
      INSERT INTO preference_card (facility_id, surgeon_id, procedure_name, description)
      VALUES ($1, $2, 'Total Hip Arthroplasty', 'Standard THA procedure')
      RETURNING id
    `, [facilityId, drSmithId]);
    const hipCardId = hipCardResult.rows[0].id;

    const hipVersionResult = await client.query(`
      INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
      VALUES ($1, 1, $2, $3)
      RETURNING id
    `, [
      hipCardId,
      JSON.stringify([
        { catalogId: catalog['Hip Stem - Size 12'], quantity: 1, notes: 'Primary size' },
        { catalogId: catalog['Hip Stem - Size 14'], quantity: 1, notes: 'Backup size' },
        { catalogId: catalog['Acetabular Cup - 54mm'], quantity: 1 },
        { catalogId: catalog['Power Drill System'], quantity: 1 },
      ]),
      drSmithId,
    ]);

    await client.query(`
      UPDATE preference_card SET current_version_id = $1 WHERE id = $2
    `, [hipVersionResult.rows[0].id, hipCardId]);

    const kneeCardResult = await client.query(`
      INSERT INTO preference_card (facility_id, surgeon_id, procedure_name, description)
      VALUES ($1, $2, 'Total Knee Arthroplasty', 'Standard TKA procedure')
      RETURNING id
    `, [facilityId, drJonesId]);
    const kneeCardId = kneeCardResult.rows[0].id;

    const kneeVersionResult = await client.query(`
      INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
      VALUES ($1, 1, $2, $3)
      RETURNING id
    `, [
      kneeCardId,
      JSON.stringify([
        { catalogId: catalog['Knee Tibial Tray'], quantity: 1 },
        { catalogId: catalog['Power Drill System'], quantity: 1 },
      ]),
      drJonesId,
    ]);

    await client.query(`
      UPDATE preference_card SET current_version_id = $1 WHERE id = $2
    `, [kneeVersionResult.rows[0].id, kneeCardId]);

    // Arthroscopy with missing item (for RED demo)
    const spineCardResult = await client.query(`
      INSERT INTO preference_card (facility_id, surgeon_id, procedure_name, description)
      VALUES ($1, $2, 'Lumbar Fusion', 'Requires vendor loaner tray')
      RETURNING id
    `, [facilityId, drSmithId]);
    const spineCardId = spineCardResult.rows[0].id;

    const spineVersionResult = await client.query(`
      INSERT INTO preference_card_version (preference_card_id, version_number, items, created_by_user_id)
      VALUES ($1, 1, $2, $3)
      RETURNING id
    `, [
      spineCardId,
      JSON.stringify([
        { catalogId: catalog['Vendor Specialty Tray - Spine'], quantity: 1, notes: 'Call vendor 48hrs ahead' },
        { catalogId: catalog['Power Drill System'], quantity: 1 },
      ]),
      drSmithId,
    ]);

    await client.query(`
      UPDATE preference_card SET current_version_id = $1 WHERE id = $2
    `, [spineVersionResult.rows[0].id, spineCardId]);

    console.log('Created preference cards');

    // Create cases for tomorrow
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    const adminId = users['ADMIN_Admin User'];

    // Case 1: GREEN - all items available (active)
    const case1Result = await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES ($1, $2, '08:00', $3, 'Total Hip Arthroplasty', $4, 'SCHEDULED', true, NOW(), $5, generate_case_number($1), $6)
      RETURNING id
    `, [facilityId, tomorrowStr, drSmithId, hipVersionResult.rows[0].id, adminId, ascOrgId]);

    // Add requirements from preference card
    await client.query(`
      INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override)
      VALUES
        ($1, $2, 1, false),
        ($1, $3, 1, false),
        ($1, $4, 1, false),
        ($1, $5, 1, false)
    `, [
      case1Result.rows[0].id,
      catalog['Hip Stem - Size 12'],
      catalog['Hip Stem - Size 14'],
      catalog['Acetabular Cup - 54mm'],
      catalog['Power Drill System'],
    ]);

    // Case 2: GREEN - all items available (active)
    const case2Result = await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES ($1, $2, '10:30', $3, 'Total Knee Arthroplasty', $4, 'SCHEDULED', true, NOW(), $5, generate_case_number($1), $6)
      RETURNING id
    `, [facilityId, tomorrowStr, drJonesId, kneeVersionResult.rows[0].id, adminId, ascOrgId]);

    await client.query(`
      INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override)
      VALUES
        ($1, $2, 1, false),
        ($1, $3, 1, false)
    `, [
      case2Result.rows[0].id,
      catalog['Knee Tibial Tray'],
      catalog['Power Drill System'],
    ]);

    // Case 3: RED - missing loaner tray (active)
    const case3Result = await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES ($1, $2, '13:00', $3, 'Lumbar Fusion', $4, 'SCHEDULED', true, NOW(), $5, generate_case_number($1), $6)
      RETURNING id
    `, [facilityId, tomorrowStr, drSmithId, spineVersionResult.rows[0].id, adminId, ascOrgId]);

    await client.query(`
      INSERT INTO case_requirement (case_id, catalog_id, quantity, is_surgeon_override)
      VALUES
        ($1, $2, 1, false),
        ($1, $3, 1, false)
    `, [
      case3Result.rows[0].id,
      catalog['Vendor Specialty Tray - Spine'],
      catalog['Power Drill System'],
    ]);

    console.log('Created sample cases for tomorrow');

    // Create additional test cases for debrief testing (day after tomorrow and beyond)
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterStr = dayAfterTomorrow.toISOString().split('T')[0];

    const day3 = new Date();
    day3.setDate(day3.getDate() + 3);
    const day3Str = day3.toISOString().split('T')[0];

    const day4 = new Date();
    day4.setDate(day4.getDate() + 4);
    const day4Str = day4.toISOString().split('T')[0];

    // Test cases for debrief testing - Day +2 (all active)
    await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 1', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 2', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 1', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 2', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 3', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8)
    `, [facilityId, dayAfterStr, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId, ascOrgId]);

    // Test cases for debrief testing - Day +3 (all active)
    await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 4', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 5', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 3', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 4', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 6', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8)
    `, [facilityId, day3Str, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId, ascOrgId]);

    // Test cases for debrief testing - Day +4 (all active)
    await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id, case_number, primary_organization_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 7', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 8', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 5', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 6', $6, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 9', $4, 'SCHEDULED', true, NOW(), $7, generate_case_number($1), $8)
    `, [facilityId, day4Str, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId, ascOrgId]);

    console.log('Created 15 additional test cases for debrief testing');

    // Record status events for all seeded cases (append-only audit trail)
    await client.query(`
      INSERT INTO surgical_case_status_event (surgical_case_id, from_status, to_status, context, actor_user_id)
      SELECT id, NULL, status::text, '{"source":"seed"}'::jsonb, $1
      FROM surgical_case WHERE facility_id = $2
    `, [adminId, facilityId]);
    console.log('Recorded status events for seeded cases');

    // Create a device
    await client.query(`
      INSERT INTO device (facility_id, name, device_type, location_id)
      VALUES ($1, 'Scanner Station A', 'barcode', $2)
    `, [facilityId, locations['OR Storage Room A']]);

    console.log('Created sample device');

    // ========================================================================
    // Surgery Request Seed Data (Phase 1 Readiness)
    // ========================================================================

    // Create clinic
    const clinicResult = await client.query(`
      INSERT INTO clinic (name, clinic_key)
      VALUES ('Demo Ortho Clinic', 'DEMO_CLINIC')
      RETURNING id
    `);
    const clinicId = clinicResult.rows[0].id;
    console.log(`Created clinic: ${clinicId}`);

    // Create clinic API key
    const rawKey = randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const clinicKeySecret = process.env.CLINIC_KEY_SECRET || 'dev-clinic-key-secret-change-in-production';
    const keyHash = createHmac('sha256', clinicKeySecret).update(rawKey).digest('hex');

    await client.query(`
      INSERT INTO clinic_api_key (clinic_id, key_prefix, key_hash)
      VALUES ($1, $2, $3)
    `, [clinicId, keyPrefix, keyHash]);

    // Create checklist template version
    const templateResult = await client.query(`
      INSERT INTO surgery_request_checklist_template_version
        (target_facility_id, name, version, schema)
      VALUES ($1, 'Clinic Readiness', 1, $2)
      RETURNING id
    `, [
      facilityId,
      JSON.stringify({
        items: [
          { key: 'hp_on_file', label: 'H&P on file', type: 'boolean', required: true },
          { key: 'labs_complete', label: 'Labs complete', type: 'boolean', required: true },
          { key: 'consent_signed', label: 'Consent signed', type: 'boolean', required: true },
          { key: 'surgical_site_marked', label: 'Surgical site marked', type: 'boolean', required: false },
        ],
      }),
    ]);
    const templateVersionId = templateResult.rows[0].id;
    console.log('Created checklist template version');

    // Create sample patient refs
    const patientRef1 = await client.query(`
      INSERT INTO patient_ref (clinic_id, clinic_patient_key, display_name, birth_year)
      VALUES ($1, 'PAT-001', 'John Doe', 1965) RETURNING id
    `, [clinicId]);
    const patientRef2 = await client.query(`
      INSERT INTO patient_ref (clinic_id, clinic_patient_key, display_name, birth_year)
      VALUES ($1, 'PAT-002', 'Jane Smith', 1978) RETURNING id
    `, [clinicId]);
    const patientRef3 = await client.query(`
      INSERT INTO patient_ref (clinic_id, clinic_patient_key, display_name, birth_year)
      VALUES ($1, 'PAT-003', 'Bob Wilson', 1952) RETURNING id
    `, [clinicId]);

    // Sample surgery request 1: SUBMITTED
    const sr1 = await client.query(`
      INSERT INTO surgery_request (
        target_facility_id, source_clinic_id, source_request_id,
        status, procedure_name, surgeon_id, scheduled_date, patient_ref_id,
        submitted_at
      ) VALUES ($1, $2, 'CLN-REQ-001', 'SUBMITTED', 'Right Total Knee Arthroplasty',
        $3, $4, $5, NOW())
      RETURNING id
    `, [facilityId, clinicId, drJonesId, tomorrowStr, patientRef1.rows[0].id]);

    const sr1Sub = await client.query(`
      INSERT INTO surgery_request_submission (request_id, submission_seq, submitted_at)
      VALUES ($1, 1, NOW()) RETURNING id
    `, [sr1.rows[0].id]);

    const sr1Inst = await client.query(`
      INSERT INTO surgery_request_checklist_instance (request_id, submission_id, template_version_id, status)
      VALUES ($1, $2, $3, 'COMPLETE') RETURNING id
    `, [sr1.rows[0].id, sr1Sub.rows[0].id, templateVersionId]);

    for (const item of ['hp_on_file', 'labs_complete', 'consent_signed', 'surgical_site_marked']) {
      await client.query(`
        INSERT INTO surgery_request_checklist_response (instance_id, item_key, response, actor_type, actor_clinic_id)
        VALUES ($1, $2, $3, 'CLINIC', $4)
      `, [sr1Inst.rows[0].id, item, JSON.stringify({ value: true }), clinicId]);
    }

    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, submission_id, event_type, actor_type, actor_clinic_id)
      VALUES ($1, $2, 'SUBMITTED', 'CLINIC', $3)
    `, [sr1.rows[0].id, sr1Sub.rows[0].id, clinicId]);

    // Sample surgery request 2: ACCEPTED
    const sr2 = await client.query(`
      INSERT INTO surgery_request (
        target_facility_id, source_clinic_id, source_request_id,
        status, procedure_name, surgeon_id, scheduled_date, patient_ref_id,
        submitted_at
      ) VALUES ($1, $2, 'CLN-REQ-002', 'ACCEPTED', 'Left Hip Arthroplasty',
        $3, $4, $5, NOW() - interval '2 days')
      RETURNING id
    `, [facilityId, clinicId, drSmithId, dayAfterStr, patientRef2.rows[0].id]);

    const sr2Sub = await client.query(`
      INSERT INTO surgery_request_submission (request_id, submission_seq, submitted_at)
      VALUES ($1, 1, NOW() - interval '2 days') RETURNING id
    `, [sr2.rows[0].id]);

    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, submission_id, event_type, actor_type, actor_clinic_id)
      VALUES ($1, $2, 'SUBMITTED', 'CLINIC', $3)
    `, [sr2.rows[0].id, sr2Sub.rows[0].id, clinicId]);
    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, event_type, actor_type, actor_user_id)
      VALUES ($1, 'ACCEPTED', 'ASC', $2)
    `, [sr2.rows[0].id, adminId]);

    // Sample surgery request 3: CONVERTED
    const sr3 = await client.query(`
      INSERT INTO surgery_request (
        target_facility_id, source_clinic_id, source_request_id,
        status, procedure_name, surgeon_id, scheduled_date, patient_ref_id,
        submitted_at
      ) VALUES ($1, $2, 'CLN-REQ-003', 'CONVERTED', 'Lumbar Decompression',
        $3, $4, $5, NOW() - interval '5 days')
      RETURNING id
    `, [facilityId, clinicId, drSmithId, day3Str, patientRef3.rows[0].id]);

    const sr3Sub = await client.query(`
      INSERT INTO surgery_request_submission (request_id, submission_seq, submitted_at)
      VALUES ($1, 1, NOW() - interval '5 days') RETURNING id
    `, [sr3.rows[0].id]);

    // Create a surgical case for the converted request
    const convertedCase = await client.query(`
      INSERT INTO surgical_case (
        facility_id, case_number, scheduled_date, surgeon_id,
        procedure_name, status, is_active, is_cancelled, primary_organization_id
      ) VALUES ($1, generate_case_number($1), $2, $3, 'Lumbar Decompression', 'REQUESTED', false, false, $4)
      RETURNING id
    `, [facilityId, day3Str, drSmithId, ascOrgId]);

    await client.query(`
      INSERT INTO surgery_request_conversion (request_id, surgical_case_id, converted_by_user_id)
      VALUES ($1, $2, $3)
    `, [sr3.rows[0].id, convertedCase.rows[0].id, adminId]);

    await client.query(`
      INSERT INTO surgical_case_status_event (surgical_case_id, from_status, to_status, context, actor_user_id)
      VALUES ($1, NULL, 'REQUESTED', '{"source":"surgery_request_conversion"}'::jsonb, $2)
    `, [convertedCase.rows[0].id, adminId]);

    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, submission_id, event_type, actor_type, actor_clinic_id)
      VALUES ($1, $2, 'SUBMITTED', 'CLINIC', $3)
    `, [sr3.rows[0].id, sr3Sub.rows[0].id, clinicId]);
    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, event_type, actor_type, actor_user_id)
      VALUES ($1, 'ACCEPTED', 'ASC', $2)
    `, [sr3.rows[0].id, adminId]);
    await client.query(`
      INSERT INTO surgery_request_audit_event (request_id, event_type, actor_type, actor_user_id)
      VALUES ($1, 'CONVERTED', 'ASC', $2)
    `, [sr3.rows[0].id, adminId]);

    console.log('Created 3 sample surgery requests (SUBMITTED, ACCEPTED, CONVERTED)');

    // ========================================================================
    // Financial Readiness Seed Data (Phase 2)
    // ========================================================================

    // SR1 (SUBMITTED): clinic declared CLEARED, ASC not verified → UNKNOWN risk
    await client.query(`
      INSERT INTO clinic_financial_declaration
        (surgery_request_id, state, reason_codes, note, actor_clinic_id, recorded_by_user_id)
      VALUES ($1, 'DECLARED_CLEARED', '{}', 'Insurance verified by clinic', $2, $3)
    `, [sr1.rows[0].id, clinicId, adminId]);

    await client.query(`
      INSERT INTO financial_readiness_cache
        (surgery_request_id, target_facility_id, clinic_state, asc_state, override_state, risk_state, recomputed_at)
      VALUES ($1, $2, 'DECLARED_CLEARED', 'UNKNOWN', 'NONE', 'UNKNOWN', NOW())
    `, [sr1.rows[0].id, facilityId]);

    // SR2 (ACCEPTED): both CLEARED → LOW risk
    await client.query(`
      INSERT INTO clinic_financial_declaration
        (surgery_request_id, state, reason_codes, note, actor_clinic_id, recorded_by_user_id)
      VALUES ($1, 'DECLARED_CLEARED', '{}', NULL, $2, $3)
    `, [sr2.rows[0].id, clinicId, adminId]);

    await client.query(`
      INSERT INTO asc_financial_verification
        (surgery_request_id, state, reason_codes, note, verified_by_user_id)
      VALUES ($1, 'VERIFIED_CLEARED', '{}', 'Benefits confirmed', $2)
    `, [sr2.rows[0].id, adminId]);

    await client.query(`
      INSERT INTO financial_readiness_cache
        (surgery_request_id, target_facility_id, clinic_state, asc_state, override_state, risk_state, recomputed_at)
      VALUES ($1, $2, 'DECLARED_CLEARED', 'VERIFIED_CLEARED', 'NONE', 'LOW', NOW())
    `, [sr2.rows[0].id, facilityId]);

    // SR3 (CONVERTED): both AT_RISK + override CLEARED → LOW risk (override wins)
    await client.query(`
      INSERT INTO clinic_financial_declaration
        (surgery_request_id, state, reason_codes, note, actor_clinic_id, recorded_by_user_id)
      VALUES ($1, 'DECLARED_AT_RISK', '{HIGH_DEDUCTIBLE}', 'Patient has high deductible', $2, $3)
    `, [sr3.rows[0].id, clinicId, adminId]);

    await client.query(`
      INSERT INTO asc_financial_verification
        (surgery_request_id, state, reason_codes, note, verified_by_user_id)
      VALUES ($1, 'VERIFIED_AT_RISK', '{PATIENT_BALANCE_UNRESOLVED}', 'Balance outstanding', $2)
    `, [sr3.rows[0].id, adminId]);

    await client.query(`
      INSERT INTO financial_override
        (surgery_request_id, state, reason_code, note, overridden_by_user_id)
      VALUES ($1, 'OVERRIDE_CLEARED', 'PATIENT_PAID', 'Patient paid balance in full', $2)
    `, [sr3.rows[0].id, adminId]);

    await client.query(`
      INSERT INTO financial_readiness_cache
        (surgery_request_id, target_facility_id, clinic_state, asc_state, override_state, risk_state, recomputed_at)
      VALUES ($1, $2, 'DECLARED_AT_RISK', 'VERIFIED_AT_RISK', 'OVERRIDE_CLEARED', 'LOW', NOW())
    `, [sr3.rows[0].id, facilityId]);

    console.log('Created financial readiness seed data for 3 surgery requests');

    await client.query('COMMIT');
    console.log('\nSeeding completed successfully!');
    console.log('\nPlatform Account (Facility Key = PLATFORM):');
    console.log('  platform-admin / ' + (process.env.PLATFORM_ADMIN_PASSWORD ? '(from env)' : 'platform123') + ' (Platform Admin)');
    console.log('\nTenant Accounts (login with username, not email):');
    console.log('  admin / password123 (Admin)');
    console.log('  scheduler / password123 (Scheduler)');
    console.log('  tech / password123 (Inventory Tech)');
    console.log('  circulator / password123 (Circulator)');
    console.log('  scrub / password123 (Scrub Tech)');
    console.log('  drsmith / password123 (Surgeon)');
    console.log('  drjones / password123 (Surgeon)');
    console.log('\nClinic API Key (X-Clinic-Key header):');
    console.log(`  ${rawKey}`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
