/**
 * PHI Patient Cases — Tripwire Tests
 *
 * Minimal smoke tests for GET /phi-patient/:patientId/cases:
 *   1. Denies without PHI_PATIENT_SEARCH (403 + DENIED audit)
 *   2. Returns 404 for non-existent patient (no PHI in error)
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

describe('PHI Patient Cases — tripwire tests', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockQuery.mockReset();
    mockLogPhiAccess.mockReset().mockResolvedValue('audit-log-id');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // TEST 1: Denies without PHI_PATIENT_SEARCH capability
  // -------------------------------------------------------------------------
  it('denies patient cases without PHI_PATIENT_SEARCH (403) and logs DENIED audit entry', async () => {
    app = await buildApp({ role: 'PLATFORM_ADMIN', roles: ['PLATFORM_ADMIN'] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/phi-patient/some-patient-id/cases',
    });

    expect(response.statusCode).toBe(403);

    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('FORBIDDEN');
    // No PHI in error
    expect(JSON.stringify(body)).not.toMatch(/first_name|last_name|date_of_birth|mrn/i);

    // Verify DENIED PHI audit entry
    expect(mockLogPhiAccess).toHaveBeenCalledTimes(1);
    const auditArg = mockLogPhiAccess.mock.calls[0][0];
    expect(auditArg.outcome).toBe('DENIED');
    expect(auditArg.denialReason).toMatch(/PHI_PATIENT_SEARCH/);
    expect(auditArg.httpMethod).toBe('GET');

    // No database query should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TEST 2: Returns 404 for non-existent patient (no cross-facility leak)
  // -------------------------------------------------------------------------
  it('returns 404 for non-existent patient — no PHI in error', async () => {
    app = await buildApp({ role: 'CIRCULATOR', roles: ['CIRCULATOR'] });

    // Mock: patient not found in facility
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/phi-patient/nonexistent-id/cases',
    });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    // No PHI in error response
    expect(JSON.stringify(body)).not.toMatch(/first_name|last_name|date_of_birth|mrn/i);
  });
});
