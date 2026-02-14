'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getOperationsHealthSummary, type OperationsHealthSummary } from '@/lib/api/operations';

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
      { href: '/admin/cases', title: 'Cases', desc: 'Manage surgical cases and scheduling' },
      { href: '/admin/surgery-requests', title: 'Surgery Requests', desc: 'Review and approve incoming requests' },
      { href: '/admin/pending-reviews', title: 'Pending Reviews', desc: 'Checklists awaiting sign-off' },
      { href: '/admin/operations-health', title: 'Operations Health', desc: 'Drill into missing, financial, and device metrics' },
      { href: '/admin/financial-readiness', title: 'Financial Readiness', desc: 'Case-level cost verification status' },
    ],
  },
  {
    label: 'Inventory',
    cards: [
      { href: '/admin/inventory', title: 'Inventory', desc: 'Browse and manage inventory items' },
      { href: '/admin/catalog', title: 'Catalog', desc: 'Product catalog and pricing' },
      { href: '/admin/vendors', title: 'Vendors', desc: 'Vendor contacts and contracts' },
      { href: '/admin/loaner-sets', title: 'Loaner Sets', desc: 'Track loaner sets and returns' },
      { href: '/admin/devices', title: 'Devices', desc: 'Scanners and device configuration' },
      { href: '/preference-cards', title: 'Preference Cards', desc: 'Surgeon preference card templates' },
      { href: '/admin/inventory/risk-queue', title: 'Risk Queue', desc: 'Expiring and at-risk inventory' },
    ],
  },
  {
    label: 'Governance',
    cards: [
      { href: '/admin/reports', title: 'Reports', desc: 'Dashboards, analytics, and printable reports' },
      { href: '/admin/phi-audit', title: 'PHI Audit', desc: 'Protected health information access log' },
    ],
  },
  {
    label: 'Setup',
    cards: [
      { href: '/admin/users', title: 'Users', desc: 'User accounts and role assignments' },
      { href: '/admin/locations', title: 'Locations', desc: 'Storage locations and rooms' },
      { href: '/admin/general-settings', title: 'Settings', desc: 'Facility configuration and preferences' },
    ],
  },
];

export default function AdminHomePage() {
  const { token } = useAuth();
  const { hasCapability } = useAccessControl();
  const [health, setHealth] = useState<OperationsHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const range = defaultDateRange();

  const loadHealth = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getOperationsHealthSummary(token, {
        start: new Date(range.start + 'T00:00:00Z').toISOString(),
        end: new Date(range.end + 'T23:59:59Z').toISOString(),
      });
      setHealth(result);
    } catch {
      // Silently degrade — signals strip just won't show
    } finally {
      setLoading(false);
    }
  }, [token, range.start, range.end]);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  if (!hasCapability('INVENTORY_MANAGE')) {
    return (
      <>
        <Header title="Admin Home" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  const printPacketHref = `/admin/print/operations-weekly?start=${range.start}&end=${range.end}`;

  return (
    <>
      <Header title="Admin Home" />
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
                  key={card.href}
                  href={card.href}
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
    </>
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
