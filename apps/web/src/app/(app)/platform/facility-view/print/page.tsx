'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useFacilityContext } from '../useFacilityContext';

const PRINT_REPORTS = [
  {
    path: '/platform/facility-view/print/operations-weekly',
    title: 'Weekly Operations Packet',
    description: 'Full briefing: health summary, missing aging, drivers, devices, and financials.',
  },
  {
    path: '/platform/facility-view/print/operations-health',
    title: 'Operations Health Summary',
    description: 'Single-page overview of missing, financial, device, and case metrics.',
  },
  {
    path: '/platform/facility-view/print/open-missing-aging',
    title: 'Open Missing Aging',
    description: 'Currently missing items sorted by days outstanding.',
  },
  {
    path: '/platform/facility-view/print/missing-drivers',
    title: 'Missing Drivers',
    description: 'Top locations and catalog items driving missing events.',
  },
  {
    path: '/platform/facility-view/print/device-errors',
    title: 'Device Errors (7 days)',
    description: 'Recent device scan errors with details.',
  },
  {
    path: '/platform/facility-view/print/financial-integrity',
    title: 'Financial Integrity (30 days)',
    description: 'Cost overrides and gratis events in the last 30 days.',
  },
];

function PrintCenterContent() {
  const { facilityId, buildHref } = useFacilityContext();

  if (!facilityId) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <div className="bg-surface-secondary rounded-lg border border-border p-8 text-center text-text-muted">
          Select a facility above to access print reports.
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-4">
      <p className="text-text-muted text-sm">
        Select a report to open a print-friendly view. Use your browser&apos;s print function or the Print button on each page.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PRINT_REPORTS.map((report) => (
          <Link
            key={report.path}
            href={buildHref(report.path)}
            className="block bg-surface-primary rounded-lg border border-border p-4 hover:border-accent transition-colors"
          >
            <div className="font-medium text-text-primary">{report.title}</div>
            <div className="text-sm text-text-muted mt-1">{report.description}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default function FacilityViewPrintCenterPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <PrintCenterContent />
    </Suspense>
  );
}
