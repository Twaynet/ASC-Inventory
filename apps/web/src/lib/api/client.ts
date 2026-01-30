/**
 * Shared HTTP client for the ASC Inventory web app.
 *
 * Responsibilities:
 * - Authorization header injection
 * - X-Active-Persona header injection (UX metadata, not auth)
 * - JSON request/response handling
 * - Error normalization to ApiError
 * - { data } envelope unwrapping
 *
 * This is the ONLY file that should call fetch() for API requests.
 * Domain modules (auth.ts, cases.ts, etc.) call request() from here.
 */

import { PERSONA_STORAGE_KEY, PERSONA_HEADER } from '@asc/domain';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// Error class
// ============================================================================

/**
 * Structured API error matching the server envelope: { error: { code, message, details? } }
 */
export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Request options
// ============================================================================

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  /** Zod schema for response validation (placeholder — enforced in future wave) */
  responseSchema?: unknown;
  /** Zod schema for request body validation (placeholder — enforced in future wave) */
  requestSchema?: unknown;
}

// ============================================================================
// Core fetch wrapper
// ============================================================================

/**
 * Core fetch wrapper.
 *
 * Handles both response shapes during migration:
 *   - New envelope: { data: <payload> } → returns <payload>
 *   - Legacy:       <payload>           → returns <payload> as-is
 *
 * Errors:
 *   - New envelope: { error: { code, message, details? } } → throws ApiError
 *   - Legacy:       { error: "string" }                     → throws ApiError
 */
export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {};

  // Only set Content-Type if there's a body
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Attach active persona from localStorage (UX metadata, not authorization)
  if (typeof window !== 'undefined') {
    const persona = localStorage.getItem(PERSONA_STORAGE_KEY);
    if (persona) {
      headers[PERSONA_HEADER] = persona;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    // Support both new { error: { code, message } } and legacy { error: "string" }
    if (errBody.error && typeof errBody.error === 'object') {
      throw new ApiError(
        response.status,
        errBody.error.code || 'UNKNOWN',
        errBody.error.message || 'Unknown error',
        errBody.error.details,
      );
    }
    throw new ApiError(
      response.status,
      'UNKNOWN',
      typeof errBody.error === 'string' ? errBody.error : `API Error: ${response.status}`,
    );
  }

  const json = await response.json();

  // Auto-unwrap { data } envelope if present (new convention)
  if (json && typeof json === 'object' && 'data' in json && Object.keys(json).length === 1) {
    return json.data as T;
  }

  // Legacy: return as-is
  return json as T;
}

// ============================================================================
// Utility
// ============================================================================

/** Resolve a relative asset URL (e.g. /uploads/...) to a full URL using the API origin */
export function resolveAssetUrl(assetUrl: string): string {
  if (!assetUrl.startsWith('/')) return assetUrl;
  try {
    return new URL(assetUrl, API_BASE).href;
  } catch {
    return assetUrl;
  }
}
