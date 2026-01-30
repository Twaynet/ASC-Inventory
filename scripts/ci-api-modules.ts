#!/usr/bin/env npx tsx
/**
 * CI API Module Guardrails
 *
 * Enforces:
 * 1. No direct fetch() in domain modules (only client.ts may call fetch).
 * 2. Schema discipline — every exported endpoint wrapper must either pass
 *    responseSchema to request() or have a // TODO(api-schema): comment.
 * 3. Schema-debt cap — total TODO(api-schema) count must not exceed baseline.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename).replace(/[\\/]scripts$/, '');
const API_DIR = join(ROOT, 'apps', 'web', 'src', 'lib', 'api');

// Baseline: number of TODO(api-schema) comments as of Wave 4.5.
// This number must NEVER increase. Decrease it as schemas are added.
const SCHEMA_TODO_BASELINE = 141;

interface Violation {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

const violations: Violation[] = [];

// Collect all .ts files in the api/ directory
const apiFiles = readdirSync(API_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => join(API_DIR, f));

// ============================================================================
// Check 1: No direct fetch() in domain modules
// ============================================================================

for (const file of apiFiles) {
  const basename = file.replace(/.*[/\\]/, '');
  if (basename === 'client.ts') continue; // client.ts is allowed to use fetch

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    if (/\bfetch\s*\(/.test(line)) {
      // Allow fetch() if the preceding line has a fetch-allowlist comment
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (prevLine.includes('fetch-allowlist:')) continue;

      violations.push({
        file: rel,
        line: i + 1,
        rule: 'NO_FETCH: Direct fetch() call in domain module. Use request() from client.ts instead.',
        snippet: trimmed.slice(0, 100),
      });
    }
  }
}

// ============================================================================
// Check 2: Schema/TODO discipline for exported endpoint wrappers
// ============================================================================

for (const file of apiFiles) {
  const basename = file.replace(/.*[/\\]/, '');
  if (basename === 'client.ts') continue;

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: export async function someName(
    if (!/^export\s+async\s+function\s+\w+/.test(line)) continue;

    // Check if the preceding line (or two lines above) has a TODO(api-schema) comment
    const prevLine1 = i > 0 ? lines[i - 1].trim() : '';
    const prevLine2 = i > 1 ? lines[i - 2].trim() : '';
    const hasTodo = prevLine1.includes('TODO(api-schema)') || prevLine2.includes('TODO(api-schema)');

    // Check if the function body passes responseSchema to request()
    // Look ahead up to 15 lines for the function body
    const bodySlice = lines.slice(i, Math.min(i + 15, lines.length)).join(' ');
    const hasSchema = /responseSchema/.test(bodySlice);

    if (!hasTodo && !hasSchema) {
      const fnMatch = line.match(/export\s+async\s+function\s+(\w+)/);
      const fnName = fnMatch ? fnMatch[1] : 'unknown';
      violations.push({
        file: rel,
        line: i + 1,
        rule: `SCHEMA_MISSING: "${fnName}" lacks both responseSchema and // TODO(api-schema): comment.`,
        snippet: line.trim().slice(0, 100),
      });
    }
  }
}

// ============================================================================
// Check 3: Schema-debt baseline cap
// ============================================================================

let totalTodos = 0;
for (const file of apiFiles) {
  const content = readFileSync(file, 'utf-8');
  const matches = content.match(/\/\/ TODO\(api-schema\):/g);
  if (matches) totalTodos += matches.length;
}

if (totalTodos > SCHEMA_TODO_BASELINE) {
  violations.push({
    file: 'apps/web/src/lib/api/',
    line: 0,
    rule: `SCHEMA_DEBT: TODO(api-schema) count (${totalTodos}) exceeds baseline (${SCHEMA_TODO_BASELINE}). New endpoints must provide schemas.`,
    snippet: `Current: ${totalTodos}, Baseline: ${SCHEMA_TODO_BASELINE}`,
  });
}

// ============================================================================
// Report
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('API MODULE GUARDRAILS CHECK');
console.log('='.repeat(70));

if (violations.length === 0) {
  console.log('\n\x1b[32mPASS — No violations found.\x1b[0m');
  console.log(`\nSchema debt: ${totalTodos} TODO(api-schema) / ${SCHEMA_TODO_BASELINE} baseline`);
  if (totalTodos < SCHEMA_TODO_BASELINE) {
    console.log(`\x1b[33m↑ Baseline can be lowered to ${totalTodos}\x1b[0m`);
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
