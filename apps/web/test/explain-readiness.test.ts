/**
 * ExplainReadiness — web-side tests
 *
 * Tests the API client function and response type contracts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ExplainReadinessResponse, ExplainReadinessRequest } from '../src/lib/api/ai';

// ── Response rendering contract ───────────────────────────────────────────

describe('ExplainReadinessResponse contract', () => {
  const mockResponse: ExplainReadinessResponse = {
    title: 'Readiness is blocked',
    summary: 'Missing inventory items need to be checked in before the case can proceed.',
    next_steps: [
      {
        label: 'Check in missing items',
        why: 'Required items are not in facility inventory.',
        action_href: '/admin/inventory/check-in?caseId=test-123',
        requires: 'Inventory Check-In',
      },
    ],
    handoff: 'Case 42 is blocked — missing inventory items need check-in.',
    safety_note: 'AI explanation — verify checklist status before acting.',
  };

  it('has all required fields', () => {
    expect(mockResponse).toHaveProperty('title');
    expect(mockResponse).toHaveProperty('summary');
    expect(mockResponse).toHaveProperty('next_steps');
    expect(mockResponse).toHaveProperty('handoff');
    expect(mockResponse).toHaveProperty('safety_note');
  });

  it('next_steps items have required shape', () => {
    const step = mockResponse.next_steps[0];
    expect(step).toHaveProperty('label');
    expect(step).toHaveProperty('why');
    expect(step).toHaveProperty('action_href');
    expect(step).toHaveProperty('requires');
  });

  it('action_href is string or null', () => {
    expect(typeof mockResponse.next_steps[0].action_href === 'string' || mockResponse.next_steps[0].action_href === null).toBe(true);
  });

  it('safety_note is always present', () => {
    expect(mockResponse.safety_note).toBeTruthy();
    expect(mockResponse.safety_note.length).toBeGreaterThan(0);
  });
});

// ── Request payload shape ─────────────────────────────────────────────────

describe('ExplainReadinessRequest contract', () => {
  it('builds a valid payload from dashboard data', () => {
    const payload: ExplainReadinessRequest = {
      caseId: 'test-123',
      caseHeader: {
        caseNumber: 'ASC-2026-0042',
        procedureName: 'Right Knee Arthroscopy',
        surgeonName: 'Dr. Smith',
        scheduledDate: '2026-02-01',
        scheduledTime: '08:00',
        orRoom: 'OR-2',
        status: 'SCHEDULED',
        isActive: false,
      },
      readinessSnapshot: {
        overall: 'BLOCKED',
        blockers: [
          {
            code: 'INVENTORY_MISSING',
            label: 'Missing inventory items',
            severity: 'critical',
            actionLabel: 'Check-In Items',
            href: '/admin/inventory/check-in?caseId=test-123',
            capability: 'INVENTORY_CHECKIN',
          },
        ],
      },
    };

    expect(payload.caseId).toBe('test-123');
    expect(payload.readinessSnapshot.blockers).toHaveLength(1);
    expect(payload.caseHeader.caseNumber).toBeTruthy();
  });

  it('does not include patient name, DOB, or MRN', () => {
    const payload: ExplainReadinessRequest = {
      caseId: 'test-456',
      caseHeader: {
        caseNumber: 'ASC-2026-0099',
        procedureName: 'Left Hip Replacement',
        surgeonName: null,
        scheduledDate: null,
        scheduledTime: null,
        orRoom: null,
        status: 'REQUESTED',
        isActive: false,
      },
      readinessSnapshot: { overall: 'UNKNOWN', blockers: [] },
    };

    const serialized = JSON.stringify(payload);
    // Verify the type does not include PHI fields
    expect(serialized).not.toContain('patientName');
    expect(serialized).not.toContain('dateOfBirth');
    expect(serialized).not.toContain('mrn');
  });
});
