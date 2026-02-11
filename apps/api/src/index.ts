/**
 * ASC Inventory Truth System - API Server
 * Fastify + Zod backend service
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../uploads');
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { casesRoutes } from './routes/cases.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { readinessRoutes } from './routes/readiness.routes.js';
import { checklistsRoutes } from './routes/checklists.routes.js';
import { locationsRoutes } from './routes/locations.routes.js';
import { catalogRoutes } from './routes/catalog.routes.js';
import { catalogGroupsRoutes } from './routes/catalog-groups.routes.js';
import { catalogSetsRoutes } from './routes/catalog-sets.routes.js';
import { catalogImagesRoutes } from './routes/catalog-images.routes.js';
import { preferenceCardsRoutes } from './routes/preference-cards.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { caseCardsRoutes } from './routes/case-cards.routes.js';
import { caseDashboardRoutes } from './routes/case-dashboard.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { generalSettingsRoutes } from './routes/general-settings.routes.js';
import { scheduleRoutes } from './routes/schedule.routes.js';
import { adminSettingsRoutes } from './routes/admin-settings.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
// Platform Control Plane (LAW §2.3: Separation is mandatory)
import { platformRoutes } from './routes/platform.routes.js';
// Wave 1: Financial Attribution
import { vendorsRoutes } from './routes/vendors.routes.js';
import { loanerSetsRoutes } from './routes/loaner-sets.routes.js';
import { attentionRoutes } from './routes/attention.routes.js';
// PHI Phase 1: Organization model
import { organizationRoutes } from './routes/organization.routes.js';
// PHI Phase 3: Audit visibility
import { phiAuditRoutes } from './routes/phi-audit.routes.js';
// PHI Phase 6A: Patient identity domain
import { phiPatientRoutes } from './routes/phi-patient.routes.js';
import { personaPlugin } from './plugins/persona.js';
import { requestIdPlugin } from './plugins/request-id.js';
// PHI Phase 4D: Governance guardrails
import { validatePhiGovernance, type CollectedRoute } from './plugins/phi-governance.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Active-Persona', 'X-Request-Id', 'Idempotency-Key', 'X-Access-Purpose', 'X-Emergency-Justification'],
    exposedHeaders: ['X-Request-Id'],
  });

  await fastify.register(sensible);

  // Register multipart for file uploads
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 3 * 1024 * 1024, // 3MB (LAW-compliant limit)
    },
  });

  // Ensure uploads directory exists and serve static files
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  await fastify.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Register JWT at root level so it's available to all routes
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    sign: {
      expiresIn: '24h',
    },
  });

  // Decorate fastify with authenticate method for route preHandlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      request.log.warn({ code: 'AUTH_FAILED', method: request.method, url: request.url }, 'Authentication failed');
      reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.requestId } });
    }
  });

  // Register request ID plugin (correlation IDs for all requests)
  await fastify.register(requestIdPlugin);

  // Centralized error handler — ensures consistent error envelope and no stack trace leakage
  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId;
    // JWT verification errors bubble as 401
    if (error.statusCode === 401) {
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId },
      });
    }
    // Fastify validation errors (e.g., content-type)
    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message, requestId },
      });
    }
    // All other errors — log and return generic 500
    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(error.statusCode || 500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
    });
  });

  // Register persona plugin (reads X-Active-Persona header for audit metadata)
  await fastify.register(personaPlugin);

  // Health check (at /api/health to be consistent with all other routes)
  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── PHI Phase 4D: Collect routes for governance validation ──
  const collectedRoutes: CollectedRoute[] = [];

  fastify.addHook('onRoute', (routeOptions) => {
    // Only collect /api/* routes (skip health, static, etc.)
    if (!routeOptions.url.startsWith('/api/')) return;

    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];

    // Detect PHI guard in preHandler chain
    const preHandlers = Array.isArray(routeOptions.preHandler)
      ? routeOptions.preHandler
      : routeOptions.preHandler
        ? [routeOptions.preHandler]
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasPhiGuard = preHandlers.some((fn: any) => typeof fn === 'function' && fn.name === 'phiGuard');

    for (const method of methods) {
      if (method === 'HEAD') continue; // Skip auto-generated HEAD routes
      collectedRoutes.push({
        method: method.toUpperCase(),
        url: routeOptions.url,
        hasPhiGuard,
      });
    }
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(casesRoutes, { prefix: '/api/cases' });
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' });
  await fastify.register(readinessRoutes, { prefix: '/api/readiness' });
  await fastify.register(checklistsRoutes, { prefix: '/api' });
  await fastify.register(locationsRoutes, { prefix: '/api/locations' });
  await fastify.register(catalogRoutes, { prefix: '/api/catalog' });
  await fastify.register(catalogGroupsRoutes, { prefix: '/api/catalog/groups' });
  await fastify.register(catalogSetsRoutes, { prefix: '/api/catalog/sets' });
  await fastify.register(catalogImagesRoutes, { prefix: '/api/catalog' });
  await fastify.register(preferenceCardsRoutes, { prefix: '/api/preference-cards' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });
  await fastify.register(caseCardsRoutes, { prefix: '/api/case-cards' });
  await fastify.register(caseDashboardRoutes, { prefix: '/api/case-dashboard' });
  await fastify.register(reportsRoutes, { prefix: '/api/reports' });
  await fastify.register(generalSettingsRoutes, { prefix: '/api/general-settings' });
  await fastify.register(scheduleRoutes, { prefix: '/api/schedule' });
  await fastify.register(adminSettingsRoutes, { prefix: '/api/admin/settings' });
  await fastify.register(aiRoutes, { prefix: '/api/ai' });
  // Platform Control Plane (LAW §2.3: Separation at routing layer)
  await fastify.register(platformRoutes, { prefix: '/api/platform' });
  // Wave 1: Financial Attribution
  await fastify.register(vendorsRoutes, { prefix: '/api/vendors' });
  await fastify.register(loanerSetsRoutes, { prefix: '/api/loaner-sets' });
  await fastify.register(attentionRoutes, { prefix: '/api/attention' });
  // PHI Phase 1: Organization model
  await fastify.register(organizationRoutes, { prefix: '/api/organizations' });
  await fastify.register(phiAuditRoutes, { prefix: '/api/phi-audit' });
  // PHI Phase 6A: Patient identity domain
  await fastify.register(phiPatientRoutes, { prefix: '/api/phi-patient' });

  // ── PHI Phase 4D: Governance validation on ready ──
  fastify.addHook('onReady', async () => {
    const violations = validatePhiGovernance(collectedRoutes);

    if (violations.length === 0) {
      fastify.log.info('PHI Governance: All routes validated — no violations');
      return;
    }

    const undeclared = violations.filter(v => v.violation === 'UNDECLARED_PHI_ROUTE');
    const missing = violations.filter(v => v.violation === 'MISSING_MANIFEST_ENTRY');

    for (const v of undeclared) {
      fastify.log.error(v, 'PHI Governance violation: undeclared PHI route');
    }

    for (const v of missing) {
      fastify.log.warn(v, 'PHI Governance: manifest entry has no matching route');
    }

    if (undeclared.length > 0 && process.env.NODE_ENV !== 'development') {
      throw new Error(
        `PHI Governance: ${undeclared.length} undeclared PHI route(s) detected. Startup aborted. ` +
        `Add missing routes to phi-route-manifest.ts or remove requirePhiAccess from them.`
      );
    }

    if (violations.length > 0) {
      fastify.log.warn(
        { violationCount: violations.length, undeclared: undeclared.length, missing: missing.length },
        'PHI Governance violations detected (dev mode — continuing)'
      );
    }
  });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 API server running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
