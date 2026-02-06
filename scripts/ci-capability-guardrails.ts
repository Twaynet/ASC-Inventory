#!/usr/bin/env npx tsx
/**
 * CI Capability Guardrails
 *
 * Enforces:
 * 1. Single source of truth — Capability type and deriveCapabilities must only
 *    be defined in @asc/domain (packages/domain/src/types.ts).
 *    Re-exports/wrappers are allowed elsewhere but not duplicate definitions.
 * 2. No role-middleware regression — route files must not import
 *    requireAdmin/requireScheduler/requireInventoryTech/requireSurgeon.
 *    Allowlisted exceptions require structured metadata.
 * 3. No alternate capability definitions — ROLE_CAPABILITIES must not be
 *    redefined outside the canonical file.
 * 4. No `as Capability` casts in route files (prevents type-system bypass).
 *
 * Usage:
 *   npx tsx scripts/ci-capability-guardrails.ts
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ============================================================================
// Config
// ============================================================================

interface AllowlistEntry {
  /** Why this file still uses role-based middleware */
  reason: string;
  /** The capability that should replace the role middleware */
  targetCapability: string;
  /** Milestone/wave by which this should be removed */
  removeBy: string;
}

/**
 * Files allowed to import role-based middleware (requireAdmin, etc.)
 * Every entry MUST have: reason, targetCapability, removeBy.
 *
 * Each allowlisted file must also contain a comment:
 *   // capability-guardrail-allowlist: <reason>
 */
const ROLE_MIDDLEWARE_ALLOWLIST: Record<string, AllowlistEntry> = {
  // Wave 4 complete — all routes now use requireCapabilities()
};

const ROLE_MIDDLEWARE_PATTERN = /\b(requireAdmin|requireScheduler|requireInventoryTech|requireSurgeon)\b/;

/** Canonical location for Capability type, ROLE_CAPABILITIES, and deriveCapabilities */
const CANONICAL_FILE = 'packages/domain/src/types.ts';

/** Comment that must appear in allowlisted route files */
const ALLOWLIST_COMMENT_PATTERN = /capability-guardrail-allowlist:/;

// ============================================================================
// File discovery
// ============================================================================

function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.next') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, pattern));
    } else if (pattern.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================================
// Checks
// ============================================================================

interface Violation {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

const violations: Violation[] = [];

// --- Check 0: Validate allowlist metadata completeness ---

for (const [file, entry] of Object.entries(ROLE_MIDDLEWARE_ALLOWLIST)) {
  if (!entry.reason || !entry.targetCapability || !entry.removeBy) {
    violations.push({
      file: `ALLOWLIST:${file}`,
      line: 0,
      rule: 'ALLOWLIST_METADATA: Every allowlist entry must have reason, targetCapability, and removeBy',
      snippet: JSON.stringify(entry),
    });
  }
}

// --- Check 1: Single source of truth ---

const allTsFiles = findFiles(ROOT, /\.tsx?$/).filter(f => {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  return !rel.startsWith('scripts/');
});

for (const file of allTsFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for duplicate Capability type definition
    if (/export\s+type\s+Capability\s*=/.test(line) && rel !== CANONICAL_FILE) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'SINGLE_SOURCE: Capability type must only be defined in ' + CANONICAL_FILE,
        snippet: line.trim().slice(0, 100),
      });
    }

    // Check for duplicate ROLE_CAPABILITIES definition
    if (/export\s+const\s+ROLE_CAPABILITIES/.test(line) && rel !== CANONICAL_FILE) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'SINGLE_SOURCE: ROLE_CAPABILITIES must only be defined in ' + CANONICAL_FILE,
        snippet: line.trim().slice(0, 100),
      });
    }

    // Check for duplicate deriveCapabilities definition (not re-export/wrapper)
    if (/export\s+function\s+deriveCapabilities/.test(line) && rel !== CANONICAL_FILE) {
      const fnBody = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
      const isWrapper = /_domainDeriveCapabilities|@asc\/domain/.test(fnBody);
      if (!isWrapper) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: 'SINGLE_SOURCE: deriveCapabilities must delegate to @asc/domain, not reimplement',
          snippet: line.trim().slice(0, 100),
        });
      }
    }

    // Check for renamed duplicates (e.g. ROLE_CAPS, roleCapabilities, capabilityMap)
    if (rel !== CANONICAL_FILE && /export\s+const\s+\w*(ROLE_CAP|roleCapabilit|capabilityMap)\w*\s*[:=]/.test(line)) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'SINGLE_SOURCE: Possible renamed capability mapping. Use ROLE_CAPABILITIES from @asc/domain.',
        snippet: line.trim().slice(0, 100),
      });
    }
  }
}

// --- Check 2: No role-middleware in route files ---

const routeFiles = findFiles(join(ROOT, 'apps', 'api', 'src', 'routes'), /\.routes\.ts$/);

for (const file of routeFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const basename = file.replace(/.*[/\\]/, '');
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  const isAllowlisted = !!ROLE_MIDDLEWARE_ALLOWLIST[basename];
  let usesRoleMiddleware = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    const match = line.match(ROLE_MIDDLEWARE_PATTERN);
    if (match) {
      usesRoleMiddleware = true;
      if (!isAllowlisted) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: `ROLE_MIDDLEWARE: "${match[1]}" found in non-allowlisted route file. Use requireCapabilities() instead.`,
          snippet: trimmed.slice(0, 100),
        });
      }
    }
  }

  // Check 2b: Allowlisted files must contain the linking comment
  if (isAllowlisted && usesRoleMiddleware) {
    if (!ALLOWLIST_COMMENT_PATTERN.test(content)) {
      violations.push({
        file: rel,
        line: 1,
        rule: `ALLOWLIST_COMMENT: Allowlisted file must contain "// capability-guardrail-allowlist: <reason>"`,
        snippet: `Add comment to ${basename}`,
      });
    }
  }
}

// --- Check 3: No `as Capability` casts in route files ---

for (const file of routeFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/as\s+Capability\b/.test(line)) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'CAST_BYPASS: "as Capability" cast in route file bypasses type safety. Use typed capability strings directly.',
        snippet: line.trim().slice(0, 100),
      });
    }
  }
}

// --- Check 4: No new endpoints in monolithic api.ts shim ---

const API_SHIM = join(ROOT, 'apps', 'web', 'src', 'lib', 'api.ts');
if (existsSync(API_SHIM)) {
  const shimContent = readFileSync(API_SHIM, 'utf-8');
  const shimLines = shimContent.split('\n');
  const shimRel = relative(ROOT, API_SHIM).replace(/\\/g, '/');

  for (let i = 0; i < shimLines.length; i++) {
    const line = shimLines[i];
    // Allow: export { ... } from and export type { ... } from (re-exports)
    // Disallow: export function, export async function, export interface, export class, export const (definitions)
    if (/^export\s+(async\s+)?function\s/.test(line) ||
        /^export\s+interface\s/.test(line) ||
        /^export\s+class\s/.test(line) ||
        /^export\s+const\s/.test(line) ||
        /^export\s+type\s+\w+\s*=/.test(line)) {
      violations.push({
        file: shimRel,
        line: i + 1,
        rule: 'API_SHIM: New definition in api.ts shim. Move to a domain module under api/ and re-export.',
        snippet: line.trim().slice(0, 100),
      });
    }
  }
}

// ============================================================================
// Report
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('CAPABILITY GUARDRAILS CHECK');
console.log('='.repeat(70));

if (violations.length === 0) {
  console.log('\n\x1b[32mPASS — No violations found.\x1b[0m\n');

  console.log('Role-middleware allowlist:');
  for (const [file, entry] of Object.entries(ROLE_MIDDLEWARE_ALLOWLIST)) {
    console.log(`  ${file}`);
    console.log(`    target: ${entry.targetCapability}  removeBy: ${entry.removeBy}`);
  }
  console.log('');
  process.exit(0);
} else {
  for (const v of violations) {
    console.log(`\n\x1b[31mFAIL\x1b[0m ${v.file}:${v.line}`);
    console.log(`  Rule: ${v.rule}`);
    console.log(`  Snippet: ${v.snippet}`);
  }
  console.log(`\n\x1b[31m${violations.length} violation(s) found.\x1b[0m\n`);
  process.exit(1);
}
