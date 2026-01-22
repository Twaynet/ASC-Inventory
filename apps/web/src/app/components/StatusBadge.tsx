'use client';

/**
 * Standard case/item status values used across the application.
 */
export type CaseStatus =
  | 'REQUESTED'
  | 'SCHEDULED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'INACTIVE';

/**
 * Readiness status for inventory/preparation checks.
 */
export type ReadinessStatus = 'green' | 'orange' | 'red';

interface StatusBadgeProps {
  /** The status to display */
  status: CaseStatus | string;
  /** Optional custom label (defaults to formatted status) */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional CSS class */
  className?: string;
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  // Case workflow statuses
  REQUESTED: { background: '#dbeafe', color: '#1e40af' },
  SCHEDULED: { background: '#d1fae5', color: '#065f46' },
  READY: { background: '#fef3c7', color: '#92400e' },
  IN_PROGRESS: { background: '#e0e7ff', color: '#3730a3' },
  COMPLETED: { background: '#d1d5db', color: '#1f2937' },
  REJECTED: { background: '#fee2e2', color: '#991b1b' },
  CANCELLED: { background: '#f3f4f6', color: '#6b7280' },
  // Approval statuses
  PENDING: { background: '#fef3c7', color: '#92400e' },
  APPROVED: { background: '#d1fae5', color: '#065f46' },
  // Active/Inactive
  ACTIVE: { background: '#d1fae5', color: '#065f46' },
  INACTIVE: { background: '#f3f4f6', color: '#6b7280' },
};

const DEFAULT_STYLE = { background: '#f3f4f6', color: '#6b7280' };

/**
 * Formats a status string for display (e.g., 'IN_PROGRESS' -> 'In Progress')
 */
export function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Type-safe status badge component with consistent styling.
 *
 * @example
 * ```tsx
 * <StatusBadge status="SCHEDULED" />
 * <StatusBadge status="IN_PROGRESS" size="sm" />
 * <StatusBadge status={case.status} label="Custom Label" />
 * ```
 */
export function StatusBadge({
  status,
  label,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const normalizedStatus = status.toUpperCase().replace(/-/g, '_');
  const style = STATUS_STYLES[normalizedStatus] || DEFAULT_STYLE;
  const displayLabel = label || formatStatusLabel(status);

  const sizeStyles = {
    sm: { padding: '0.125rem 0.5rem', fontSize: '0.75rem' },
    md: { padding: '0.25rem 0.75rem', fontSize: '0.875rem' },
  };

  return (
    <span
      className={`status-badge ${className}`}
      style={{
        display: 'inline-block',
        borderRadius: '9999px',
        fontWeight: 500,
        background: style.background,
        color: style.color,
        ...sizeStyles[size],
      }}
    >
      {displayLabel}
    </span>
  );
}

interface ReadinessBadgeProps {
  /** Readiness level */
  status: ReadinessStatus;
  /** Optional custom label */
  label?: string;
  /** Additional CSS class */
  className?: string;
}

const READINESS_STYLES: Record<ReadinessStatus, { background: string; color: string }> = {
  green: { background: '#dcfce7', color: '#22c55e' },
  orange: { background: '#ffedd5', color: '#f97316' },
  red: { background: '#fee2e2', color: '#ef4444' },
};

const READINESS_LABELS: Record<ReadinessStatus, string> = {
  green: 'Ready',
  orange: 'Partial',
  red: 'Not Ready',
};

/**
 * Readiness badge for inventory/preparation status.
 *
 * @example
 * ```tsx
 * <ReadinessBadge status="green" />
 * <ReadinessBadge status="orange" label="Missing Items" />
 * ```
 */
export function ReadinessBadge({
  status,
  label,
  className = '',
}: ReadinessBadgeProps) {
  const style = READINESS_STYLES[status];
  const displayLabel = label || READINESS_LABELS[status];

  return (
    <span
      className={`readiness-badge ${status} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        fontWeight: 600,
        fontSize: '0.875rem',
        background: style.background,
        color: style.color,
      }}
    >
      {displayLabel}
    </span>
  );
}
