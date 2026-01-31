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
  READY:   { bg: '#c6f6d5', color: '#276749', label: 'Ready' },
  BLOCKED: { bg: '#fefcbf', color: '#975a16', label: 'Blocked' },
  UNKNOWN: { bg: '#e2e8f0', color: '#718096', label: 'Unknown' },
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
          color: '#975a16',
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
