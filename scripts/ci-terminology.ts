#!/usr/bin/env node
/**
 * CI Terminology Guardrail
 *
 * Detects deprecated or inconsistent user-facing text in the web app.
 * Run: npx tsx scripts/ci-terminology.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

interface Pattern {
  re: RegExp;
  message: string;
}

const PATTERNS: Pattern[] = [
  // "Case Card" in user-facing strings (allow API types like `caseCard.name`)
  { re: /['"`](?:Linked |Link |Change |Print |No |active )?[Cc]ase [Cc]ard(?:s)?['"`]/g, message: 'Use "Preference Card" instead of "Case Card" in user-facing text' },
  // "Post-Op Debrief" or "OR Debrief" in strings
  { re: /['"`].*(?:Post-Op|OR) Debrief/g, message: 'Use "Debrief" (no prefix). See terminology.ts' },
  // ALL-CAPS status labels as display text (not DB constants)
  { re: /['"`]NOT STARTED['"`]/g, message: 'Use statusLabel() instead of "NOT STARTED"' },
  { re: /['"`]IN PROGRESS['"`]/g, message: 'Use statusLabel() instead of "IN PROGRESS"' },
  // Raw capability names shown to users
  { re: /Requires\s+\{blocker\.capability\}/g, message: 'Use capabilityLabel() to display capability names' },
];

// Files/dirs to skip
const SKIP = new Set(['node_modules', '.next', 'dist', 'test', 'scripts']);

interface Violation {
  file: string;
  line: number;
  match: string;
  message: string;
}

function scan(dir: string): Violation[] {
  const violations: Violation[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      violations.push(...scan(full));
    } else if (/\.tsx?$/.test(entry)) {
      const content = readFileSync(full, 'utf-8');
      const lines = content.split('\n');
      for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        lines.forEach((line, idx) => {
          // Reset regex for each line
          const lineRe = new RegExp(pat.re.source, pat.re.flags);
          // Skip comment lines
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
          const m = line.match(lineRe);
          if (m) {
            violations.push({ file: full, line: idx + 1, match: m[0], message: pat.message });
          }
        });
      }
    }
  }
  return violations;
}

const webSrc = join(__dirname, '..', 'apps', 'web', 'src');
const violations = scan(webSrc);

if (violations.length > 0) {
  console.error(`\n  ${violations.length} terminology violation(s):\n`);
  const root = join(__dirname, '..');
  for (const v of violations) {
    console.error(`  ${relative(root, v.file)}:${v.line}`);
    console.error(`    ${v.message}`);
    console.error(`    Found: ${v.match}\n`);
  }
  process.exit(1);
}

console.log('  ✓ No terminology violations found');
