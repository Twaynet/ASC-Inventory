import { describe, it, expect } from 'vitest';
import { computeReadinessSummary, readinessFromState } from '../src/lib/readiness/summary';

describe('computeReadinessSummary', () => {
  const base = { caseId: 'case-1', isActive: true, orRoom: 'OR-1', scheduledDate: '2025-01-15' };

  it('returns READY when GREEN, no missing items, checklists complete', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      missingItems: [],
      timeoutStatus: 'COMPLETED',
      debriefStatus: 'COMPLETED',
    });
    expect(result.overall).toBe('READY');
    expect(result.blockers).toHaveLength(0);
  });

  it('returns UNKNOWN when readinessState is undefined', () => {
    const result = computeReadinessSummary({ ...base, readinessState: undefined });
    expect(result.overall).toBe('UNKNOWN');
    expect(result.blockers).toHaveLength(0);
  });

  it('returns UNKNOWN when readinessState is null', () => {
    const result = computeReadinessSummary({ ...base, readinessState: null });
    expect(result.overall).toBe('UNKNOWN');
  });

  it('returns BLOCKED with INVENTORY_MISSING when RED + missing items', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'RED',
      missingItems: [{ catalogId: 'c1', catalogName: 'Scalpel', requiredQuantity: 2, availableQuantity: 0, reason: 'Not checked in' }],
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'INVENTORY_MISSING')).toBe(true);
  });

  it('returns BLOCKED with VERIFICATION_REQUIRED when ORANGE + no missing items', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'ORANGE',
      missingItems: [],
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'VERIFICATION_REQUIRED')).toBe(true);
  });

  it('returns BLOCKED with TIMEOUT_INCOMPLETE when timeout not completed', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      timeoutStatus: 'IN_PROGRESS',
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'TIMEOUT_INCOMPLETE')).toBe(true);
  });

  it('returns BLOCKED with DEBRIEF_INCOMPLETE when timeout done but debrief not', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      timeoutStatus: 'COMPLETED',
      debriefStatus: 'IN_PROGRESS',
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'DEBRIEF_INCOMPLETE')).toBe(true);
  });

  it('does not add DEBRIEF_INCOMPLETE when timeout is not completed', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      timeoutStatus: 'IN_PROGRESS',
      debriefStatus: 'NOT_STARTED',
    });
    expect(result.blockers.some(b => b.code === 'DEBRIEF_INCOMPLETE')).toBe(false);
  });

  it('returns BLOCKED with APPROVAL_REQUIRED when status is REQUESTED', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      status: 'REQUESTED',
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'APPROVAL_REQUIRED')).toBe(true);
  });

  it('returns BLOCKED with ROOM_UNASSIGNED when orRoom is null and active', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      orRoom: null,
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.some(b => b.code === 'ROOM_UNASSIGNED')).toBe(true);
  });

  it('does not add ROOM_UNASSIGNED when inactive', () => {
    const result = computeReadinessSummary({
      ...base,
      readinessState: 'GREEN',
      orRoom: null,
      isActive: false,
    });
    expect(result.blockers.some(b => b.code === 'ROOM_UNASSIGNED')).toBe(false);
  });

  it('accumulates multiple blockers', () => {
    const result = computeReadinessSummary({
      caseId: 'case-1',
      readinessState: 'RED',
      missingItems: [{ catalogId: 'c1', catalogName: 'X', requiredQuantity: 1, availableQuantity: 0, reason: 'missing' }],
      status: 'REQUESTED',
      isActive: true,
      orRoom: null,
      scheduledDate: '2025-01-15',
      timeoutStatus: 'NOT_STARTED',
    });
    expect(result.overall).toBe('BLOCKED');
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
    const codes = result.blockers.map(b => b.code);
    expect(codes).toContain('APPROVAL_REQUIRED');
    expect(codes).toContain('ROOM_UNASSIGNED');
    expect(codes).toContain('INVENTORY_MISSING');
  });
});

describe('readinessFromState', () => {
  it('GREEN → READY', () => expect(readinessFromState('GREEN')).toBe('READY'));
  it('ORANGE → BLOCKED', () => expect(readinessFromState('ORANGE')).toBe('BLOCKED'));
  it('RED → BLOCKED', () => expect(readinessFromState('RED')).toBe('BLOCKED'));
  it('null → UNKNOWN', () => expect(readinessFromState(null)).toBe('UNKNOWN'));
  it('undefined → UNKNOWN', () => expect(readinessFromState(undefined)).toBe('UNKNOWN'));
});
