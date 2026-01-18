#!/usr/bin/env npx tsx
/**
 * LAW Nomenclature Validator
 *
 * Validates markdown specification documents against LAW_NOMENCLATURE.md rules.
 *
 * Usage:
 *   npx tsx scripts/validate-docs.ts [files...]
 *   npm run validate:docs              # Validate all spec files
 *   npm run validate:doc -- docs/x.md  # Validate specific file
 *
 * Exit codes:
 *   0 = PASS (no violations)
 *   1 = FAIL (violations found)
 */

import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';

// ============================================================================
// Types
// ============================================================================

interface Violation {
  file: string;
  line: number;
  rule: string;
  ruleId: string;
  snippet: string;
}

interface ValidationResult {
  file: string;
  violations: Violation[];
  passed: boolean;
}

// ============================================================================
// Validation Rules
// ============================================================================

interface Rule {
  id: string;
  name: string;
  description: string;
  // Pattern to search for (case-insensitive unless specified)
  pattern: RegExp;
  // Optional: only flag if this context pattern is also present on the same line or nearby
  contextPattern?: RegExp;
  // Optional: exclude if this pattern is present (for false positive reduction)
  excludePattern?: RegExp;
  // Whether this is a hard error or warning
  severity: 'error' | 'warning';
}

const RULES: Rule[] = [
  // -------------------------------------------------------------------------
  // TERMINOLOGY RULES
  // -------------------------------------------------------------------------
  {
    id: 'TERM-001',
    name: 'Case Card Template Forbidden',
    description: 'The term "Case Card (Template)" or "Case Card Template" is forbidden. Use "Surgeon Preference Card" or "SPC".',
    pattern: /case\s+card\s*\(?template\)?/i,
    severity: 'error',
  },
  {
    id: 'TERM-002',
    name: 'Template for SPC Forbidden',
    description: 'Using "template" to describe SPCs is forbidden. SPCs are not templates.',
    pattern: /\btemplate\b/i,
    contextPattern: /\b(spc|surgeon\s+preference|preference\s+card)\b/i,
    excludePattern: /\bnot\s+(a\s+)?template\b|template.*forbidden|forbidden.*template/i,
    severity: 'error',
  },
  {
    id: 'TERM-003',
    name: 'Ambiguous Card Usage',
    description: 'Standalone "Card" without qualifier is ambiguous. Use "SPC" or "Case Card" explicitly.',
    pattern: /\bthe\s+card\b|\ba\s+card\b|\bcards\s+are\b/i,
    excludePattern: /case\s+card|preference\s+card|spc/i,
    severity: 'warning',
  },
  {
    id: 'TERM-004',
    name: 'ProcedureCard Forbidden',
    description: '"ProcedureCard" is not a canonical name. Use "Surgeon Preference Card" or "Case Card".',
    pattern: /\bprocedure\s*card\b/i,
    severity: 'error',
  },
  {
    id: 'TERM-005',
    name: 'Case Card for Preferences',
    description: 'Using "Case Card" to describe preferences/defaults is forbidden. Use "SPC" for preferences.',
    pattern: /case\s+card/i,
    contextPattern: /\b(preference|default|intent|surgeon[\s-]specific|reusable)\b/i,
    excludePattern: /not\s+(a\s+)?case\s+card|is\s+not|does\s+not|explicitly\s+not|case\s+card.*execution|execution.*case\s+card/i,
    severity: 'error',
  },

  // -------------------------------------------------------------------------
  // RELATIONSHIP RULES
  // -------------------------------------------------------------------------
  {
    id: 'REL-001',
    name: 'SPC Tied to Case Forbidden',
    description: 'SPCs must not be described as "tied to" a scheduled case. SPCs represent intent, not execution.',
    pattern: /spc.*tied\s+to.*case|surgeon\s+preference\s+card.*tied\s+to.*case/i,
    excludePattern: /not\s+tied|never\s+tied/i,
    severity: 'error',
  },
  {
    id: 'REL-002',
    name: 'Case Card Reusable Forbidden',
    description: 'Case Cards must not be described as reusable across cases. Each CC is per-case.',
    pattern: /case\s+card.*reusable|reusable.*case\s+card|case\s+card.*multiple\s+cases/i,
    excludePattern: /not\s+reusable|spc.*reusable/i,
    severity: 'error',
  },
  {
    id: 'REL-003',
    name: 'Auto-Update Forbidden',
    description: 'Case Cards must not auto-update when SPC changes. Version must be pinned.',
    pattern: /auto[\s-]?update|automatically\s+update|silently\s+(change|update)/i,
    contextPattern: /case\s+card|cc\b|case\s+instance/i,
    excludePattern: /must\s+not|never|forbidden|do\s+not|does\s+not|won't|will\s+not/i,
    severity: 'error',
  },

  // -------------------------------------------------------------------------
  // VERSIONING RULES
  // -------------------------------------------------------------------------
  {
    id: 'VER-001',
    name: 'Implicit Latest Version',
    description: 'Using "latest version" without explicit pinning language is dangerous.',
    pattern: /latest\s+(updated\s+)?version|current\s+version|most\s+recent\s+version/i,
    excludePattern: /pinned|explicit|forbidden|must\s+not|never|do\s+not/i,
    severity: 'error',
  },
  {
    id: 'VER-002',
    name: 'Missing Version Pinning',
    description: 'When discussing case-SPC linkage, must mention version pinning.',
    pattern: /case\s+(instance|dashboard).*select.*spc|case.*links?\s+to.*spc|spc.*selected\s+for.*case/i,
    excludePattern: /pin|version|explicit/i,
    severity: 'warning',
  },

  // -------------------------------------------------------------------------
  // GOVERNANCE RULES
  // -------------------------------------------------------------------------
  {
    id: 'GOV-001',
    name: 'Admin-Exclusive SPC Forbidden',
    description: 'SPCs must not be admin-exclusive. Multiple roles can create/edit.',
    pattern: /admin[\s-]?(only|exclusive)|only\s+admin|administrator\s+required/i,
    contextPattern: /spc|surgeon\s+preference|preference\s+card|create|edit/i,
    excludePattern: /not\s+admin|no\s+admin\s+exclusiv/i,
    severity: 'error',
  },
  {
    id: 'GOV-002',
    name: 'Surgeon-Only Editing Forbidden',
    description: 'SPCs are not surgeon-only editable. Staff roles can also edit with audit.',
    pattern: /only\s+surgeon|surgeon[\s-]only\s+edit|surgeons?\s+are\s+the\s+only\s+editor/i,
    excludePattern: /not\s+only|owner/i,
    severity: 'error',
  },
  {
    id: 'GOV-003',
    name: 'Approval Workflow Forbidden',
    description: 'SPCs do not require approval workflows. Accountability via audit logging.',
    pattern: /approval\s+(required|workflow|process)|requires?\s+approval|pending\s+approval/i,
    contextPattern: /spc|surgeon\s+preference|preference\s+card/i,
    excludePattern: /no\s+approval|without\s+approval|not.*require.*approval/i,
    severity: 'error',
  },

  // -------------------------------------------------------------------------
  // FILENAME/CONTENT MISMATCH (checked separately)
  // -------------------------------------------------------------------------
];

// ============================================================================
// Validator Logic
// ============================================================================

// Files that are exempt from validation (they define the rules)
const EXEMPT_FILES = [
  'LAW_NOMENCLATURE.md',
  'LAW_VALIDATION_CHECKLIST.md',
];

function validateFile(filePath: string): ValidationResult {
  const violations: Violation[] = [];
  const fileName = basename(filePath);

  // Skip exempt files (they define the rules)
  if (EXEMPT_FILES.some(exempt => fileName.toLowerCase() === exempt.toLowerCase())) {
    return {
      file: filePath,
      violations: [],
      passed: true,
    };
  }

  if (!existsSync(filePath)) {
    return {
      file: filePath,
      violations: [{
        file: filePath,
        line: 0,
        rule: 'File not found',
        ruleId: 'FILE-001',
        snippet: `File does not exist: ${filePath}`,
      }],
      passed: false,
    };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Check filename/content mismatch
  const fileNameLower = fileName.toLowerCase();
  const contentLower = content.toLowerCase();

  // If filename contains "case-card" but content is about SPCs
  if (fileNameLower.includes('case-card') && !fileNameLower.includes('spc')) {
    // Check if the document is actually about SPCs
    const spcMentions = (contentLower.match(/surgeon\s+preference\s+card|spc\b/g) || []).length;
    const ccMentions = (contentLower.match(/\bcase\s+card\b/g) || []).length;

    // If document mentions SPC significantly more than CC in content, flag it
    if (spcMentions > ccMentions * 2 && spcMentions > 5) {
      violations.push({
        file: filePath,
        line: 1,
        rule: 'Filename/Content Mismatch: File is named "case-card" but content is about SPCs',
        ruleId: 'FILE-002',
        snippet: `Filename "${fileName}" suggests Case Card but content is primarily about SPCs (${spcMentions} SPC mentions vs ${ccMentions} Case Card mentions)`,
      });
    }
  }

  // Check each line against rules
  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    RULES.forEach((rule) => {
      // Check if pattern matches
      if (!rule.pattern.test(line)) {
        return;
      }

      // Check context pattern if specified (must also match)
      if (rule.contextPattern && !rule.contextPattern.test(line)) {
        // Check nearby lines (2 lines before and after)
        const nearbyLines = lines.slice(Math.max(0, index - 2), index + 3).join(' ');
        if (!rule.contextPattern.test(nearbyLines)) {
          return;
        }
      }

      // Check exclude pattern (if matches, don't flag)
      if (rule.excludePattern && rule.excludePattern.test(line)) {
        return;
      }

      // Extract snippet (trim and limit length)
      const match = line.match(rule.pattern);
      const snippet = line.trim().slice(0, 100) + (line.trim().length > 100 ? '...' : '');

      violations.push({
        file: filePath,
        line: lineNumber,
        rule: rule.name,
        ruleId: rule.id,
        snippet,
      });
    });
  });

  return {
    file: filePath,
    violations,
    passed: violations.length === 0,
  };
}

// ============================================================================
// Report Generation
// ============================================================================

function printReport(results: ValidationResult[]): void {
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const passedFiles = results.filter(r => r.passed).length;
  const failedFiles = results.filter(r => !r.passed).length;

  console.log('\n' + '='.repeat(80));
  console.log('LAW NOMENCLATURE VALIDATION REPORT');
  console.log('='.repeat(80) + '\n');

  results.forEach((result) => {
    const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`${status} ${result.file}`);

    if (!result.passed) {
      result.violations.forEach((v) => {
        console.log(`  Line ${v.line}: [${v.ruleId}] ${v.rule}`);
        console.log(`    Snippet: "${v.snippet}"`);
      });
    }
    console.log('');
  });

  console.log('-'.repeat(80));
  console.log(`Files:      ${results.length} total, ${passedFiles} passed, ${failedFiles} failed`);
  console.log(`Violations: ${totalViolations} found`);
  console.log('-'.repeat(80));

  if (totalViolations === 0) {
    console.log('\n\x1b[32m*** ALL FILES PASSED LAW VALIDATION ***\x1b[0m\n');
  } else {
    console.log('\n\x1b[31m*** VALIDATION FAILED - FIX VIOLATIONS BEFORE PROCEEDING ***\x1b[0m\n');
  }
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  // Default files to validate if none specified
  const defaultFiles = [
    'docs/surgeon-preference-card-spec.md',
    'docs/case-dashboard.md',
    'docs/spc-governance-workflow.md',
  ];

  const filesToValidate = args.length > 0 ? args : defaultFiles;

  console.log('LAW Nomenclature Validator');
  console.log(`Validating ${filesToValidate.length} file(s)...`);

  const results = filesToValidate.map(validateFile);

  printReport(results);

  // Exit with appropriate code
  const hasFailures = results.some(r => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

main();
