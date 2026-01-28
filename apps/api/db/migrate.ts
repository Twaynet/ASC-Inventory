/**
 * Database Migration Script
 * Runs all SQL migrations in order
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const useSSL = (process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'asc_inventory',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

// Migrations that must NOT run inside a transaction (e.g., enum ADD VALUE + immediate use)
const NO_TX = new Set<string>(['032_align_categories_with_law.sql']);

function splitSqlStatements(sqlText: string): string[] {
  // NOTE: Simple splitter assumes no function bodies / DO $$ blocks containing semicolons.
  // If you add those later, we’ll replace this with a real SQL parser.
  return sqlText
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s + ';');
}

async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: executed } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations'
    );
    const executedSet = new Set(executed.map(r => r.name));

    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`Executing ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      if (NO_TX.has(file)) {
        // Run statements one-by-one, each as its own implicit transaction
        const statements = splitSqlStatements(sql);
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        console.log(`Completed ${file} (no transaction)`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Completed ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('All migrations completed successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
