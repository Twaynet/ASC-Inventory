/**
 * PHI Patient Search — Tripwire Tests
 *
 * Minimal smoke tests to detect PHI boundary regressions on the
 * /api/phi-patient/search endpoint:
 *   1. Empty search (no criteria) must be rejected (no "show all patients")
 *   2. Users without PHI_PATIENT_SEARCH capability must be denied
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

describe('PHI Patient Search — tripwire tests', () => {
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
});
