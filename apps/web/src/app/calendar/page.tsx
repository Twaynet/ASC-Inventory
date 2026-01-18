'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCalendarSummary,
  getFacilitySettings,
  updateFacilitySettings,
  type CalendarDaySummary,
  type CalendarCaseSummary,
} from '@/lib/api';

import { CalendarNav, type ViewMode } from './components/CalendarNav';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function getEndOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  return d;
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseDateParam(dateStr: string | null): Date {
  if (!dateStr) {
    // Default to today (works for month/week/day views)
    return new Date();
  }

  // Handle YYYY-MM format for month view
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [year, month] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  // Handle YYYY-MM-DD format
  return new Date(dateStr + 'T00:00:00');
}

function DayBeforeContent() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL params
  const viewParam = searchParams.get('view') as ViewMode | null;
  const dateParam = searchParams.get('date');

  const [viewMode, setViewMode] = useState<ViewMode>(viewParam || 'month');
  const [currentDate, setCurrentDate] = useState<Date>(() => parseDateParam(dateParam));
  const [timeoutDebriefEnabled, setTimeoutDebriefEnabled] = useState(false);
  const [isTogglingFeature, setIsTogglingFeature] = useState(false);

  // Calendar data
  const [daySummaries, setDaySummaries] = useState<CalendarDaySummary[]>([]);
  const [weekCases, setWeekCases] = useState<CalendarCaseSummary[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // Update URL when view mode or date changes
  const updateUrl = useCallback((mode: ViewMode, date: Date) => {
    const params = new URLSearchParams();
    params.set('view', mode);

    if (mode === 'month') {
      // For month view, use YYYY-MM format
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      params.set('date', monthStr);
    } else {
      params.set('date', formatDateParam(date));
    }

    router.push(`/calendar?${params.toString()}`, { scroll: false });
  }, [router]);

  // Handle view mode change
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    setViewMode(newMode);
    updateUrl(newMode, currentDate);
  }, [currentDate, updateUrl]);

  // Handle navigation
  const handleNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    let newDate: Date;

    if (direction === 'today') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      newDate = tomorrow;
    } else {
      newDate = new Date(currentDate);
      const delta = direction === 'prev' ? -1 : 1;

      if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() + delta);
      } else if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (delta * 7));
      } else {
        newDate.setDate(newDate.getDate() + delta);
      }
    }

    setCurrentDate(newDate);
    updateUrl(viewMode, newDate);
  }, [currentDate, viewMode, updateUrl]);

  // Handle day click from Month View -> Week View
  const handleDayClickFromMonth = useCallback((date: Date) => {
    setCurrentDate(date);
    setViewMode('week');
    updateUrl('week', date);
  }, [updateUrl]);

  // Handle day click from Week View -> Day View
  const handleDayClickFromWeek = useCallback((date: Date) => {
    setCurrentDate(date);
    setViewMode('day');
    updateUrl('day', date);
  }, [updateUrl]);

  // Selected date string for Day View
  const selectedDateStr = useMemo(() => formatDateParam(currentDate), [currentDate]);

  // Load facility settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!token) return;
      try {
        const settings = await getFacilitySettings(token);
        setTimeoutDebriefEnabled(settings.enableTimeoutDebrief);
      } catch {
        // Ignore errors - feature will just be hidden
      }
    };
    loadSettings();
  }, [token]);

  // Load calendar data based on view mode
  useEffect(() => {
    const loadCalendarData = async () => {
      if (!token || viewMode === 'day') return;

      setIsLoadingCalendar(true);
      setCalendarError('');

      try {
        let startDate: string;
        let endDate: string;
        let granularity: 'day' | 'case';

        if (viewMode === 'month') {
          // For month view, get the full month plus padding for calendar display
          const monthStart = getStartOfMonth(currentDate);
          const monthEnd = getEndOfMonth(currentDate);
          // Include days from previous/next months that appear in the calendar grid
          const calendarStart = getStartOfWeek(monthStart);
          const calendarEnd = getEndOfWeek(monthEnd);

          startDate = formatDateParam(calendarStart);
          endDate = formatDateParam(calendarEnd);
          granularity = 'day';
        } else {
          // Week view
          const weekStart = getStartOfWeek(currentDate);
          const weekEnd = getEndOfWeek(currentDate);

          startDate = formatDateParam(weekStart);
          endDate = formatDateParam(weekEnd);
          granularity = 'case';
        }

        const result = await getCalendarSummary(token, startDate, endDate, granularity);

        if (viewMode === 'month' && result.days) {
          setDaySummaries(result.days);
        } else if (viewMode === 'week' && result.cases) {
          setWeekCases(result.cases);
        }
      } catch (err) {
        setCalendarError(err instanceof Error ? err.message : 'Failed to load calendar data');
      } finally {
        setIsLoadingCalendar(false);
      }
    };

    loadCalendarData();
  }, [token, viewMode, currentDate]);

  const handleToggleTimeoutDebrief = async () => {
    if (!token) return;
    setIsTogglingFeature(true);
    try {
      const settings = await updateFacilitySettings(token, {
        enableTimeoutDebrief: !timeoutDebriefEnabled,
      });
      setTimeoutDebriefEnabled(settings.enableTimeoutDebrief);
    } catch (err) {
      // Handle error
    } finally {
      setIsTogglingFeature(false);
    }
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      <Header title="Case Calendar" />

      <main className="container">
        {/* Admin: Time Out/Debrief Feature Toggle */}
        {user.role === 'ADMIN' && (
          <div className="feature-toggle-panel">
            <label className="feature-toggle">
              <input
                type="checkbox"
                checked={timeoutDebriefEnabled}
                onChange={handleToggleTimeoutDebrief}
                disabled={isTogglingFeature}
              />
              <span className="feature-toggle-label">
                {isTogglingFeature ? 'Updating...' : 'Enable Time Out / Debrief Checklists'}
              </span>
            </label>
            {timeoutDebriefEnabled && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => router.push('/admin/pending-reviews')}
                style={{ marginLeft: '1rem' }}
              >
                View Pending Reviews
              </button>
            )}
          </div>
        )}

        {/* Calendar Navigation */}
        <CalendarNav
          viewMode={viewMode}
          currentDate={currentDate}
          onViewModeChange={handleViewModeChange}
          onNavigate={handleNavigate}
        />

        {calendarError && (
          <div
            className="form-error"
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--color-red-bg)',
              borderRadius: '0.5rem',
            }}
          >
            {calendarError}
          </div>
        )}

        {/* Render appropriate view */}
        {viewMode === 'month' && (
          <MonthView
            currentDate={currentDate}
            daySummaries={daySummaries}
            onDayClick={handleDayClickFromMonth}
            isLoading={isLoadingCalendar}
          />
        )}

        {viewMode === 'week' && (
          <WeekView
            currentDate={currentDate}
            cases={weekCases}
            onDayClick={handleDayClickFromWeek}
            isLoading={isLoadingCalendar}
          />
        )}

        {viewMode === 'day' && (
          <DayView
            selectedDate={selectedDateStr}
            token={token!}
            user={{
              id: user.id,
              name: user.name,
              role: user.role,
              facilityName: user.facilityName,
            }}
            timeoutDebriefEnabled={timeoutDebriefEnabled}
          />
        )}
      </main>
    </>
  );
}

export default function DayBeforePage() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <DayBeforeContent />
    </Suspense>
  );
}
