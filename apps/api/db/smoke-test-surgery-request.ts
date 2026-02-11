/**
 * Surgery Request Smoke Test
 *
 * Exercises the full Phase 1 Readiness lifecycle:
 *   submit → admin view → return → resubmit → accept → convert
 *   + verify terminal state + verify 409 on invalid transition
 *
 * Usage: node --import tsx db/smoke-test-surgery-request.ts
 *
 * Prerequisites:
 *   - Database migrated (npm run db:migrate)
 *   - Database seeded (npm run db:seed --reset) — needs clinic API key + admin user
 *   - API server running (npm run dev or similar)
 */

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

interface TestContext {
  clinicApiKey: string;
  adminToken: string;
  facilityId: string;
  requestId?: string;
}

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
  opts: { body?: unknown; token?: string; clinicKey?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.clinicKey) headers['X-Clinic-Key'] = opts.clinicKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

async function getClinicApiKeyAndFacility(): Promise<{ clinicApiKey: string; facilityId: string }> {
  // We need to read these from the database directly since the seed prints the key but we can't capture it
  // Instead, create a fresh clinic + key for this test
  const pg = await import('pg');
  const { Pool } = pg.default;

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  const client = await pool.connect();
  try {
    const { randomBytes, createHmac } = await import('crypto');
    const rawKey = randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const clinicKeySecret = process.env.CLINIC_KEY_SECRET || 'dev-clinic-key-secret-change-in-production';
    const keyHash = createHmac('sha256', clinicKeySecret).update(rawKey).digest('hex');

    // Create test clinic
    const clinicRes = await client.query(`
      INSERT INTO clinic (name, clinic_key) VALUES ('Smoke Test Clinic', 'SMOKE_TEST_' || substr(md5(random()::text), 0, 8))
      RETURNING id
    `);
    const clinicId = clinicRes.rows[0].id;

    await client.query(`
      INSERT INTO clinic_api_key (clinic_id, key_prefix, key_hash) VALUES ($1, $2, $3)
    `, [clinicId, keyPrefix, keyHash]);

    // Get facility ID
    const facRes = await client.query(`SELECT id FROM facility LIMIT 1`);
    const facilityId = facRes.rows[0].id;

    // Create a checklist template for this facility if not exists
    const tmplRes = await client.query(`
      SELECT id FROM surgery_request_checklist_template_version
      WHERE target_facility_id = $1 AND active = true LIMIT 1
    `, [facilityId]);

    if (tmplRes.rows.length === 0) {
      await client.query(`
        INSERT INTO surgery_request_checklist_template_version (target_facility_id, name, version, schema)
        VALUES ($1, 'Smoke Test Checklist', 1, $2)
      `, [facilityId, JSON.stringify({ items: [{ key: 'test_item', label: 'Test', type: 'boolean', required: true }] })]);
    }

    return { clinicApiKey: rawKey, facilityId };
  } finally {
    client.release();
    await pool.end();
  }
}

async function loginAdmin(): Promise<string> {
  const facilityKey = process.env.SEED_FACILITY_KEY || 'ORTHOWISE_BETA';
  const { status, body } = await apiCall('POST', '/auth/login', {
    body: { facilityKey, username: 'admin', password: 'password123' },
  });
  if (status !== 200) {
    throw new Error(`Admin login failed: ${JSON.stringify(body)}`);
  }
  return (body as { token: string }).token;
}

async function runTests(): Promise<void> {
  console.log('🔬 Surgery Request Smoke Test\n');

  // Setup
  console.log('Setup:');
  const { clinicApiKey, facilityId } = await getClinicApiKeyAndFacility();
  console.log(`  Clinic API key obtained`);
  const adminToken = await loginAdmin();
  console.log(`  Admin token obtained`);
  const ctx: TestContext = { clinicApiKey, adminToken, facilityId };

  // Get a checklist template version
  const pg2 = await import('pg');
  const pool2 = new pg2.default.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'asc_inventory',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  const tmplRes = await pool2.query(`
    SELECT id FROM surgery_request_checklist_template_version
    WHERE target_facility_id = $1 AND active = true LIMIT 1
  `, [facilityId]);
  const templateVersionId = tmplRes.rows[0].id;
  await pool2.end();

  // Step 1: Submit
  console.log('\n1. Submit surgery request:');
  const submitBody = {
    targetFacilityId: facilityId,
    sourceRequestId: `SMOKE-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    procedureName: 'Smoke Test Procedure',
    surgeonUsername: 'drsmith',
    scheduledDate: '2026-03-15',
    patient: { clinicPatientKey: 'SMOKE-PAT-001', displayName: 'Smoke Test Patient', birthYear: 1980 },
    checklist: {
      templateVersionId,
      responses: [{ itemKey: 'test_item', response: { value: true } }],
    },
  };
  const r1 = await apiCall('POST', '/clinic/surgery-requests', { body: submitBody, clinicKey: clinicApiKey });
  assert(r1.status === 201, `Submit returns 201 (got ${r1.status})`);
  const data1 = (r1.body as { data: { request: { id: string; status: string } } }).data;
  assert(data1.request.status === 'SUBMITTED', `Status is SUBMITTED`);
  ctx.requestId = data1.request.id;

  // Step 2: Idempotent re-submit (same sourceRequestId, not RETURNED)
  console.log('\n2. Idempotent re-submit (should return existing):');
  const r2 = await apiCall('POST', '/clinic/surgery-requests', { body: submitBody, clinicKey: clinicApiKey });
  assert(r2.status === 200, `Re-submit returns 200 (got ${r2.status})`);
  const data2 = (r2.body as { data: { existing: boolean } }).data;
  assert(data2.existing === true, 'Marked as existing');

  // Step 3: Admin list
  console.log('\n3. Admin list surgery requests:');
  const r3 = await apiCall('GET', '/admin/surgery-requests?status=SUBMITTED', { token: adminToken });
  assert(r3.status === 200, `List returns 200 (got ${r3.status})`);
  const data3 = (r3.body as { data: { requests: unknown[]; total: number } }).data;
  assert(data3.total > 0, `Has results (total=${data3.total})`);

  // Step 4: Admin view detail
  console.log('\n4. Admin view detail:');
  const r4 = await apiCall('GET', `/admin/surgery-requests/${ctx.requestId}`, { token: adminToken });
  assert(r4.status === 200, `Detail returns 200 (got ${r4.status})`);
  const data4 = (r4.body as { data: { request: { status: string }; submissions: unknown[]; auditEvents: unknown[]; checklistResponses: unknown[] } }).data;
  assert(data4.submissions.length === 1, `Has 1 submission`);
  assert(data4.auditEvents.length >= 1, `Has audit events`);
  assert(data4.checklistResponses.length >= 1, `Has checklist responses`);

  // Step 5: Return to clinic
  console.log('\n5. Return to clinic:');
  const r5 = await apiCall('POST', `/admin/surgery-requests/${ctx.requestId}/return`, {
    token: adminToken,
    body: { reasonCode: 'MISSING_INFO', note: 'Please provide H&P' },
  });
  assert(r5.status === 200, `Return returns 200 (got ${r5.status})`);
  const data5 = (r5.body as { data: { request: { status: string } } }).data;
  assert(data5.request.status === 'RETURNED_TO_CLINIC', `Status is RETURNED_TO_CLINIC`);

  // Step 6: Resubmit (clinic)
  console.log('\n6. Resubmit:');
  const r6 = await apiCall('POST', '/clinic/surgery-requests', { body: submitBody, clinicKey: clinicApiKey });
  assert(r6.status === 200, `Resubmit returns 200 (got ${r6.status})`);
  const data6 = (r6.body as { data: { resubmitted: boolean; request: { status: string } } }).data;
  assert(data6.resubmitted === true, 'Marked as resubmitted');
  assert(data6.request.status === 'SUBMITTED', `Status back to SUBMITTED`);

  // Step 7: Accept
  console.log('\n7. Accept:');
  const r7 = await apiCall('POST', `/admin/surgery-requests/${ctx.requestId}/accept`, {
    token: adminToken,
    body: { note: 'Looks good' },
  });
  assert(r7.status === 200, `Accept returns 200 (got ${r7.status})`);
  const data7 = (r7.body as { data: { request: { status: string } } }).data;
  assert(data7.request.status === 'ACCEPTED', `Status is ACCEPTED`);

  // Step 8: Convert
  console.log('\n8. Convert:');
  const r8 = await apiCall('POST', `/admin/surgery-requests/${ctx.requestId}/convert`, { token: adminToken });
  assert(r8.status === 201, `Convert returns 201 (got ${r8.status})`);
  const data8 = (r8.body as { data: { request: { status: string }; surgicalCaseId: string } }).data;
  assert(data8.request.status === 'CONVERTED', `Status is CONVERTED`);
  assert(typeof data8.surgicalCaseId === 'string', `surgical_case_id returned`);

  // Step 9: Verify terminal — try to accept again, should 409
  console.log('\n9. Verify terminal state (409 on invalid transition):');
  const r9 = await apiCall('POST', `/admin/surgery-requests/${ctx.requestId}/accept`, {
    token: adminToken,
    body: {},
  });
  assert(r9.status === 409, `Accept on CONVERTED returns 409 (got ${r9.status})`);

  // Step 10: Verify conversion detail
  console.log('\n10. Verify conversion in detail view:');
  const r10 = await apiCall('GET', `/admin/surgery-requests/${ctx.requestId}`, { token: adminToken });
  assert(r10.status === 200, `Detail returns 200`);
  const data10 = (r10.body as { data: { conversion: { surgicalCaseId: string } | null } }).data;
  assert(data10.conversion !== null, `Conversion record exists`);
  assert(data10.conversion?.surgicalCaseId === data8.surgicalCaseId, `Conversion links to correct case`);

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
