/**
 * CLI script: generate typed client types from artifacts/openapi.json
 *
 * Usage: npx tsx packages/contract/scripts/generate-client.ts
 *
 * Runs openapi-typescript to produce TypeScript type definitions,
 * then prepends a generation header.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');
const inputPath = resolve(root, 'artifacts', 'openapi.json');
const outputDir = resolve(root, 'apps', 'web', 'src', 'lib', 'api', 'openapi');
const outputPath = resolve(outputDir, 'schema.d.ts');

mkdirSync(outputDir, { recursive: true });

// Run openapi-typescript CLI
execSync(
  `npx openapi-typescript "${inputPath}" -o "${outputPath}" --export-type`,
  { cwd: root, stdio: 'pipe' },
);

// Prepend header comment
const generated = readFileSync(outputPath, 'utf-8');
const header = `/**
 * GENERATED FILE — DO NOT EDIT
 *
 * Auto-generated from artifacts/openapi.json by openapi-typescript.
 * Source: @asc/contract route definitions.
 *
 * Regenerate: npm run generate:all
 */

`;

writeFileSync(outputPath, header + generated, 'utf-8');
console.log(`Generated ${outputPath}`);
