/**
 * Financial Readiness Smoke Test (Phase 2)
 *
 * Exercises the financial readiness lifecycle:
 *   verify AT_RISK → dashboard HIGH → override CLEARED → dashboard LOW
 *   → clear override → dashboard HIGH → verify detail timeline
 *   → verify append-only triggers → verify surgery_request.status unchanged
 *
 * Usage: node --import tsx db/smoke-test-financial-readiness.ts
 *
 * Prerequisites:
 *   - Database migrated (npm run db:migrate)
 *   - Database seeded (npm run db:seed --reset)
 *   - API server running (npm run dev or similar)
 */

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function apiCall(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${method} ${url} → ${res.status} (non-JSON response): ${text.substring(0, 200)}`);
  }
  return { status: res.status, body };
}

/**
 * Require a specific status code. Throws a clear diagnostic on mismatch.
 */
function requireStatus(
  result: { status: number; body: Record<string, unknown> },
  expected: number,
  context: string,
): void {
  if (result.status !== expected) {
    throw new Error(
      `${context}: expected ${expected}, got ${result.status}\n` +
      `  Response: ${JSON.stringify(result.body, null, 2).substring(0, 500)}`
    );
  }
}

/**
 * Extract the `data` envelope from a successful response.
 * Throws if body.data is missing (indicates wrong envelope or error response).
 */
function getData<T>(result: { status: number; body: Record<string, unknown> }, context: string): T {
  if (!result.body || result.body.data === undefined) {
    throw new Error(
      `${context}: response missing 'data' envelope (status ${result.status})\n` +
      `  Response: ${JSON.stringify(result.body, null, 2).substring(0, 500)}`
    );
  }
  return result.body.data as T;
}

async function loginAdmin(): Promise<string> {
  const facilityKey = process.env.SEED_FACILITY_KEY || 'ORTHOWISE_BETA';
  const { status, body } = await apiCall('POST', '/auth/login', {
    body: { facilityKey, username: 'admin', password: 'password123' },
  });
  if (status !== 200) {
    throw new Error(`Admin login failed (${status}): ${JSON.stringify(body)}`);
  }
  return (body as { token: string }).token;
}

async function getSurgeryRequestId(): Promise<{ requestId: string; originalStatus: string }> {
  const pg = await import('pg');
  const { Pool } = pg.default;
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  try {
    // Use a SUBMITTED request so we can verify status isn't affected
    const res = await pool.query(`
      SELECT id, status FROM surgery_request WHERE status = 'SUBMITTED' LIMIT 1
    `);
    if (res.rows.length === 0) throw new Error('No SUBMITTED surgery request found. Run seed first.');
    return { requestId: res.rows[0].id, originalStatus: res.rows[0].status };
  } finally {
    await pool.end();
  }
}

async function runTests(): Promise<void> {
  console.log('🔬 Financial Readiness Smoke Test (Phase 2)\n');

  // Setup
  console.log('Setup:');
  const adminToken = await loginAdmin();
  console.log('  Admin token obtained');
  const { requestId, originalStatus } = await getSurgeryRequestId();
  console.log(`  Using surgery request: ${requestId} (status: ${originalStatus})`);

  // First, clean any existing financial data for this request so test is idempotent
  const pg = await import('pg');
  const { Pool } = pg.default;
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  // Append-only triggers block DELETE. Temporarily disable them for cleanup.
  await pool.query(`ALTER TABLE clinic_financial_declaration DISABLE TRIGGER ALL`);
  await pool.query(`ALTER TABLE asc_financial_verification DISABLE TRIGGER ALL`);
  await pool.query(`ALTER TABLE financial_override DISABLE TRIGGER ALL`);
  await pool.query(`DELETE FROM financial_readiness_cache WHERE surgery_request_id = $1`, [requestId]);
  await pool.query(`DELETE FROM clinic_financial_declaration WHERE surgery_request_id = $1`, [requestId]);
  await pool.query(`DELETE FROM asc_financial_verification WHERE surgery_request_id = $1`, [requestId]);
  await pool.query(`DELETE FROM financial_override WHERE surgery_request_id = $1`, [requestId]);
  await pool.query(`ALTER TABLE clinic_financial_declaration ENABLE TRIGGER ALL`);
  await pool.query(`ALTER TABLE asc_financial_verification ENABLE TRIGGER ALL`);
  await pool.query(`ALTER TABLE financial_override ENABLE TRIGGER ALL`);
  console.log('  Cleaned existing financial data for test request');

  // Step 1: GET dashboard before any financial events
  console.log('\n1. Dashboard before financial events:');
  const r1 = await apiCall('GET', '/admin/financial-readiness/dashboard', { token: adminToken });
  requireStatus(r1, 200, 'GET /admin/financial-readiness/dashboard');
  assert(r1.status === 200, `Dashboard returns 200 (got ${r1.status})`);

  // Step 2: POST verify AT_RISK
  console.log('\n2. Record ASC verification AT_RISK:');
  const r2 = await apiCall('POST', `/admin/financial-readiness/${requestId}/verify`, {
    token: adminToken,
    body: { state: 'VERIFIED_AT_RISK', reasonCodes: ['PATIENT_BALANCE_UNRESOLVED'], note: 'Smoke test verification' },
  });
  requireStatus(r2, 201, `POST /admin/financial-readiness/${requestId}/verify`);
  assert(r2.status === 201, `Verify returns 201 (got ${r2.status})`);
  const cache2 = getData<{ cache: { riskState: string } }>(r2, 'verify response').cache;
  assert(cache2.riskState === 'HIGH', `Risk state is HIGH after ASC AT_RISK (got ${cache2.riskState})`);

  // Step 3: GET dashboard — filter for HIGH
  console.log('\n3. Dashboard with HIGH filter:');
  const r3 = await apiCall('GET', '/admin/financial-readiness/dashboard?riskState=HIGH', { token: adminToken });
  requireStatus(r3, 200, 'GET /admin/financial-readiness/dashboard?riskState=HIGH');
  assert(r3.status === 200, `Dashboard returns 200`);
  const data3 = getData<{ rows: { surgeryRequestId: string; riskState: string }[]; total: number }>(r3, 'dashboard HIGH');
  const ourRow3 = data3.rows.find(r => r.surgeryRequestId === requestId);
  assert(ourRow3 !== undefined, `Our request appears in HIGH-filtered dashboard`);
  assert(ourRow3?.riskState === 'HIGH', `Risk state is HIGH in dashboard`);

  // Step 4: POST override CLEARED
  console.log('\n4. Record override CLEARED:');
  const r4 = await apiCall('POST', `/admin/financial-readiness/${requestId}/override`, {
    token: adminToken,
    body: { state: 'OVERRIDE_CLEARED', reasonCode: 'PATIENT_PAID', note: 'Patient paid in full' },
  });
  requireStatus(r4, 201, `POST /admin/financial-readiness/${requestId}/override`);
  assert(r4.status === 201, `Override returns 201 (got ${r4.status})`);
  const cache4 = getData<{ cache: { riskState: string } }>(r4, 'override response').cache;
  assert(cache4.riskState === 'LOW', `Risk state is LOW after override CLEARED (got ${cache4.riskState})`);

  // Step 5: GET dashboard — verify LOW
  console.log('\n5. Dashboard after override — risk is LOW:');
  const r5 = await apiCall('GET', `/admin/financial-readiness/dashboard?riskState=LOW`, { token: adminToken });
  requireStatus(r5, 200, 'GET /admin/financial-readiness/dashboard?riskState=LOW');
  assert(r5.status === 200, `Dashboard returns 200`);
  const data5 = getData<{ rows: { surgeryRequestId: string; riskState: string }[] }>(r5, 'dashboard LOW');
  const ourRow5 = data5.rows.find(r => r.surgeryRequestId === requestId);
  assert(ourRow5 !== undefined, `Our request appears in LOW-filtered dashboard`);

  // Step 6: POST override NONE (clear override)
  console.log('\n6. Clear override (state=NONE):');
  const r6 = await apiCall('POST', `/admin/financial-readiness/${requestId}/override`, {
    token: adminToken,
    body: { state: 'NONE', reasonCode: null },
  });
  requireStatus(r6, 201, `POST /admin/financial-readiness/${requestId}/override (NONE)`);
  assert(r6.status === 201, `Override clear returns 201 (got ${r6.status})`);
  const cache6 = getData<{ cache: { riskState: string } }>(r6, 'override clear response').cache;
  assert(cache6.riskState === 'HIGH', `Risk state back to HIGH after clearing override (got ${cache6.riskState})`);

  // Step 7: GET detail — verify timeline
  console.log('\n7. Detail view — verify timeline:');
  const r7 = await apiCall('GET', `/admin/financial-readiness/${requestId}`, { token: adminToken });
  requireStatus(r7, 200, `GET /admin/financial-readiness/${requestId}`);
  assert(r7.status === 200, `Detail returns 200 (got ${r7.status})`);
  const data7 = getData<{
    verifications: { state: string }[];
    overrides: { state: string }[];
    cache: { riskState: string };
  }>(r7, 'detail response');
  assert(data7.verifications.length === 1, `Has 1 verification event`);
  assert(data7.overrides.length === 2, `Has 2 override events (set + clear)`);
  assert(data7.cache.riskState === 'HIGH', `Cache shows HIGH risk`);

  // Step 8: Record clinic declaration
  console.log('\n8. Record clinic declaration DECLARED_CLEARED:');
  const r8 = await apiCall('POST', `/admin/financial-readiness/${requestId}/declare`, {
    token: adminToken,
    body: { state: 'DECLARED_CLEARED', reasonCodes: [], note: 'Clinic reports cleared' },
  });
  requireStatus(r8, 201, `POST /admin/financial-readiness/${requestId}/declare`);
  assert(r8.status === 201, `Declaration returns 201 (got ${r8.status})`);
  // ASC is AT_RISK → still HIGH (ASC AT_RISK takes precedence over clinic CLEARED)
  const cache8 = getData<{ cache: { riskState: string; clinicState: string } }>(r8, 'declare response').cache;
  assert(cache8.clinicState === 'DECLARED_CLEARED', `Clinic state is DECLARED_CLEARED`);
  assert(cache8.riskState === 'HIGH', `Risk still HIGH because ASC is AT_RISK (got ${cache8.riskState})`);

  // Step 9: Verify append-only trigger blocks UPDATE
  console.log('\n9. Verify append-only triggers (DB):');
  try {
    const verRes = await pool.query(`SELECT id FROM asc_financial_verification WHERE surgery_request_id = $1 LIMIT 1`, [requestId]);
    if (verRes.rows.length > 0) {
      try {
        await pool.query(`UPDATE asc_financial_verification SET note = 'hacked' WHERE id = $1`, [verRes.rows[0].id]);
        assert(false, 'UPDATE on asc_financial_verification should have been blocked');
      } catch {
        assert(true, 'UPDATE on asc_financial_verification blocked by trigger');
      }
    }
  } catch {
    assert(false, 'Could not verify append-only trigger (query failed)');
  }

  // Step 10: Verify surgery_request.status unchanged
  console.log('\n10. Verify surgery_request.status unchanged (no scheduling impact):');
  const statusRes = await pool.query(`SELECT status FROM surgery_request WHERE id = $1`, [requestId]);
  assert(statusRes.rows[0].status === originalStatus, `surgery_request.status still ${originalStatus} (got ${statusRes.rows[0].status})`);

  await pool.end();

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
