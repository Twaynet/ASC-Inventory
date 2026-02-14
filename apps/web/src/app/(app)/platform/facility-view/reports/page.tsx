'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useFacilityContext } from '../useFacilityContext';

const REPORT_CARDS = [
  {
    path: '/platform/facility-view/operations-health',
    title: 'Operations Health',
    description: 'Executive cockpit summarizing missing inventory, financial integrity, device stability, and case throughput.',
  },
  {
    path: '/platform/facility-view/print',
    title: 'Print Center',
    description: 'Printable weekly packet and individual reports formatted for meetings and compliance binders.',
  },
];

function ReportsContent() {
  const { facilityId, buildHref } = useFacilityContext();

  if (!facilityId) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <div className="bg-surface-secondary rounded-lg border border-border p-8 text-center text-text-muted">
          Select a facility above to view reports.
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <p className="text-text-secondary text-sm mb-6">
        Dashboards, analytics, and printable reports for operations review.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_CARDS.map((card) => (
          <Link
            key={card.path}
            href={buildHref(card.path)}
            className="block bg-surface-primary rounded-lg border border-border p-5 hover:border-accent hover:shadow-md transition-all no-underline group"
          >
            <h3 className="text-base font-semibold text-text-primary mb-2 group-hover:text-accent transition-colors">
              {card.title}
            </h3>
            <p className="text-sm text-text-secondary mb-3 leading-relaxed">
              {card.description}
            </p>
            <span className="text-xs text-accent font-medium group-hover:underline">
              Open &rarr;
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default function FacilityViewReportsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
