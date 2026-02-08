'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getUnassignedCases, type UnassignedCase } from '@/lib/api';
import { ReadinessBadge } from '@/components/ReadinessBadge';

function formatDate(dateStr: string): string {
  // Handle various date formats (YYYY-MM-DD or ISO string)
  let date: Date;
  if (dateStr.includes('T')) {
    // ISO format - parse directly
    date = new Date(dateStr);
  } else {
    // YYYY-MM-DD format - add time to avoid timezone issues
    date = new Date(dateStr + 'T00:00:00');
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDateKey(dateStr: string): string {
  // Extract just the date part for grouping
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  return dateStr;
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'No time set';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export default function UnassignedCasesPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<UnassignedCase[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getUnassignedCases(token);
      setCases(result.unassignedCases);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unassigned cases');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN') || userRoles.includes('SCHEDULER')) {
        loadData();
      }
    }
  }, [token, user, loadData]);

  const handleCaseClick = (caseItem: UnassignedCase) => {
    // Navigate to the calendar day view for this case's date
    const dateKey = getDateKey(caseItem.scheduledDate);
    router.push(`/calendar?view=day&date=${dateKey}`);
  };

  // Check access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const hasAccess = userRoles.includes('ADMIN') || userRoles.includes('SCHEDULER');

  if (!hasAccess) {
    return (
      <>
        <Header title="Unassigned Cases" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to Admins and Schedulers.
          </div>
        </main>
      </>
    );
  }

  // Group cases by date
  const casesByDate = cases.reduce((acc, caseItem) => {
    const dateKey = getDateKey(caseItem.scheduledDate);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(caseItem);
    return acc;
  }, {} as Record<string, UnassignedCase[]>);

  const sortedDates = Object.keys(casesByDate).sort();

  return (
    <>
      <Header title="Unassigned Cases" />

      <main className="container-full py-8 px-6">
        <button
          className="inline-flex items-center gap-2 bg-transparent border-none text-accent text-sm cursor-pointer p-0 mb-6 hover:underline"
          onClick={() => router.push('/dashboard')}
        >
          ← Back to Dashboard
        </button>

        <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
          <div>
            <h1 className="m-0 mb-2 text-2xl text-text-primary">Unassigned Cases</h1>
            <p className="m-0 text-text-muted text-sm max-w-[500px]">
              Scheduled cases that have not been assigned to an operating room.
              Click a case to go to its calendar day view.
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={isLoadingData}
          >
            {isLoadingData ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {isLoadingData ? (
          <div className="text-center p-12 text-text-muted">Loading unassigned cases...</div>
        ) : cases.length === 0 ? (
          <div className="text-center p-12 bg-surface-primary rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="mb-4">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3 className="m-0 mb-2 text-text-primary">All Cases Assigned</h3>
            <p className="m-0 text-text-muted">There are no scheduled cases waiting for room assignment.</p>
          </div>
        ) : (
          <div className="bg-surface-primary rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
            <div className="bg-[var(--color-blue-50)] text-[var(--color-blue-500)] py-3 px-6 font-medium text-sm border-b border-border">
              {cases.length} unassigned case{cases.length !== 1 ? 's' : ''}
            </div>

            {sortedDates.map((date) => (
              <div key={date} className="py-4 px-6 border-b border-border last:border-b-0">
                <h2 className="text-base font-semibold text-text-primary m-0 mb-4">{formatDate(date)}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                  {casesByDate[date].map((caseItem) => (
                    <div
                      key={caseItem.id}
                      className={`bg-surface-secondary border border-border rounded-lg p-4 cursor-pointer transition-all relative hover:border-[var(--color-blue-500)] hover:shadow-[0_2px_8px_rgba(49,130,206,0.15)] hover:-translate-y-px ${
                        !caseItem.isActive ? 'opacity-60 bg-surface-tertiary' : ''
                      }`}
                      onClick={() => handleCaseClick(caseItem)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleCaseClick(caseItem);
                        }
                      }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-text-primary text-sm">{caseItem.caseNumber}</span>
                        <span className="text-xs text-text-muted">{formatTime(caseItem.scheduledTime)}</span>
                      </div>
                      <div className="text-[0.9375rem] text-text-primary mb-1 font-medium">{caseItem.procedureName}</div>
                      <div className="text-[0.8125rem] text-text-muted mb-1">{caseItem.surgeonName}</div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-text-muted">{caseItem.durationMinutes} min</span>
                        <ReadinessBadge overall="UNKNOWN" />
                      </div>
                      {!caseItem.isActive && (
                        <span className="absolute top-2 right-2 bg-[var(--color-red)] text-white text-[0.625rem] px-1.5 py-0.5 rounded font-semibold uppercase">Inactive</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
