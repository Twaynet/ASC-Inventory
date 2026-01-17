/**
 * ASC Inventory Truth System - API Server
 * Fastify + Zod backend service
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyJwt from '@fastify/jwt';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { casesRoutes } from './routes/cases.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { readinessRoutes } from './routes/readiness.routes.js';
import { checklistsRoutes } from './routes/checklists.routes.js';

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

  // Register JWT at root level so it's available to all routes
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    sign: {
      expiresIn: '24h',
    },
  });

  // Decorate fastify with authenticate method for route preHandlers
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
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
