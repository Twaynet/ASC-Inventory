#!/usr/bin/env npx tsx
/**
 * CI Auth Envelope Consistency Check
 *
 * Scans API route files and auth plugin for bare (non-envelope) error responses.
 * All 4xx error responses must use the envelope shape:
 *   { error: { code: string, message: string, ... } }
 *
 * Bare shapes like { error: 'string' } or { error: 'Forbidden', message: '...' }
 * are violations.
 *
 * Usage:
 *   npx tsx scripts/ci-auth-envelope.ts
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

const violations: Violation[] = [];

/**
 * Route files not yet migrated to envelope errors.
 * Each entry must have a removeBy milestone.
 * As routes are migrated to registerContractRoute / fail(), remove them here.
 */
const ENVELOPE_ALLOWLIST: Record<string, { removeBy: string }> = {
  'case-cards.routes.ts': { removeBy: 'Wave 4' },
  'checklists.routes.ts': { removeBy: 'Wave 4' },
  'general-settings.routes.ts': { removeBy: 'Wave 4' },
  'locations.routes.ts': { removeBy: 'Wave 4' },
  'preference-cards.routes.ts': { removeBy: 'Wave 4' },
  'readiness.routes.ts': { removeBy: 'Wave 4' },
  'schedule.routes.ts': { removeBy: 'Wave 4' },
  'users.routes.ts': { removeBy: 'Wave 4' },
  'admin-settings.routes.ts': { removeBy: 'Wave 4' },
  'settings.routes.ts': { removeBy: 'Wave 4' },
  'catalog-sets.routes.ts': { removeBy: 'Wave 4' },
  'catalog-groups.routes.ts': { removeBy: 'Wave 4' },
  'catalog-images.routes.ts': { removeBy: 'Wave 4' },
  'case-dashboard.routes.ts': { removeBy: 'Wave 4' },
  'or-workflow.routes.ts': { removeBy: 'Wave 4' },
  'scanner.routes.ts': { removeBy: 'Wave 4' },
};

function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, pattern));
    } else if (pattern.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

// Scan route files and auth plugin
const scanDirs = [
  join(ROOT, 'apps', 'api', 'src', 'routes'),
  join(ROOT, 'apps', 'api', 'src', 'plugins'),
];

for (const dir of scanDirs) {
  const files = findFiles(dir, /\.ts$/);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const basename = file.replace(/.*[/\\]/, '');
    if (ENVELOPE_ALLOWLIST[basename]) continue; // Skip allowlisted files

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Detect bare error patterns:
      // .send({ error: 'string' }) or .send({ error: "string" })
      if (/\.send\(\{\s*error:\s*['"]/.test(line)) {
        violations.push({ file: rel, line: i + 1, snippet: trimmed.slice(0, 120) });
      }

      // .send({ error: 'string', message: ... })
      if (/\.send\(\{\s*error:\s*['"][^{]/.test(line) && /message:/.test(line)) {
        // Already caught above, but double-check the flat shape
        if (!/error:\s*\{/.test(line)) {
          violations.push({ file: rel, line: i + 1, snippet: trimmed.slice(0, 120) });
        }
      }
    }
  }
}

// Report
console.log('\n' + '='.repeat(70));
console.log('AUTH ENVELOPE CONSISTENCY CHECK');
console.log('='.repeat(70));

if (violations.length === 0) {
  console.log('\n\x1b[32mPASS — All error responses use envelope shape.\x1b[0m\n');
  process.exit(0);
} else {
  // Deduplicate
  const seen = new Set<string>();
  for (const v of violations) {
    const key = `${v.file}:${v.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n\x1b[31mFAIL\x1b[0m ${v.file}:${v.line}`);
    console.log(`  Bare error response: ${v.snippet}`);
  }
  console.log(`\n\x1b[31m${seen.size} violation(s) found.\x1b[0m\n`);
  process.exit(1);
}
