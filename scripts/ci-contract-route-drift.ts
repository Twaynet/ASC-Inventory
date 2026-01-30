#!/usr/bin/env npx tsx
/**
 * CI Contract Route Registration Guardrail
 *
 * Ensures the 30 contracted endpoints are registered ONLY via
 * registerContractRoute(), not via raw fastify.get/post/patch/delete.
 *
 * Strategy: each route file that has contracted endpoints MUST import
 * registerContractRoute. We verify the import exists and that the
 * number of registerContractRoute() calls matches expectations.
 */

import { readFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename).replace(/[\\/]scripts$/, '');

interface RouteFileSpec {
  path: string;
  expectedContractRoutes: number;
}

// Files with contracted endpoints and how many contract routes each should have
const ROUTE_FILES: RouteFileSpec[] = [
  { path: join(ROOT, 'apps', 'api', 'src', 'routes', 'cases.routes.ts'), expectedContractRoutes: 11 },
  { path: join(ROOT, 'apps', 'api', 'src', 'routes', 'inventory.routes.ts'), expectedContractRoutes: 8 },
  { path: join(ROOT, 'apps', 'api', 'src', 'routes', 'catalog.routes.ts'), expectedContractRoutes: 9 },
  { path: join(ROOT, 'apps', 'api', 'src', 'routes', 'catalog-images.routes.ts'), expectedContractRoutes: 2 },
];

let failures = 0;

console.log('\n' + '='.repeat(70));
console.log('CONTRACT ROUTE REGISTRATION DRIFT CHECK');
console.log('='.repeat(70) + '\n');

for (const spec of ROUTE_FILES) {
  const rel = relative(ROOT, spec.path).replace(/\\/g, '/');
  const content = readFileSync(spec.path, 'utf-8');

  // Check import exists
  if (!content.includes('registerContractRoute')) {
    console.log(`\x1b[31mFAIL\x1b[0m ${rel}`);
    console.log(`  Missing registerContractRoute import/usage`);
    console.log(`  Expected ${spec.expectedContractRoutes} contract route(s)\n`);
    failures++;
    continue;
  }

  // Count registerContractRoute() calls
  const matches = content.match(/registerContractRoute\s*\(/g);
  const count = matches ? matches.length : 0;

  if (count !== spec.expectedContractRoutes) {
    console.log(`\x1b[31mFAIL\x1b[0m ${rel}`);
    console.log(`  Found ${count} registerContractRoute() call(s), expected ${spec.expectedContractRoutes}`);
    console.log(`  If you added/removed a contracted endpoint, update this check.\n`);
    failures++;
  } else {
    console.log(`\x1b[32mPASS\x1b[0m ${rel} — ${count} contract route(s)`);
  }
}

console.log('');
if (failures > 0) {
  console.log(`\x1b[31m${failures} file(s) failed.\x1b[0m`);
  console.log('Contracted endpoints must use registerContractRoute() from @asc/contract.\n');
  process.exit(1);
} else {
  console.log('\x1b[32mAll contract route files verified.\x1b[0m\n');
  process.exit(0);
}
