/**
 * Compact readiness badge for schedule views and case lists.
 *
 * Terminology: "Ready" / "Blocked" / "Unknown"
 */

interface ReadinessBadgeProps {
  overall: 'READY' | 'BLOCKED' | 'UNKNOWN';
  topBlockerLabel?: string;
  size?: 'sm' | 'md';
}

const BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  READY:   { bg: 'var(--color-green-bg)', color: 'var(--color-green-700)', label: 'Ready' },
  BLOCKED: { bg: 'var(--color-orange-bg)', color: 'var(--color-orange-700)', label: 'Blocked' },
  UNKNOWN: { bg: 'var(--color-gray-200)', color: 'var(--text-muted)', label: 'Unknown' },
};

export function ReadinessBadge({ overall, topBlockerLabel, size = 'sm' }: ReadinessBadgeProps) {
  const badge = BADGE_STYLES[overall] || BADGE_STYLES.UNKNOWN;
  const fontSize = size === 'sm' ? '0.7rem' : '0.8rem';
  const padding = size === 'sm' ? '0.15rem 0.4rem' : '0.25rem 0.5rem';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{
        display: 'inline-block',
        padding,
        borderRadius: '4px',
        fontSize,
        fontWeight: 600,
        background: badge.bg,
        color: badge.color,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}>
        {badge.label}
      </span>
      {topBlockerLabel && overall === 'BLOCKED' && (
        <span style={{
          fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
          color: 'var(--color-orange-700)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '150px',
        }}>
          {topBlockerLabel}
        </span>
      )}
    </span>
  );
}
