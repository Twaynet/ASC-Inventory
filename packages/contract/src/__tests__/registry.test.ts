/**
 * Guardrail tests for the contract registry.
 *
 * Ensures every registered route has required fields.
 */

import { describe, it, expect } from 'vitest';
import { contract } from '../routes/index.js';
import type { ContractRoute } from '../define-route.js';

function allRoutes(): Array<{ key: string; route: ContractRoute }> {
  const result: Array<{ key: string; route: ContractRoute }> = [];
  for (const [groupName, routes] of Object.entries(contract)) {
    for (const [routeName, route] of Object.entries(routes as Record<string, ContractRoute>)) {
      result.push({ key: `${groupName}.${routeName}`, route });
    }
  }
  return result;
}

describe('Contract registry guardrails', () => {
  const routes = allRoutes();

  it('has at least 10 routes registered', () => {
    expect(routes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(routes)('$key has method and path', ({ route }) => {
    expect(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).toContain(route.method);
    expect(route.path).toMatch(/^\//);
  });

  it.each(routes)('$key has a response schema or void', ({ route }) => {
    const valid = route.response === 'void' || (typeof route.response === 'object' && '_def' in route.response);
    expect(valid).toBe(true);
  });

  it.each(routes)('$key path starts with /', ({ route }) => {
    expect(route.path.startsWith('/')).toBe(true);
  });
});
