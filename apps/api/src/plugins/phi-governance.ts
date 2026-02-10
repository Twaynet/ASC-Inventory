/**
 * PHI Governance Validation — Startup Guardrails
 *
 * Phase 4D: Governance Guardrails
 *
 * Validates that all PHI-exposing routes are declared in the manifest.
 * Called from index.ts via onReady hook.
 *
 * FAIL CLOSED in non-development environments:
 *   - If any UNDECLARED_PHI_ROUTE violations exist, the server MUST NOT start.
 *   - If any MISSING_MANIFEST_ENTRY violations exist, the server logs warnings
 *     but continues (stale manifest entries are non-critical).
 *
 * In development (NODE_ENV=development), violations are logged as warnings
 * but do not prevent startup, to avoid blocking local iteration.
 *
 * Refinement #2: Each GovernanceViolation includes structured context
 * (method, url, violation type, hasPhiGuard) suitable for immediate
 * forensic review.
 */

import { PHI_ROUTE_MANIFEST } from '../phi-route-manifest.js';

// ============================================================================
// Types
// ============================================================================

export type GovernanceViolationType =
  | 'UNDECLARED_PHI_ROUTE'     // Route has requirePhiAccess but is NOT in manifest
  | 'MISSING_MANIFEST_ENTRY';  // Manifest entry has no matching registered route

export interface GovernanceViolation {
  route: { method: string; url: string };
  violation: GovernanceViolationType;
  hasPhiGuard: boolean;
}

export interface CollectedRoute {
  method: string;
  url: string;
  hasPhiGuard: boolean;
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a URL path for comparison by replacing named path parameters
 * (e.g. `:caseId`, `:id`, `:entityId`) with a canonical `:param` token.
 *
 * This ensures that manifest entries like `/api/cases/:caseId` match
 * registered routes like `/api/cases/:caseId` regardless of parameter
 * naming differences between contract routes and legacy routes.
 */
function normalizePath(url: string): string {
  return url
    .split('/')
    .map(segment => (segment.startsWith(':') ? ':param' : segment))
    .join('/');
}

/**
 * Create a canonical key for route matching: "METHOD /normalized/path"
 */
function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${normalizePath(url)}`;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate PHI governance at startup.
 *
 * Compares the set of registered routes that have PHI guards against the
 * PHI_ROUTE_MANIFEST. Returns an array of violations. Empty = all clear.
 *
 * @param registeredRoutes - All routes collected from the Fastify route table,
 *                           each annotated with whether it has a PHI guard.
 * @returns Array of GovernanceViolation objects. Empty array means no violations.
 */
export function validatePhiGovernance(
  registeredRoutes: CollectedRoute[]
): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  // Build set of manifest route keys for fast lookup
  const manifestKeys = new Set(
    PHI_ROUTE_MANIFEST.map(entry => routeKey(entry.method, entry.url))
  );

  // Build set of registered route keys for fast lookup
  const registeredKeys = new Set(
    registeredRoutes.map(route => routeKey(route.method, route.url))
  );

  // Build map of registered routes by key for hasPhiGuard lookup
  const registeredMap = new Map<string, CollectedRoute>();
  for (const route of registeredRoutes) {
    registeredMap.set(routeKey(route.method, route.url), route);
  }

  // ── Check 1: Registered routes with PHI guard that are NOT in manifest ──
  for (const route of registeredRoutes) {
    if (!route.hasPhiGuard) continue;

    const key = routeKey(route.method, route.url);
    if (!manifestKeys.has(key)) {
      violations.push({
        route: { method: route.method.toUpperCase(), url: route.url },
        violation: 'UNDECLARED_PHI_ROUTE',
        hasPhiGuard: true,
      });
    }
  }

  // ── Check 2: Manifest entries that have no matching registered route ──
  for (const entry of PHI_ROUTE_MANIFEST) {
    const key = routeKey(entry.method, entry.url);
    if (!registeredKeys.has(key)) {
      violations.push({
        route: { method: entry.method.toUpperCase(), url: entry.url },
        violation: 'MISSING_MANIFEST_ENTRY',
        hasPhiGuard: false,  // No registered route exists to have a guard
      });
    }
  }

  return violations;
}
