'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function last7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function OperationsHealthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { hasCapability } = useAccessControl();

  const defaults = defaultDateRange();
  const [start, setStart] = useState(searchParams.get('start') || defaults.start);
  const [end, setEnd] = useState(searchParams.get('end') || defaults.end);
  const [data, setData] = useState<OperationsHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const updateUrl = useCallback((s: string, e: string) => {
    const params = new URLSearchParams();
    params.set('start', s);
    params.set('end', e);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOperationsHealthSummary(token, {
        start: new Date(start + 'T00:00:00Z').toISOString(),
        end: new Date(end + 'T23:59:59Z').toISOString(),
      });
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load health summary');
    } finally {
      setLoading(false);
    }
  }, [token, start, end]);

  useEffect(() => {
    loadData();
    updateUrl(start, end);
  }, [loadData, updateUrl, start, end]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build deep-link URLs with forwarded date params
  const missingAgingHref = '/admin/inventory/open-missing-aging';
  const missingAnalyticsHref = `/admin/inventory/missing-analytics?start=${start}&end=${end}&groupBy=location&resolution=BOTH`;
  const financialLedgerHref = `/admin/inventory/financial-ledger?start=${start}&end=${end}`;
  const dev7 = last7DaysRange();
  const deviceEventsHref = `/admin/devices/events?start=${dev7.start}&end=${dev7.end}`;
  const printPacketHref = `/admin/print/operations-weekly?start=${start}&end=${end}`;

  if (!hasCapability('INVENTORY_MANAGE')) {
    return (
      <>
        <Header title="Operations Health" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Operations Health" />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Controls */}
        <div className="bg-surface-primary rounded-lg border border-border p-4 flex flex-wrap items-end gap-4">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Date</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Date</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <Link href={printPacketHref} className="btn btn-secondary btn-sm">
            Print Weekly Packet
          </Link>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading && (
          <div className="text-center py-12 text-text-muted">Loading...</div>
        )}

        {data && !loading && (
          <div className="space-y-6">
            {/* Missing Health */}
            <SectionCard
              title="Missing Health"
              href={missingAgingHref}
              secondaryLinks={[
                { label: 'Analytics', href: missingAnalyticsHref },
              ]}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Open Missing" value={data.missing.openCount} />
                <MetricCard
                  label="> 7 Days"
                  value={data.missing.over7Days}
                  color={data.missing.over7Days > 0 ? 'orange' : undefined}
                />
                <MetricCard
                  label="> 30 Days"
                  value={data.missing.over30Days}
                  color={data.missing.over30Days > 0 ? 'red' : undefined}
                />
                <MetricCard
                  label="Resolution Rate (30d)"
                  value={`${data.missing.resolutionRate30d}%`}
                  color={data.missing.resolutionRate30d < 70 ? 'orange' : undefined}
                />
              </div>
            </SectionCard>

            {/* Financial Integrity */}
            <SectionCard title="Financial Integrity" href={financialLedgerHref}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Overrides (30d)" value={data.financial.overrideCount30d} />
                <MetricCard label="Gratis (30d)" value={data.financial.gratisCount30d} />
              </div>
            </SectionCard>

            {/* Device Stability */}
            <SectionCard title="Device Stability" href={deviceEventsHref}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Events (7d)" value={data.devices.totalEvents7d} />
                <MetricCard
                  label="Errors (7d)"
                  value={data.devices.errorEvents7d}
                  color={data.devices.errorEvents7d > 0 ? 'orange' : undefined}
                />
                <MetricCard
                  label="Error Rate"
                  value={`${data.devices.errorRate7d}%`}
                  color={data.devices.errorRate7d > 5 ? 'orange' : undefined}
                />
              </div>
            </SectionCard>

            {/* Case Throughput */}
            <section className="bg-surface-primary rounded-lg border border-border p-5">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Case Throughput</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Completed (30d)" value={data.cases.completed30d} />
                <MetricCard label="Canceled (30d)" value={data.cases.canceled30d} />
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function SectionCard({
  title,
  href,
  secondaryLinks,
  children,
}: {
  title: string;
  href: string;
  secondaryLinks?: { label: string; href: string }[];
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-primary rounded-lg border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-3">
          {secondaryLinks?.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-accent hover:underline"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={href}
            className="text-xs text-accent hover:underline font-medium"
          >
            Open &rarr;
          </Link>
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: 'red' | 'orange';
}) {
  const colorClass = color === 'red'
    ? 'text-[var(--color-red)]'
    : color === 'orange'
      ? 'text-[var(--color-orange)]'
      : 'text-text-primary';

  return (
    <div className="bg-surface-secondary rounded-lg p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
