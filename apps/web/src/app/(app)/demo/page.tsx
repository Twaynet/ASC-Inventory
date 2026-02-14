'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { DemoExpiryBanner } from '@/app/components/DemoExpiryBanner';
import { getOperationsHealthSummary, type OperationsHealthSummary } from '@/lib/api/operations';
import { getOpenMissingAgingTrend, type CurrentlyOpenItem } from '@/lib/api/admin-onboarding';

export default function SignalBoardPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [health, setHealth] = useState<OperationsHealthSummary | null>(null);
  const [openItems, setOpenItems] = useState<CurrentlyOpenItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isDemo = user?.isDemo === true;
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const [healthData, trendData] = await Promise.all([
          getOperationsHealthSummary(token!),
          getOpenMissingAgingTrend(token!).catch(() => null),
        ]);
        if (cancelled) return;
        setHealth(healthData);
        if (trendData) {
          setOpenItems(trendData.currentlyOpen);
        }
      } catch {
        // Non-critical — cards show "--" on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [token]);

  if (isLoading || !user) {
    return <div className="loading"><p>Loading...</p></div>;
  }

  const facilityLabel = user.facilityName + (isDemo ? ' (DEMO)' : '');

  // Derive card metrics
  const openMissingCount = health?.missing.openCount ?? null;
  const oldestDays = openItems.length > 0
    ? Math.max(...openItems.map(i => i.daysOpen))
    : null;
  const overrideCount = health?.financial.overrideCount30d ?? null;
  const gratisCount = health?.financial.gratisCount30d ?? null;
  const completedCases = health?.cases.completed30d ?? null;
  const canceledCases = health?.cases.canceled30d ?? null;
  const totalScans = health?.devices.totalEvents7d ?? null;
  const scanErrors = health?.devices.errorEvents7d ?? null;

  return (
    <>
      <Header title="Signal Board" />

      <main className="container-full" style={{ padding: '1.5rem' }}>
        {/* DEMO Banner */}
        {isDemo && (
          <div className="bg-surface-secondary border border-border rounded-md px-4 py-2 mb-4 text-sm text-text-secondary">
            DEMO ENVIRONMENT — Data resets nightly.
          </div>
        )}

        {/* Expiry Warning Banner */}
        <DemoExpiryBanner demoExpiresAt={user.demoExpiresAt} isDemo={isDemo} />

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary m-0">{facilityLabel}</h1>
          <p className="text-sm text-text-muted mt-1 mb-0">Live Operational Snapshot</p>
        </div>

        {/* Signal Cards Grid */}
        {loading ? (
          <div className="text-text-muted text-sm">Loading signals...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Admin Card — only for ADMIN role */}
            {isAdmin && (
              <SignalCard
                label="Admin"
                metric={openMissingCount !== null ? String(openMissingCount) : '--'}
                metricLabel="Open Missing"
                context={
                  oldestDays !== null && oldestDays > 0
                    ? `Oldest open: ${oldestDays} day${oldestDays !== 1 ? 's' : ''}`
                    : 'No open items'
                }
                onClick={() => router.push('/admin/onboarding/open-missing-aging')}
              />
            )}

            {/* CFO Card */}
            <SignalCard
              label="CFO"
              metric={overrideCount !== null ? String(overrideCount) : '--'}
              metricLabel="Overrides (30d)"
              context={
                gratisCount !== null
                  ? `${gratisCount} gratis item${gratisCount !== 1 ? 's' : ''}`
                  : 'Financial data'
              }
              onClick={() => router.push('/admin/reports')}
            />

            {/* Surgeon Card */}
            <SignalCard
              label="Surgeon"
              metric={completedCases !== null ? String(completedCases) : '--'}
              metricLabel="Completed (30d)"
              context={
                canceledCases !== null
                  ? `${canceledCases} canceled`
                  : 'View case readiness'
              }
              onClick={() => router.push('/cases')}
            />

            {/* Tech Card */}
            <SignalCard
              label="Tech"
              metric={totalScans !== null ? String(totalScans) : '--'}
              metricLabel="Device Events (7d)"
              context={
                scanErrors !== null
                  ? `${scanErrors} error${scanErrors !== 1 ? 's' : ''}`
                  : 'View scanner activity'
              }
              onClick={() => router.push('/admin/inventory')}
            />
          </div>
        )}
      </main>
    </>
  );
}

// ─── Signal Card ───────────────────────────────────────────────

interface SignalCardProps {
  label: string;
  metric: string;
  metricLabel: string;
  context: string;
  onClick: () => void;
}

function SignalCard({ label, metric, metricLabel, context, onClick }: SignalCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="bg-surface-primary border border-border rounded-lg p-5 cursor-pointer transition-all hover:border-[var(--color-blue-500)] hover:shadow-sm"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">
        {label}
      </div>
      <div className="text-3xl font-bold text-text-primary leading-none mb-1">
        {metric}
      </div>
      <div className="text-sm text-text-secondary mb-2">
        {metricLabel}
      </div>
      <div className="text-xs text-text-muted">
        {context}
      </div>
    </div>
  );
}
