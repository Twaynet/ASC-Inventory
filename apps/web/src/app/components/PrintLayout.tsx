'use client';

import { useRouter } from 'next/navigation';

const appVersion = process.env.NEXT_PUBLIC_VERSION || 'unknown';

interface PrintLayoutProps {
  title: string;
  facilityName?: string;
  dateRange?: { start: string; end: string };
  children: React.ReactNode;
}

export function PrintLayout({ title, facilityName, dateRange, children }: PrintLayoutProps) {
  const router = useRouter();
  const generated = new Date().toLocaleString();

  return (
    <>
      {/* On-screen toolbar — hidden when printing */}
      <div className="print-toolbar bg-surface-primary border-b border-border p-3 flex items-center gap-3 sticky top-0 z-50">
        <button className="btn btn-secondary btn-sm" onClick={() => router.back()}>
          &larr; Back
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Print
        </button>
        <span className="text-text-muted text-sm ml-auto">{title}</span>
      </div>

      <div className="print-page p-6 max-w-5xl mx-auto">
        {/* Print header */}
        <div className="print-section mb-6 border-b border-border pb-4">
          <h1 className="text-xl font-bold text-text-primary">{title}</h1>
          <div className="text-sm text-text-muted mt-1 flex flex-wrap gap-x-6 gap-y-1">
            {facilityName && <span>Facility: {facilityName}</span>}
            {dateRange && <span>Range: {dateRange.start} to {dateRange.end}</span>}
            <span>Generated: {generated}</span>
          </div>
        </div>

        {children}

        {/* Footer — visible in print */}
        <div className="mt-8 pt-3 border-t border-border text-[9pt] text-text-muted flex justify-between">
          <span>Generated: {generated}</span>
          <span>Version: {appVersion}</span>
        </div>
      </div>
    </>
  );
}

export function PrintSection({ title, children, pageBreak }: {
  title?: string;
  children: React.ReactNode;
  pageBreak?: boolean;
}) {
  return (
    <div className={`print-section mb-6 ${pageBreak ? 'print-page-break' : ''}`}>
      {title && <h2 className="text-base font-semibold text-text-primary mb-3">{title}</h2>}
      {children}
    </div>
  );
}
