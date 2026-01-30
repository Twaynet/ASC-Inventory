/**
 * Contract-based API client helper.
 *
 * Calls an API endpoint defined by a ContractRoute, using the route's
 * schemas for body validation and response type inference.
 */

import { request } from './client';
import type { ContractRoute } from '@asc/contract';
import type { z } from 'zod';

export interface ContractCallOptions {
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  token?: string;
}

/**
 * Build the URL path by substituting :param placeholders and appending query string.
 */
function buildUrl(
  path: string,
  params?: Record<string, string>,
  query?: Record<string, string | undefined>,
): string {
  let url = path;

  // Substitute path params
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }
  }

  // Append query string
  if (query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        searchParams.set(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  return url;
}

/**
 * Call an API endpoint using a contract route definition.
 *
 * Provides automatic URL construction, body schema validation,
 * and response schema validation via the existing request() helper.
 */
export async function callContract<R extends ContractRoute>(
  route: R,
  opts: ContractCallOptions = {},
): Promise<R['response'] extends z.ZodTypeAny ? z.infer<R['response']> : void> {
  const url = buildUrl(route.path, opts.params, opts.query);

  const responseSchema = route.response === 'void' ? undefined : route.response;

  const result = await request(url, {
    method: route.method,
    body: opts.body,
    token: opts.token,
    requestSchema: route.body,
    responseSchema: responseSchema as z.ZodTypeAny | undefined,
  });

  return result as ReturnType<typeof callContract<R>> extends Promise<infer U> ? U : never;
}
