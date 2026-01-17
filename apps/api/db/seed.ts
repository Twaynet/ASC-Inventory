/**
 * Database Seed Script
 * Creates sample data for development
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'asc_inventory',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding database...');

    // Check if already seeded
    const { rows: facilities } = await client.query('SELECT id FROM facility LIMIT 1');
    if (facilities.length > 0) {
      console.log('Database already seeded. Skipping.');
      return;
    }

    await client.query('BEGIN');

    // Create facility
    const facilityResult = await client.query(`
      INSERT INTO facility (name, timezone, address)
      VALUES ('Demo Surgery Center', 'America/New_York', '123 Medical Drive, Suite 100')
      RETURNING id
    `);
    const facilityId = facilityResult.rows[0].id;
    console.log(`Created facility: ${facilityId}`);

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
        INSERT INTO app_user (facility_id, username, email, name, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [facilityId, user.username, user.email, user.name, user.role, passwordHash]);
      users[user.role + '_' + user.name] = result.rows[0].id;
      console.log(`Created user: ${user.name} (${user.username})`);
    }

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
      { name: 'Vendor Specialty Tray - Spine', category: 'LOANER', manufacturer: 'SpineVendor', catalogNumber: 'VST-SP', isLoaner: true },
      { name: 'Surgical Mesh 10x15cm', category: 'HIGH_VALUE_SUPPLY', manufacturer: 'MeshCorp', catalogNumber: 'SM-1015' },
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
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES ($1, $2, '08:00', $3, 'Total Hip Arthroplasty', $4, 'SCHEDULED', true, NOW(), $5)
      RETURNING id
    `, [facilityId, tomorrowStr, drSmithId, hipVersionResult.rows[0].id, adminId]);

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
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES ($1, $2, '10:30', $3, 'Total Knee Arthroplasty', $4, 'SCHEDULED', true, NOW(), $5)
      RETURNING id
    `, [facilityId, tomorrowStr, drJonesId, kneeVersionResult.rows[0].id, adminId]);

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
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES ($1, $2, '13:00', $3, 'Lumbar Fusion', $4, 'SCHEDULED', true, NOW(), $5)
      RETURNING id
    `, [facilityId, tomorrowStr, drSmithId, spineVersionResult.rows[0].id, adminId]);

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
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 1', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 2', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 1', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 2', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 3', $4, 'SCHEDULED', true, NOW(), $7)
    `, [facilityId, dayAfterStr, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId]);

    // Test cases for debrief testing - Day +3 (all active)
    await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 4', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 5', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 3', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 4', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 6', $4, 'SCHEDULED', true, NOW(), $7)
    `, [facilityId, day3Str, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId]);

    // Test cases for debrief testing - Day +4 (all active)
    await client.query(`
      INSERT INTO surgical_case (
        facility_id, scheduled_date, scheduled_time, surgeon_id,
        procedure_name, preference_card_version_id, status, is_active, activated_at, activated_by_user_id
      )
      VALUES
        ($1, $2, '07:30', $3, 'Hip Replacement - Test 7', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '09:00', $3, 'Hip Replacement - Test 8', $4, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '10:30', $5, 'Knee Replacement - Test 5', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '12:00', $5, 'Knee Replacement - Test 6', $6, 'SCHEDULED', true, NOW(), $7),
        ($1, $2, '14:00', $3, 'Hip Replacement - Test 9', $4, 'SCHEDULED', true, NOW(), $7)
    `, [facilityId, day4Str, drSmithId, hipVersionResult.rows[0].id, drJonesId, kneeVersionResult.rows[0].id, adminId]);

    console.log('Created 15 additional test cases for debrief testing');

    // Create a device
    await client.query(`
      INSERT INTO device (facility_id, name, device_type, location_id)
      VALUES ($1, 'Scanner Station A', 'barcode', $2)
    `, [facilityId, locations['OR Storage Room A']]);

    console.log('Created sample device');

    await client.query('COMMIT');
    console.log('\nSeeding completed successfully!');
    console.log('\nTest Accounts (login with username, not email):');
    console.log('  admin / password123 (Admin)');
    console.log('  scheduler / password123 (Scheduler)');
    console.log('  tech / password123 (Inventory Tech)');
    console.log('  circulator / password123 (Circulator)');
    console.log('  scrub / password123 (Scrub Tech)');
    console.log('  drsmith / password123 (Surgeon)');
    console.log('  drjones / password123 (Surgeon)');

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
