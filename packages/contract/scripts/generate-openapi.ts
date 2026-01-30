/**
 * CLI script: generate artifacts/openapi.json from the contract registry.
 *
 * Usage: npx tsx packages/contract/scripts/generate-openapi.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenApiDocument } from '../src/openapi/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '..', '..', '..', 'artifacts', 'openapi.json');

mkdirSync(dirname(outputPath), { recursive: true });

const doc = generateOpenApiDocument();
const json = JSON.stringify(doc, null, 2) + '\n';

writeFileSync(outputPath, json, 'utf-8');

const pathCount = Object.keys(doc.paths ?? {}).length;
console.log(`Generated ${outputPath} (${pathCount} paths)`);
