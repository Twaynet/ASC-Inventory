'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getUnassignedCases, type UnassignedCase } from '@/lib/api';

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

      <main className="container-full unassigned-cases-page">
        <button className="back-link" onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </button>

        <div className="page-header">
          <div>
            <h1>Unassigned Cases</h1>
            <p className="page-description">
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
          <div className="loading-state">Loading unassigned cases...</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3>All Cases Assigned</h3>
            <p>There are no scheduled cases waiting for room assignment.</p>
          </div>
        ) : (
          <div className="cases-list">
            <div className="summary-badge">
              {cases.length} unassigned case{cases.length !== 1 ? 's' : ''}
            </div>

            {sortedDates.map((date) => (
              <div key={date} className="date-group">
                <h2 className="date-header">{formatDate(date)}</h2>
                <div className="cases-grid">
                  {casesByDate[date].map((caseItem) => (
                    <div
                      key={caseItem.id}
                      className={`case-card ${!caseItem.isActive ? 'inactive' : ''}`}
                      onClick={() => handleCaseClick(caseItem)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleCaseClick(caseItem);
                        }
                      }}
                    >
                      <div className="case-header">
                        <span className="case-number">{caseItem.caseNumber}</span>
                        <span className="case-time">{formatTime(caseItem.scheduledTime)}</span>
                      </div>
                      <div className="case-procedure">{caseItem.procedureName}</div>
                      <div className="case-surgeon">{caseItem.surgeonName}</div>
                      <div className="case-duration">{caseItem.durationMinutes} min</div>
                      {!caseItem.isActive && (
                        <span className="inactive-badge">Inactive</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style jsx>{`
        .unassigned-cases-page {
          padding: 2rem 1.5rem;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: #3182ce;
          font-size: 0.875rem;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1.5rem;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .page-header h1 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }

        .page-description {
          margin: 0;
          color: #718096;
          font-size: 0.875rem;
          max-width: 500px;
        }

        .alert-error {
          background: #fed7d7;
          border: 1px solid #fc8181;
          color: #c53030;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .loading-state {
          text-align: center;
          padding: 3rem;
          color: #718096;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .empty-icon {
          margin-bottom: 1rem;
        }

        .empty-state h3 {
          margin: 0 0 0.5rem 0;
          color: #2d3748;
        }

        .empty-state p {
          margin: 0;
          color: #718096;
        }

        .cases-list {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .summary-badge {
          background: #ebf8ff;
          color: #2b6cb0;
          padding: 0.75rem 1.5rem;
          font-weight: 500;
          font-size: 0.875rem;
          border-bottom: 1px solid #bee3f8;
        }

        .date-group {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .date-group:last-child {
          border-bottom: none;
        }

        .date-header {
          font-size: 1rem;
          font-weight: 600;
          color: #2d3748;
          margin: 0 0 1rem 0;
        }

        .cases-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .case-card {
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
        }

        .case-card:hover {
          border-color: #3182ce;
          box-shadow: 0 2px 8px rgba(49, 130, 206, 0.15);
          transform: translateY(-1px);
        }

        .case-card.inactive {
          opacity: 0.6;
          background: #edf2f7;
        }

        .case-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .case-number {
          font-weight: 600;
          color: #2d3748;
          font-size: 0.875rem;
        }

        .case-time {
          font-size: 0.75rem;
          color: #718096;
        }

        .case-procedure {
          font-size: 0.9375rem;
          color: #2d3748;
          margin-bottom: 0.25rem;
          font-weight: 500;
        }

        .case-surgeon {
          font-size: 0.8125rem;
          color: #718096;
          margin-bottom: 0.25rem;
        }

        .case-duration {
          font-size: 0.75rem;
          color: #a0aec0;
        }

        .inactive-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: #fc8181;
          color: white;
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-weight: 600;
          text-transform: uppercase;
        }
      `}</style>
    </>
  );
}
