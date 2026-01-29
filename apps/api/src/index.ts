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
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

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
