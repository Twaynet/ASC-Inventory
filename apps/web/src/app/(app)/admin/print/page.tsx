'use client';

import Link from 'next/link';
import { useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';

const PRINT_REPORTS = [
  {
    href: '/admin/print/operations-weekly',
    title: 'Weekly Operations Packet',
    description: 'Full briefing: health summary, missing aging, drivers, devices, and financials.',
  },
  {
    href: '/admin/print/operations-health',
    title: 'Operations Health Summary',
    description: 'Single-page overview of missing, financial, device, and case metrics.',
  },
  {
    href: '/admin/print/open-missing-aging',
    title: 'Open Missing Aging',
    description: 'Currently missing items sorted by days outstanding.',
  },
  {
    href: '/admin/print/missing-drivers',
    title: 'Missing Drivers',
    description: 'Top locations and catalog items driving missing events.',
  },
  {
    href: '/admin/print/device-errors',
    title: 'Device Errors (7 days)',
    description: 'Recent device scan errors with details.',
  },
  {
    href: '/admin/print/financial-integrity',
    title: 'Financial Integrity (30 days)',
    description: 'Cost overrides and gratis events in the last 30 days.',
  },
];

export default function PrintCenterPage() {
  const { hasCapability } = useAccessControl();

  if (!hasCapability('INVENTORY_MANAGE')) {
    return (
      <>
        <Header title="Print Center" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Print Center" />
      <main className="p-6 max-w-4xl mx-auto space-y-4">
        <p className="text-text-muted text-sm">
          Select a report to open a print-friendly view. Use your browser&apos;s print function or the Print button on each page.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PRINT_REPORTS.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="block bg-surface-primary rounded-lg border border-border p-4 hover:border-accent transition-colors"
            >
              <div className="font-medium text-text-primary">{report.title}</div>
              <div className="text-sm text-text-muted mt-1">{report.description}</div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
