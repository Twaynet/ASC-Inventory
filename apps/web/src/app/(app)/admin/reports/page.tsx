'use client';

import Link from 'next/link';
import { useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';

interface ReportCard {
  title: string;
  description: string;
  href: string;
  tags: { label: string; variant: 'window' | 'audience' }[];
}

const REPORT_CARDS: ReportCard[] = [
  {
    title: 'Operations Health',
    description:
      'Executive cockpit summarizing missing inventory, financial integrity, device stability, and case throughput.',
    href: '/admin/operations-health',
    tags: [
      { label: '30d', variant: 'window' },
      { label: 'Admin', variant: 'audience' },
      { label: 'CFO', variant: 'audience' },
    ],
  },
  {
    title: 'Missing Analytics',
    description:
      'Trend and drivers for missing/found activity by location, catalog, surgeon, and staff with drill-down.',
    href: '/admin/inventory/missing-analytics',
    tags: [
      { label: '30d', variant: 'window' },
      { label: 'Admin', variant: 'audience' },
    ],
  },
  {
    title: 'Open Missing Aging',
    description:
      'Current queue of missing items ranked by days missing. Close the loop with Mark Found.',
    href: '/admin/inventory/open-missing-aging',
    tags: [
      { label: 'Snapshot', variant: 'window' },
      { label: 'Admin', variant: 'audience' },
    ],
  },
  {
    title: 'Financial Ledger',
    description:
      'Read-only ledger of financial inventory events including cost overrides, vendor attribution, and gratis items.',
    href: '/admin/inventory/financial-ledger',
    tags: [
      { label: '30d', variant: 'window' },
      { label: 'CFO', variant: 'audience' },
    ],
  },
  {
    title: 'Device Events / Errors',
    description:
      'Raw scan and device log for troubleshooting barcode workflows and identifying device errors.',
    href: '/admin/devices/events',
    tags: [
      { label: '7d', variant: 'window' },
      { label: 'Admin', variant: 'audience' },
    ],
  },
  {
    title: 'Print Center',
    description:
      'Printable weekly packet and individual reports formatted for meetings and compliance binders.',
    href: '/admin/print',
    tags: [
      { label: 'Admin', variant: 'audience' },
      { label: 'Clinical', variant: 'audience' },
    ],
  },
  {
    title: 'Standard Reports',
    description:
      'Inventory readiness, verification activity, checklist compliance, case summary, vendor concessions, and more with CSV export.',
    href: '/admin/reports/standard',
    tags: [
      { label: '7d', variant: 'window' },
      { label: 'Admin', variant: 'audience' },
      { label: 'Clinical', variant: 'audience' },
    ],
  },
];

function TagBadge({ label, variant }: { label: string; variant: 'window' | 'audience' }) {
  const cls =
    variant === 'window'
      ? 'bg-[var(--color-blue-100)] text-[var(--color-blue-600)]'
      : 'bg-surface-tertiary text-text-muted';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[0.65rem] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function ReportsHubPage() {
  const { hasCapability } = useAccessControl();

  if (!hasCapability('INVENTORY_MANAGE')) {
    return (
      <>
        <Header title="Reports" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Reports" />
      <main className="p-6 max-w-6xl mx-auto">
        <p className="text-text-secondary text-sm mb-6">
          Dashboards, analytics, and printable reports for operations review.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block bg-surface-primary rounded-lg border border-border p-5 hover:border-accent hover:shadow-md transition-all no-underline group"
            >
              <h3 className="text-base font-semibold text-text-primary mb-2 group-hover:text-accent transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                {card.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {card.tags.map((tag) => (
                  <TagBadge key={tag.label} label={tag.label} variant={tag.variant} />
                ))}
              </div>
              <span className="text-xs text-accent font-medium group-hover:underline">
                Open &rarr;
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
