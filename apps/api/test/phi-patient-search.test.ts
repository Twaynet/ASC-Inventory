/**
 * PHI Patient — Tripwire Tests
 *
 * Minimal smoke tests to detect PHI boundary regressions:
 *   1. Empty search (no criteria) must be rejected (no "show all patients")
 *   2. Users without PHI_PATIENT_SEARCH capability must be denied
 *   3. Create patient accepts gender and rejects invalid values
 *
 * These tests mock the database and phi-guard to isolate handler logic.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
vi.mock('../src/db/index.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogPhiAccess = vi.fn().mockResolvedValue('audit-log-id');
vi.mock('../src/services/phi-audit.service.js', () => ({
  logPhiAccess: (...args: unknown[]) => mockLogPhiAccess(...args),
}));

// Mock phi-guard: let all requests pass (we test handler-level checks)
vi.mock('../src/plugins/phi-guard.js', () => ({
  requirePhiAccess: () => {
    const phiGuard = async (request: any, _reply: any) => {
      request.phiContext = {
        classification: 'PHI_CLINICAL',
        purpose: 'CLINICAL_CARE',
        organizationIds: [],
      };
    };
    // Named function so governance hook detects it (matches production pattern)
    Object.defineProperty(phiGuard, 'name', { value: 'phiGuard' });
    return phiGuard;
  },
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { phiPatientRoutes } from '../src/routes/phi-patient.routes.js';

// ---------------------------------------------------------------------------
// Test Fastify builder
// ---------------------------------------------------------------------------

async function buildApp(userOverrides: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = Fastify();

  // Decorate authenticate to inject request.user
  app.decorate('authenticate', async (request: any) => {
    request.user = {
      userId: 'test-user-id',
      facilityId: 'test-facility-id',
      username: 'testuser',
      email: null,
      name: 'Test User',
      role: 'CIRCULATOR',
      roles: ['CIRCULATOR'],
      ...userOverrides,
    };
  });

  await app.register(phiPatientRoutes, { prefix: '/api/phi-patient' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PHI Patient — tripwire tests', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockQuery.mockReset();
    mockLogPhiAccess.mockReset().mockResolvedValue('audit-log-id');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // TEST 1: Search requires at least one criterion
  // -------------------------------------------------------------------------
  it('rejects search with no criteria (400) — prevents "show all patients"', async () => {
    // CIRCULATOR has PHI_PATIENT_SEARCH, so capability check passes
    app = await buildApp({ role: 'CIRCULATOR', roles: ['CIRCULATOR'] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/phi-patient/search',
      // No query params
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/at least one search criterion/i);

    // No database query should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TEST 2: Search denied without PHI_PATIENT_SEARCH capability
  // -------------------------------------------------------------------------
  it('denies search without PHI_PATIENT_SEARCH (403) and logs DENIED audit entry', async () => {
    // PLATFORM_ADMIN does NOT have PHI_PATIENT_SEARCH (or any PHI clinical cap)
    // The phi-guard mock lets the request through so we can test the handler's
    // own capability check.
    app = await buildApp({ role: 'PLATFORM_ADMIN', roles: ['PLATFORM_ADMIN'] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/phi-patient/search?lastName=test',
    });

    expect(response.statusCode).toBe(403);

    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('FORBIDDEN');
    // Verify no PHI is leaked in the error response
    expect(JSON.stringify(body)).not.toMatch(/first_name|last_name|date_of_birth|mrn/i);

    // Verify DENIED PHI audit entry was recorded
    expect(mockLogPhiAccess).toHaveBeenCalledTimes(1);
    const auditArg = mockLogPhiAccess.mock.calls[0][0];
    expect(auditArg.outcome).toBe('DENIED');
    expect(auditArg.denialReason).toMatch(/PHI_PATIENT_SEARCH/);
    expect(auditArg.endpoint).toBe('/phi-patient/search');
    expect(auditArg.httpMethod).toBe('GET');

    // No database query should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TEST 3: Create patient rejects invalid gender value
  // -------------------------------------------------------------------------
  it('rejects create with invalid gender (400) — no PHI in error', async () => {
    app = await buildApp({ role: 'ADMIN', roles: ['ADMIN'] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/phi-patient',
      payload: {
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        mrn: 'MRN-001',
        gender: 'INVALID_VALUE',
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/gender/i);
    // No PHI leaked in error
    expect(body.error.message).not.toMatch(/Jane|Doe|MRN-001/);
  });

  // -------------------------------------------------------------------------
  // TEST 4: Create patient accepts valid gender and defaults UNKNOWN
  // -------------------------------------------------------------------------
  it('accepts create with valid gender (MALE) and persists it', async () => {
    app = await buildApp({ role: 'ADMIN', roles: ['ADMIN'] });

    // Mock: no existing patient with this MRN
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Mock: INSERT RETURNING
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'new-patient-id',
        first_name: 'John',
        last_name: 'Smith',
        date_of_birth: '1985-06-15',
        mrn: 'MRN-002',
        gender: 'MALE',
      }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/phi-patient',
      payload: {
        firstName: 'John',
        lastName: 'Smith',
        dateOfBirth: '1985-06-15',
        mrn: 'MRN-002',
        gender: 'MALE',
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.data.patient.gender).toBe('MALE');

    // Verify INSERT included gender parameter
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toContain('gender');
    expect(insertCall[1]).toContain('MALE');
  });

  it('defaults gender to UNKNOWN when not provided on create', async () => {
    app = await buildApp({ role: 'ADMIN', roles: ['ADMIN'] });

    // Mock: no existing patient with this MRN
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Mock: INSERT RETURNING
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'new-patient-id',
        first_name: 'Alex',
        last_name: 'Jones',
        date_of_birth: '2000-03-20',
        mrn: 'MRN-003',
        gender: 'UNKNOWN',
      }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/phi-patient',
      payload: {
        firstName: 'Alex',
        lastName: 'Jones',
        dateOfBirth: '2000-03-20',
        mrn: 'MRN-003',
        // gender omitted — should default to UNKNOWN
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.data.patient.gender).toBe('UNKNOWN');

    // Verify INSERT used UNKNOWN for gender
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1]).toContain('UNKNOWN');
  });
});
