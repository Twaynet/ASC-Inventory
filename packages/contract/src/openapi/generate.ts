/**
 * OpenAPI 3.1 document generator.
 *
 * Walks the contract registry and produces an OpenAPI document
 * using @asteasolutions/zod-to-openapi.
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { contract } from '../routes/index.js';
import type { ContractRoute } from '../define-route.js';

// Extend Zod with .openapi() method
extendZodWithOpenApi(z);

/**
 * Convert a contract route path like `/cases/:caseId` to OpenAPI `/cases/{caseId}`.
 */
function toOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

/**
 * Generate an OpenAPI 3.1 document from the contract registry.
 */
export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  // Walk all route groups
  const groups = Object.entries(contract) as [string, Record<string, ContractRoute>][];

  for (const [groupName, routes] of groups) {
    for (const [routeName, route] of Object.entries(routes)) {
      const operationId = `${groupName}.${routeName}`;
      const openApiPath = toOpenApiPath(route.path);

      const pathParams: Array<{
        in: 'path';
        name: string;
        schema: z.ZodTypeAny;
        required: true;
      }> = [];
      const queryParams: Array<{
        in: 'query';
        name: string;
        schema: z.ZodTypeAny;
        required: boolean;
      }> = [];

      // Extract path params
      if (route.params && route.params instanceof z.ZodObject) {
        const shape = route.params.shape as Record<string, z.ZodTypeAny>;
        for (const [name, schema] of Object.entries(shape)) {
          pathParams.push({ in: 'path', name, schema, required: true });
        }
      }

      // Extract query params
      if (route.query && route.query instanceof z.ZodObject) {
        const shape = route.query.shape as Record<string, z.ZodTypeAny>;
        for (const [name, schema] of Object.entries(shape)) {
          const isOptional = schema.isOptional();
          queryParams.push({ in: 'query', name, schema, required: !isOptional });
        }
      }

      const request: Record<string, unknown> = {};
      if (route.body) {
        request.body = {
          content: {
            'application/json': {
              schema: route.body,
            },
          },
          required: true,
        };
      }

      const responses: Record<string, { description: string; content?: Record<string, { schema: z.ZodTypeAny }> }> = {};
      if (route.response === 'void') {
        responses['204'] = { description: 'No content' };
      } else {
        responses['200'] = {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: z.object({ data: route.response as z.ZodTypeAny }),
            },
          },
        };
      }

      registry.registerPath({
        method: route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete',
        path: openApiPath,
        operationId,
        summary: route.summary,
        request: {
          params: pathParams.length > 0
            ? z.object(Object.fromEntries(
                pathParams.map(p => [p.name, p.schema])
              ))
            : undefined,
          query: queryParams.length > 0
            ? z.object(Object.fromEntries(
                queryParams.map(p => [p.name, p.schema])
              ))
            : undefined,
          body: route.body
            ? { content: { 'application/json': { schema: route.body } } }
            : undefined,
        },
        responses,
      });
    }
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ASC Inventory API',
      version: '1.4.0',
      description: 'Auto-generated from @asc/contract route definitions.',
    },
    servers: [
      { url: 'http://localhost:3001/api', description: 'Local development' },
    ],
  });
}
