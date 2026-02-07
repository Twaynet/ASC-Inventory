/**
 * Create PLATFORM_ADMIN User
 *
 * LAW §3.1: PLATFORM_ADMIN is no-tenant identity (facility_id = NULL)
 *
 * Usage: npx tsx db/create-platform-admin.ts
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

async function createPlatformAdmin() {
  const client = await pool.connect();
  try {
    // Check if already exists
    const existing = await client.query(
      "SELECT id FROM app_user WHERE username = 'platform-admin'"
    );
    if (existing.rows.length > 0) {
      console.log('PLATFORM_ADMIN user already exists');
      console.log('  Username: platform-admin');
      console.log('  Password: platform123');
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash('platform123', 10);

    // Insert PLATFORM_ADMIN user (facility_id = NULL per LAW §3.1)
    const result = await client.query(`
      INSERT INTO app_user (facility_id, username, email, name, role, roles, password_hash)
      VALUES (NULL, 'platform-admin', 'platform@admin.local', 'Platform Administrator', 'PLATFORM_ADMIN', ARRAY['PLATFORM_ADMIN'::user_role], $1)
      RETURNING id, username
    `, [passwordHash]);

    console.log('Created PLATFORM_ADMIN user:');
    console.log('  Username: platform-admin');
    console.log('  Password: platform123');
    console.log('  ID:', result.rows[0].id);
  } finally {
    client.release();
    await pool.end();
  }
}

createPlatformAdmin().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
