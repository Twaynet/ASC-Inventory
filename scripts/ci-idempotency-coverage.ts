#!/usr/bin/env npx tsx
/**
 * CI Idempotency Coverage Check
 *
 * Verifies that all high-risk write endpoints have idempotent() in their
 * preHandler chain. Prevents regression when adding new state-changing endpoints.
 *
 * Usage:
 *   npx tsx scripts/ci-idempotency-coverage.ts
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * High-risk write endpoints that MUST have idempotent() middleware.
 * Format: { file, contractName } where contractName is the contract key
 * used in registerContractRoute (e.g. contract.cases.approve).
 */
const REQUIRED_IDEMPOTENT_ENDPOINTS = [
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.approve' },
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.reject' },
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.cancel' },
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.activate' },
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.deactivate' },
  { file: 'apps/api/src/routes/cases.routes.ts', pattern: 'contract.cases.assignRoom' },
  { file: 'apps/api/src/routes/inventory.routes.ts', pattern: 'contract.inventory.createEvent' },
  { file: 'apps/api/src/routes/inventory.routes.ts', pattern: 'contract.inventory.bulkEvents' },
];

interface Violation {
  file: string;
  pattern: string;
  reason: string;
}

const violations: Violation[] = [];

// Group by file for efficient scanning
const byFile = new Map<string, typeof REQUIRED_IDEMPOTENT_ENDPOINTS>();
for (const ep of REQUIRED_IDEMPOTENT_ENDPOINTS) {
  const list = byFile.get(ep.file) || [];
  list.push(ep);
  byFile.set(ep.file, list);
}

for (const [file, endpoints] of byFile) {
  const fullPath = join(ROOT, file);
  let content: string;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    for (const ep of endpoints) {
      violations.push({ file, pattern: ep.pattern, reason: 'File not found' });
    }
    continue;
  }

  for (const ep of endpoints) {
    // Find the registerContractRoute call for this endpoint
    const idx = content.indexOf(ep.pattern);
    if (idx === -1) {
      violations.push({ file, pattern: ep.pattern, reason: 'Contract route registration not found' });
      continue;
    }

    // Look at the surrounding context (500 chars before/after) for idempotent()
    const start = Math.max(0, idx - 200);
    const end = Math.min(content.length, idx + 500);
    const context = content.slice(start, end);

    if (!context.includes('idempotent()')) {
      violations.push({ file, pattern: ep.pattern, reason: 'Missing idempotent() in preHandler' });
    }
  }
}

// Report
console.log('\n' + '='.repeat(70));
console.log('IDEMPOTENCY COVERAGE CHECK');
console.log('='.repeat(70));

console.log(`\nChecked ${REQUIRED_IDEMPOTENT_ENDPOINTS.length} high-risk write endpoints.`);

if (violations.length === 0) {
  console.log('\n\x1b[32mPASS — All high-risk endpoints have idempotent() middleware.\x1b[0m\n');
  process.exit(0);
} else {
  for (const v of violations) {
    console.log(`\n\x1b[31mFAIL\x1b[0m ${v.file}`);
    console.log(`  Endpoint: ${v.pattern}`);
    console.log(`  Reason: ${v.reason}`);
  }
  console.log(`\n\x1b[31m${violations.length} violation(s) found.\x1b[0m\n`);
  process.exit(1);
}
