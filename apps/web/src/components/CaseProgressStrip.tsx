/**
 * Case Progress Strip
 *
 * Read-only horizontal progression indicator for the Case Dashboard.
 * Derives the current phase from existing data — no backend state machine.
 *
 * Mapping logic:
 *   Scheduled  — status=SCHEDULED, readiness is BLOCKED or UNKNOWN
 *   Ready      — status=SCHEDULED, readiness is READY (GREEN, no blockers)
 *   In OR      — isActive=true OR timeout/debrief started
 *   Completed  — debrief completed (or checklists disabled + attestation)
 *   Cancelled  — status=CANCELLED or REJECTED
 */

import { type CaseDashboardData, type CaseChecklistsResponse } from '@/lib/api';
import { computeReadinessSummary } from '@/lib/readiness/summary';

export type CasePhase = 'requested' | 'scheduled' | 'ready' | 'in-or' | 'completed' | 'cancelled';

const PHASES: { key: CasePhase; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ready', label: 'Ready' },
  { key: 'in-or', label: 'In OR' },
  { key: 'completed', label: 'Completed' },
];

const NEXT_STEP: Record<CasePhase, string> = {
  requested: 'Case needs approval before scheduling.',
  scheduled: 'Resolve blockers to mark this case ready.',
  ready: 'Waiting for OR activation.',
  'in-or': 'Complete Timeout and Debrief to finish.',
  completed: 'All steps complete.',
  cancelled: 'This case has been cancelled.',
};

export function deriveCasePhase(
  dashboard: CaseDashboardData,
  checklists: CaseChecklistsResponse | null,
): CasePhase {
  // Terminal states
  if (dashboard.status === 'CANCELLED' || dashboard.status === 'REJECTED') {
    return 'cancelled';
  }

  if (dashboard.status === 'REQUESTED') {
    return 'requested';
  }

  const timeoutStatus = checklists?.timeout?.status ?? null;
  const debriefStatus = checklists?.debrief?.status ?? null;

  // Completed: debrief done, or checklists disabled + attested
  if (debriefStatus === 'COMPLETED') {
    return 'completed';
  }
  if (!checklists?.featureEnabled && dashboard.attestationState === 'ATTESTED') {
    return 'completed';
  }

  // In OR: case is active or any checklist work has started
  if (
    dashboard.isActive ||
    timeoutStatus === 'IN_PROGRESS' ||
    timeoutStatus === 'COMPLETED' ||
    debriefStatus === 'IN_PROGRESS'
  ) {
    return 'in-or';
  }

  // Ready vs Scheduled: use readiness summary
  const readiness = computeReadinessSummary({
    caseId: dashboard.caseId,
    readinessState: dashboard.readinessState as 'GREEN' | 'ORANGE' | 'RED' | undefined,
    missingItems: dashboard.missingItems,
    status: dashboard.status,
    isActive: dashboard.isActive,
    orRoom: dashboard.orRoom,
    scheduledDate: dashboard.scheduledDate,
    timeoutStatus,
    debriefStatus,
  });

  if (readiness.overall === 'READY') {
    return 'ready';
  }

  return 'scheduled';
}

interface CaseProgressStripProps {
  dashboard: CaseDashboardData;
  checklists: CaseChecklistsResponse | null;
}

export function CaseProgressStrip({ dashboard, checklists }: CaseProgressStripProps) {
  const phase = deriveCasePhase(dashboard, checklists);

  // For cancelled/requested, show a simple message instead of the strip
  if (phase === 'cancelled' || phase === 'requested') {
    return (
      <div style={{
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        borderRadius: '8px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
      }}>
        {NEXT_STEP[phase]}
      </div>
    );
  }

  const currentIdx = PHASES.findIndex(p => p.key === phase);

  return (
    <div style={{
      padding: '1rem',
      marginBottom: '1rem',
      borderRadius: '8px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      {/* Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        marginBottom: '0.5rem',
      }}>
        {/* Connecting line */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '24px',
          right: '24px',
          height: '2px',
          background: 'var(--border)',
          transform: 'translateY(-50%)',
          zIndex: 0,
        }} />
        {/* Progress fill */}
        {currentIdx > 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '24px',
            width: `${(currentIdx / (PHASES.length - 1)) * 100}%`,
            maxWidth: 'calc(100% - 48px)',
            height: '2px',
            background: 'var(--color-accent)',
            transform: 'translateY(-50%)',
            zIndex: 1,
          }} />
        )}

        {PHASES.map((p, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={p.key} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 2,
              flex: '0 0 auto',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: isPast ? '#3182ce'
                  : isCurrent ? '#3182ce'
                  : 'var(--surface-primary)',
                border: isFuture ? '2px solid var(--border-default)' : '2px solid var(--color-accent)',
                color: (isPast || isCurrent) ? 'var(--text-on-primary)' : 'var(--text-muted)',
              }}>
                {isPast ? '✓' : idx + 1}
              </div>
              <span style={{
                marginTop: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--color-accent)' : isFuture ? 'var(--text-muted)' : 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Next step label */}
      <div style={{
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {NEXT_STEP[phase]}
      </div>
    </div>
  );
}
