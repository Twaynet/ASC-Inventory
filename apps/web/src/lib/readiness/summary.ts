/**
 * Readiness Summary Model
 *
 * Deterministic mapping from existing case + readiness data to a unified
 * ReadinessSummary with typed blockers and action links.
 *
 * Terminology (consistent everywhere):
 *   - "Readiness" / "Ready" / "Blocked" / "Unknown" / "Blocker(s)"
 */

export interface Blocker {
  code: string;
  label: string;
  severity: 'warning' | 'critical';
  actionLabel: string;
  href: string;
  capability?: string;
}

export interface ReadinessSummary {
  overall: 'READY' | 'BLOCKED' | 'UNKNOWN';
  blockers: Blocker[];
}

export interface ReadinessSummaryInput {
  caseId: string;
  readinessState?: 'GREEN' | 'ORANGE' | 'RED' | null;
  missingItems?: { catalogId: string; catalogName: string; requiredQuantity: number; availableQuantity: number; reason: string }[];
  status?: string;
  isActive?: boolean;
  orRoom?: string | null;
  scheduledDate?: string | null;
  timeoutStatus?: string | null;
  debriefStatus?: string | null;
}

export function computeReadinessSummary(input: ReadinessSummaryInput): ReadinessSummary {
  const { caseId, readinessState, missingItems, status, isActive, orRoom, scheduledDate, timeoutStatus, debriefStatus } = input;

  // If readiness state is unknown, return UNKNOWN
  if (readinessState === undefined || readinessState === null) {
    return { overall: 'UNKNOWN', blockers: [] };
  }

  const blockers: Blocker[] = [];

  // Scheduling-level blockers
  if (status === 'REQUESTED') {
    blockers.push({
      code: 'APPROVAL_REQUIRED',
      label: 'Case needs approval',
      severity: 'critical',
      actionLabel: 'Review Case',
      href: '/cases',
      capability: 'CASE_APPROVE',
    });
  }

  if (orRoom == null && isActive) {
    const dateParam = scheduledDate ? `&date=${scheduledDate}` : '';
    blockers.push({
      code: 'ROOM_UNASSIGNED',
      label: 'No room assigned',
      severity: 'warning',
      actionLabel: 'Assign Room',
      href: `/calendar?view=day${dateParam}`,
      capability: 'CASE_ASSIGN_ROOM',
    });
  }

  // Inventory / verification blockers
  if (readinessState !== 'GREEN' && missingItems && missingItems.length > 0) {
    blockers.push({
      code: 'INVENTORY_MISSING',
      label: 'Missing inventory items',
      severity: 'critical',
      actionLabel: 'Check-In Items',
      href: `/admin/inventory/check-in?caseId=${caseId}`,
      capability: 'INVENTORY_CHECKIN',
    });
  }

  if (readinessState === 'ORANGE' && (!missingItems || missingItems.length === 0)) {
    blockers.push({
      code: 'VERIFICATION_REQUIRED',
      label: 'Verification incomplete',
      severity: 'warning',
      actionLabel: 'Verify Items',
      href: `/case/${caseId}/verify`,
      capability: 'VERIFY_SCAN',
    });
  }

  // Checklist blockers (only relevant for active cases)
  if (isActive) {
    if (timeoutStatus != null && timeoutStatus !== 'COMPLETED') {
      blockers.push({
        code: 'TIMEOUT_INCOMPLETE',
        label: 'Timeout not completed',
        severity: 'warning',
        actionLabel: 'Start Timeout',
        href: `/or/timeout/${caseId}`,
        capability: 'OR_TIMEOUT',
      });
    }

    if (debriefStatus != null && debriefStatus !== 'COMPLETED' && timeoutStatus === 'COMPLETED') {
      blockers.push({
        code: 'DEBRIEF_INCOMPLETE',
        label: 'Debrief not completed',
        severity: 'warning',
        actionLabel: 'Start Debrief',
        href: `/or/debrief/${caseId}`,
        capability: 'OR_DEBRIEF',
      });
    }
  }

  return {
    overall: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers,
  };
}

/**
 * Derive a ReadinessSummary from just readinessState (for list views that
 * don't have detailed blocker data). Returns READY/BLOCKED/UNKNOWN with
 * no specific blockers — just the overall signal.
 */
export function readinessFromState(state?: 'GREEN' | 'ORANGE' | 'RED' | null): ReadinessSummary['overall'] {
  if (state === undefined || state === null) return 'UNKNOWN';
  return state === 'GREEN' ? 'READY' : 'BLOCKED';
}
