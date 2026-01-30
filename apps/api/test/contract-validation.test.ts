/**
 * Contract Validation Tests (Wave 6B.2)
 *
 * Verifies that registerContractRoute enforces:
 * 1. Request validation (params, query, body) — rejects invalid input with 400
 * 2. Response validation — malformed handler output produces 500 SERVER_RESPONSE_INVALID
 * 3. Auth preHandlers are still invoked (contract adapter doesn't bypass auth)
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { defineRoute } from '@asc/contract';
import { registerContractRoute } from '../src/lib/contract-route.js';
import { ok } from '../src/utils/reply.js';

// ---------------------------------------------------------------------------
// Test route contracts
// ---------------------------------------------------------------------------

const testGetRoute = defineRoute({
  method: 'GET' as const,
  path: '/test/:id',
  summary: 'Test GET',
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ page: z.coerce.number().int().positive().optional() }),
  response: z.object({ name: z.string(), value: z.number() }),
});

const testPostRoute = defineRoute({
  method: 'POST' as const,
  path: '/test',
  summary: 'Test POST',
  body: z.object({ name: z.string().min(1), count: z.number().int() }),
  response: z.object({ id: z.string(), name: z.string() }),
});

const testDeleteRoute = defineRoute({
  method: 'DELETE' as const,
  path: '/test/:id',
  summary: 'Test DELETE',
  params: z.object({ id: z.string().uuid() }),
  response: 'void' as const,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = Fastify({ logger: false });
  return app;
}

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Request validation tests
// ---------------------------------------------------------------------------

describe('Contract route — request validation', () => {
  it('rejects invalid params with 400', async () => {
    const app = buildApp();
    registerContractRoute(app, testGetRoute, '/test', {
      handler: async (_req, reply) => ok(reply, { name: 'x', value: 1 }),
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects invalid body with 400', async () => {
    const app = buildApp();
    registerContractRoute(app, testPostRoute, '/test', {
      handler: async (_req, reply) => ok(reply, { id: '1', name: 'x' }, 201),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: '', count: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts valid params and passes contractData', async () => {
    const app = buildApp();
    registerContractRoute(app, testGetRoute, '/test', {
      handler: async (req, reply) => {
        const { id } = req.contractData.params as { id: string };
        return ok(reply, { name: id, value: 42 });
      },
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/${VALID_UUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe(VALID_UUID);
    expect(body.data.value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Response validation tests
// ---------------------------------------------------------------------------

describe('Contract route — response validation', () => {
  it('returns 500 SERVER_RESPONSE_INVALID for malformed response', async () => {
    const app = buildApp();
    registerContractRoute(app, testGetRoute, '/test', {
      handler: async (_req, reply) => {
        // Return wrong shape: missing 'value' field
        return ok(reply, { name: 'test', wrong: 'field' });
      },
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/${VALID_UUID}` });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('SERVER_RESPONSE_INVALID');
  });

  it('allows valid response through', async () => {
    const app = buildApp();
    registerContractRoute(app, testGetRoute, '/test', {
      handler: async (_req, reply) => ok(reply, { name: 'ok', value: 99 }),
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/${VALID_UUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual({ name: 'ok', value: 99 });
  });

  it('sends 204 for void contract routes', async () => {
    const app = buildApp();
    registerContractRoute(app, testDeleteRoute, '/test', {
      handler: async () => {
        // handler does nothing; adapter sends 204
      },
    });
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: `/${VALID_UUID}` });
    expect(res.statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Auth independence tests
// ---------------------------------------------------------------------------

describe('Contract route — auth preHandlers', () => {
  it('invokes preHandler before contract validation', async () => {
    const app = buildApp();
    let authCalled = false;

    registerContractRoute(app, testGetRoute, '/test', {
      preHandler: [
        async (_req, reply) => {
          authCalled = true;
          reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
        },
      ] as any,
      handler: async (_req, reply) => ok(reply, { name: 'x', value: 1 }),
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/${VALID_UUID}` });
    expect(authCalled).toBe(true);
    expect(res.statusCode).toBe(401);
  });
});
