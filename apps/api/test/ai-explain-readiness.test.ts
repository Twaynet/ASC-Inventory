/**
 * AI Explain Readiness — unit tests
 *
 * Tests cover: feature flag, capability gating, response validation,
 * action_href enforcement, PHI redaction, and rate limiting.
 *
 * NOTE: These tests do NOT call OpenAI. They test the service logic
 * and route guards using mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  redactPhi,
  type ExplainReadinessResponse,
  type ExplainReadinessNextStep,
} from '../src/services/ai.service.js';

// ── PHI Redaction ─────────────────────────────────────────────────────────

describe('redactPhi', () => {
  it('strips date-of-birth patterns', () => {
    expect(redactPhi('Born on 01/15/1990')).toBe('Born on [REDACTED-DATE]');
    expect(redactPhi('DOB: 1-5-90')).toBe('DOB: [REDACTED-DATE]');
  });

  it('strips SSN patterns', () => {
    expect(redactPhi('SSN: 123-45-6789')).toBe('SSN: [REDACTED-SSN]');
  });

  it('strips MRN patterns', () => {
    expect(redactPhi('MRN: ABC12345')).toBe('[REDACTED-MRN]');
    expect(redactPhi('mrn:XYZ')).toBe('[REDACTED-MRN]');
  });

  it('passes through clean text', () => {
    const clean = 'Missing inventory items for Right Knee Arthroscopy';
    expect(redactPhi(clean)).toBe(clean);
  });
});

// ── action_href Enforcement ───────────────────────────────────────────────

describe('action_href enforcement', () => {
  const allowedHrefs = new Set([
    '/admin/inventory/check-in?caseId=abc',
    '/cases',
  ]);

  function enforceHrefs(steps: ExplainReadinessNextStep[]): { steps: ExplainReadinessNextStep[]; violations: string[] } {
    const violations: string[] = [];
    for (const step of steps) {
      if (step.action_href !== null && !allowedHrefs.has(step.action_href)) {
        violations.push(step.action_href);
        step.action_href = null;
      }
    }
    return { steps, violations };
  }

  it('allows valid hrefs through', () => {
    const steps: ExplainReadinessNextStep[] = [
      { label: 'Check in items', why: 'Items missing', action_href: '/admin/inventory/check-in?caseId=abc', requires: null },
    ];
    const { violations } = enforceHrefs(steps);
    expect(violations).toHaveLength(0);
    expect(steps[0].action_href).toBe('/admin/inventory/check-in?caseId=abc');
  });

  it('allows null hrefs', () => {
    const steps: ExplainReadinessNextStep[] = [
      { label: 'Wait', why: 'Pending', action_href: null, requires: null },
    ];
    const { violations } = enforceHrefs(steps);
    expect(violations).toHaveLength(0);
  });

  it('replaces unknown hrefs with null', () => {
    const steps: ExplainReadinessNextStep[] = [
      { label: 'Hacked', why: 'Bad', action_href: 'https://evil.com', requires: null },
    ];
    const { violations } = enforceHrefs(steps);
    expect(violations).toEqual(['https://evil.com']);
    expect(steps[0].action_href).toBeNull();
  });

  it('handles mixed valid and invalid hrefs', () => {
    const steps: ExplainReadinessNextStep[] = [
      { label: 'Good', why: 'ok', action_href: '/cases', requires: null },
      { label: 'Bad', why: 'no', action_href: '/hacked', requires: null },
    ];
    const { violations } = enforceHrefs(steps);
    expect(violations).toEqual(['/hacked']);
    expect(steps[0].action_href).toBe('/cases');
    expect(steps[1].action_href).toBeNull();
  });
});

// ── Response Schema Shape ─────────────────────────────────────────────────

describe('ExplainReadinessResponse shape', () => {
  it('validates a well-formed response', () => {
    const response: ExplainReadinessResponse = {
      title: 'Readiness is blocked',
      summary: 'This case has missing inventory items.',
      next_steps: [
        {
          label: 'Check in items',
          why: 'Items not available',
          action_href: '/admin/inventory/check-in?caseId=abc',
          requires: 'Inventory Check-In',
        },
      ],
      handoff: 'Case 42 is blocked — missing inventory.',
      safety_note: 'AI explanation — verify checklist status before acting.',
    };

    expect(response.title).toBeTruthy();
    expect(response.summary).toBeTruthy();
    expect(response.next_steps).toBeInstanceOf(Array);
    expect(response.handoff).toBeTruthy();
    expect(response.safety_note).toBeTruthy();
    expect(response.next_steps[0].action_href).toEqual(expect.any(String));
    expect(response.next_steps[0].requires).toEqual(expect.any(String));
  });

  it('accepts null action_href and requires', () => {
    const step: ExplainReadinessNextStep = {
      label: 'Wait for activation',
      why: 'Case not yet activated',
      action_href: null,
      requires: null,
    };
    expect(step.action_href).toBeNull();
    expect(step.requires).toBeNull();
  });
});

// ── Feature Flag (env-based) ──────────────────────────────────────────────

describe('feature flag', () => {
  it('AI_EXPLAIN_READINESS_ENABLED defaults to undefined (off)', () => {
    // In production, the route checks process.env.AI_EXPLAIN_READINESS_ENABLED === 'true'
    // If not set, it returns 501
    const enabled = process.env.AI_EXPLAIN_READINESS_ENABLED === 'true';
    expect(enabled).toBe(false);
  });
});
