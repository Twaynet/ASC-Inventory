'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getHealthSummary } from '@/lib/api/platform-facility-view';
import type { OperationsHealthSummary } from '@/lib/api/operations';
import { useFacilityContext } from './useFacilityContext';

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

const SECTIONS = [
  {
    label: 'Operations',
    cards: [
      { path: '/platform/facility-view/operations-health', title: 'Operations Health', desc: 'Drill into missing, financial, and device metrics' },
    ],
  },
  {
    label: 'Governance',
    cards: [
      { path: '/platform/facility-view/reports', title: 'Reports', desc: 'Dashboards, analytics, and printable reports' },
    ],
  },
];

function FacilityViewContent() {
  const { token } = useAuth();
  const { facilityId, buildHref } = useFacilityContext();
  const [health, setHealth] = useState<OperationsHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const range = defaultDateRange();

  const loadHealth = useCallback(async () => {
    if (!token || !facilityId) { setLoading(false); return; }
    try {
      const result = await getHealthSummary(token, facilityId, {
        start: new Date(range.start + 'T00:00:00Z').toISOString(),
        end: new Date(range.end + 'T23:59:59Z').toISOString(),
      });
      setHealth(result);
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, [token, facilityId, range.start, range.end]);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  if (!facilityId) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <div className="bg-surface-secondary rounded-lg border border-border p-8 text-center text-text-muted">
          Select a facility above to view operational data.
        </div>
      </main>
    );
  }

  const printPacketHref = buildHref('/platform/facility-view/print/operations-weekly', { start: range.start, end: range.end });

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Key Signals Strip */}
      <div className="bg-surface-primary rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Key Signals — Last 30 Days</h2>
          <Link href={printPacketHref} className="btn btn-secondary btn-sm">
            Print Weekly Packet
          </Link>
        </div>
        {loading ? (
          <div className="text-text-muted text-sm py-2">Loading...</div>
        ) : health ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SignalCard label="Open Missing" value={health.missing.openCount} />
            <SignalCard
              label="> 7 Days"
              value={health.missing.over7Days}
              color={health.missing.over7Days > 0 ? 'orange' : undefined}
            />
            <SignalCard
              label="> 30 Days"
              value={health.missing.over30Days}
              color={health.missing.over30Days > 0 ? 'red' : undefined}
            />
            <SignalCard
              label="Resolution Rate"
              value={`${health.missing.resolutionRate30d}%`}
              color={health.missing.resolutionRate30d < 70 ? 'orange' : undefined}
            />
            <SignalCard
              label="Device Errors (7d)"
              value={health.devices.errorEvents7d}
              color={health.devices.errorEvents7d > 0 ? 'orange' : undefined}
            />
            <SignalCard label="Completed" value={health.cases.completed30d} />
          </div>
        ) : (
          <div className="text-text-muted text-sm py-2">Unable to load health summary.</div>
        )}
        {health && (
          <div className="flex gap-4 mt-3 text-xs text-text-muted">
            <span>Overrides: {health.financial.overrideCount30d}</span>
            <span>Gratis: {health.financial.gratisCount30d}</span>
            <span>Canceled: {health.cases.canceled30d}</span>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">{section.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {section.cards.map((card) => (
              <Link
                key={card.path}
                href={buildHref(card.path)}
                className="block bg-surface-primary rounded-lg border border-border p-4 hover:border-accent hover:shadow-sm transition-all no-underline group"
              >
                <h3 className="text-sm font-semibold text-text-primary mb-1 group-hover:text-accent transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-text-muted leading-relaxed mb-2">{card.desc}</p>
                <span className="text-xs text-accent font-medium group-hover:underline">Open &rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}

function SignalCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: 'red' | 'orange';
}) {
  const colorClass =
    color === 'red'
      ? 'text-[var(--color-red)]'
      : color === 'orange'
        ? 'text-[var(--color-orange)]'
        : 'text-text-primary';

  return (
    <div className="bg-surface-secondary rounded-lg p-3 text-center">
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-[0.65rem] text-text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export default function FacilityViewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <FacilityViewContent />
    </Suspense>
  );
}
