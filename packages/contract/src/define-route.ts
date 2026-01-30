/**
 * Contract route definition helper.
 *
 * Each route in the contract registry is a plain object describing
 * the HTTP method, path, and Zod schemas for params/query/body/response.
 */

import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ContractRoute {
  method: HttpMethod;
  path: string;
  summary?: string;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  /** Response schema for the unwrapped payload (inside { data }), or 'void' for 204. */
  response: z.ZodTypeAny | 'void';
}

/**
 * Identity helper that provides type checking for route definitions.
 * Returns the definition as-is with full type inference.
 */
export function defineRoute<T extends ContractRoute>(def: T): T {
  return def;
}
