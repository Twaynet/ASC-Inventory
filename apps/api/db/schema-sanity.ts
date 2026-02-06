/**
 * Schema Sanity Check
 *
 * Validates that the database schema meets expected invariants after
 * migrate and seed.  Exits non-zero on any drift so CI / dev flow breaks
 * loudly rather than silently producing bad state.
 *
 * Usage:  node --import tsx db/schema-sanity.ts [--post-seed]
 *   --post-seed  also validates that seeded tables contain expected data
 */

import pg from 'pg';

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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Tables that MUST exist after migrations */
const CRITICAL_TABLES = [
  'facility',
  'app_user',
  'surgical_case',
  'inventory_item',
  'inventory_event',
  'device_event',
  'attestation',
  'case_card_edit_log',
  'case_event_log',
  'surgical_case_status_event',
  'case_checklist_instance',
  'case_number_sequence',
  'catalog_item_image',
  'catalog_event',
  'catalog_identifier',
  // Wave 1: Financial attribution
  'vendor',
  'loaner_set',
  'catalog_cost_event',
];

/** Specific columns that MUST exist */
const EXPECTED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'surgical_case', column: 'case_number' },
  { table: 'surgical_case', column: 'status' },
  { table: 'surgical_case', column: 'facility_id' },
  { table: 'surgical_case_status_event', column: 'surgical_case_id' },
  { table: 'surgical_case_status_event', column: 'from_status' },
  { table: 'surgical_case_status_event', column: 'to_status' },
  { table: 'surgical_case_status_event', column: 'actor_user_id' },
  { table: 'surgical_case_status_event', column: 'context' },
  // Wave 1: Financial attribution columns
  { table: 'vendor', column: 'vendor_type' },
  { table: 'vendor', column: 'facility_id' },
  { table: 'loaner_set', column: 'vendor_id' },
  { table: 'loaner_set', column: 'set_identifier' },
  { table: 'catalog_cost_event', column: 'catalog_id' },
  { table: 'catalog_cost_event', column: 'new_cost_cents' },
  { table: 'inventory_event', column: 'cost_snapshot_cents' },
  { table: 'inventory_event', column: 'is_gratis' },
  { table: 'item_catalog', column: 'unit_cost_cents' },
  { table: 'item_catalog', column: 'ownership_type' },
];

/** DB functions that MUST exist */
const REQUIRED_FUNCTIONS = [
  'generate_case_number',
  'prevent_modification',
  'calculate_luhn_check_digit',
];

/** Append-only tables that must have both no-update and no-delete triggers */
const APPEND_ONLY_TABLES = [
  'inventory_event',
  'device_event',
  'case_card_edit_log',
  'surgical_case_status_event',
  'catalog_event',
  // Wave 1: Financial attribution
  'catalog_cost_event',
];

/** Tables that should have rows after seeding */
const SEEDED_TABLES = [
  { table: 'facility', minRows: 1 },
  { table: 'app_user', minRows: 7 },
  { table: 'surgical_case', minRows: 18 },
  { table: 'inventory_item', minRows: 9 },
  { table: 'item_catalog', minRows: 9 },
  { table: 'surgical_case_status_event', minRows: 18 },
];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface Problem {
  check: string;
  table: string;
  column?: string;
  detail: string;
  recommendation: string;
}

async function run(): Promise<void> {
  const postSeed = process.argv.includes('--post-seed');
  const problems: Problem[] = [];
  const client = await pool.connect();

  try {
    // ------- Check 1: Critical tables exist ------- //
    const { rows: tables } = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tableSet = new Set(tables.map(r => r.table_name));

    for (const t of CRITICAL_TABLES) {
      if (!tableSet.has(t)) {
        problems.push({
          check: 'MISSING_TABLE',
          table: t,
          detail: `Table "${t}" does not exist`,
          recommendation: 'Run migrations: npm run db:migrate',
        });
      }
    }

    // ------- Check 2: Expected columns exist ------- //
    for (const { table, column } of EXPECTED_COLUMNS) {
      if (!tableSet.has(table)) continue;
      const { rows } = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [table, column]);
      if (rows.length === 0) {
        problems.push({
          check: 'MISSING_COLUMN',
          table,
          column,
          detail: `Column "${table}.${column}" does not exist`,
          recommendation: 'Run migrations or check migration files for this column',
        });
      }
    }

    // ------- Check 3: Required DB functions exist ------- //
    for (const fn of REQUIRED_FUNCTIONS) {
      const { rows } = await client.query(`
        SELECT 1 FROM pg_proc WHERE proname = $1
      `, [fn]);
      if (rows.length === 0) {
        problems.push({
          check: 'MISSING_FUNCTION',
          table: '(pg_proc)',
          detail: `Database function "${fn}()" does not exist`,
          recommendation: 'Run migrations — this function is created by a migration',
        });
      }
    }

    // ------- Check 4: Append-only triggers exist ------- //
    for (const t of APPEND_ONLY_TABLES) {
      if (!tableSet.has(t)) continue;
      const { rows: triggers } = await client.query<{ trigger_name: string }>(`
        SELECT trigger_name FROM information_schema.triggers
        WHERE event_object_schema = 'public' AND event_object_table = $1
      `, [t]);
      const triggerNames = triggers.map(r => r.trigger_name);
      const hasNoUpdate = triggerNames.some(n => n.includes('no_update'));
      const hasNoDelete = triggerNames.some(n => n.includes('no_delete'));

      if (!hasNoUpdate) {
        problems.push({
          check: 'MISSING_TRIGGER',
          table: t,
          detail: `Append-only table "${t}" is missing a no-update trigger`,
          recommendation: `Add a BEFORE UPDATE trigger using prevent_modification()`,
        });
      }
      if (!hasNoDelete) {
        problems.push({
          check: 'MISSING_TRIGGER',
          table: t,
          detail: `Append-only table "${t}" is missing a no-delete trigger`,
          recommendation: `Add a BEFORE DELETE trigger using prevent_modification()`,
        });
      }
    }

    // ------- Check 5: surgical_case.case_number NOT NULL + generator ------- //
    if (tableSet.has('surgical_case')) {
      const { rows } = await client.query<{ is_nullable: string; column_default: string | null }>(`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'surgical_case' AND column_name = 'case_number'
      `);
      if (rows.length > 0 && rows[0].is_nullable === 'YES') {
        problems.push({
          check: 'CASE_NUMBER_NULLABLE',
          table: 'surgical_case',
          column: 'case_number',
          detail: 'surgical_case.case_number is nullable — should be NOT NULL',
          recommendation: 'Check migration 020 — it sets NOT NULL after backfill',
        });
      }
    }

    // ------- Check 6 (post-seed only): Seeded tables have data ------- //
    if (postSeed) {
      for (const { table, minRows } of SEEDED_TABLES) {
        if (!tableSet.has(table)) continue;
        const { rows } = await client.query<{ count: string }>(`SELECT COUNT(*) as count FROM "${table}"`);
        const count = parseInt(rows[0].count, 10);
        if (count < minRows) {
          problems.push({
            check: 'SEED_EMPTY',
            table,
            detail: `Expected at least ${minRows} row(s) in "${table}" after seed, found ${count}`,
            recommendation: 'Run seed: npm run db:seed --reset',
          });
        }
      }

      // Verify surgical_case rows have non-null case_number
      if (tableSet.has('surgical_case')) {
        const { rows } = await client.query<{ count: string }>(`
          SELECT COUNT(*) as count FROM surgical_case WHERE case_number IS NULL
        `);
        const nullCount = parseInt(rows[0].count, 10);
        if (nullCount > 0) {
          problems.push({
            check: 'SEED_NULL_CASE_NUMBER',
            table: 'surgical_case',
            column: 'case_number',
            detail: `${nullCount} surgical_case row(s) have NULL case_number after seed`,
            recommendation: 'Update seed to use generate_case_number() for all INSERT INTO surgical_case',
          });
        }
      }

      // Verify every seeded case has a status event
      if (tableSet.has('surgical_case') && tableSet.has('surgical_case_status_event')) {
        const { rows } = await client.query<{ count: string }>(`
          SELECT COUNT(*) as count FROM surgical_case sc
          WHERE NOT EXISTS (
            SELECT 1 FROM surgical_case_status_event e WHERE e.surgical_case_id = sc.id
          )
        `);
        const orphanCount = parseInt(rows[0].count, 10);
        if (orphanCount > 0) {
          problems.push({
            check: 'SEED_MISSING_STATUS_EVENT',
            table: 'surgical_case_status_event',
            detail: `${orphanCount} surgical_case row(s) have no corresponding status event`,
            recommendation: 'Update seed to INSERT INTO surgical_case_status_event for every case',
          });
        }
      }
    }

    // ------- Report ------- //
    const mode = postSeed ? ' (post-seed)' : '';
    if (problems.length === 0) {
      console.log(`\u2705 Schema sanity check passed${mode}`);
      console.log(`   ${CRITICAL_TABLES.length} critical tables verified`);
      console.log(`   ${EXPECTED_COLUMNS.length} expected columns verified`);
      console.log(`   ${REQUIRED_FUNCTIONS.length} required functions verified`);
      console.log(`   ${APPEND_ONLY_TABLES.length} append-only trigger sets verified`);
      if (postSeed) console.log(`   ${SEEDED_TABLES.length} seeded tables verified (row counts + data quality)`);
    } else {
      console.error(`\n\u274C Schema sanity check FAILED${mode} \u2014 ${problems.length} problem(s):\n`);
      for (const p of problems) {
        console.error(`  [${p.check}] ${p.table}${p.column ? '.' + p.column : ''}`);
        console.error(`    ${p.detail}`);
        console.error(`    \u2192 ${p.recommendation}\n`);
      }
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Schema sanity check crashed:', err);
  process.exit(1);
});
