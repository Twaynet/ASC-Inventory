'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCalendarSummary,
  type CalendarCaseSummary,
} from '@/lib/api';

import { CalendarNav, type ViewMode } from './components/CalendarNav';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { RoomBasedDayView } from './components/RoomBasedDayView';
import { CaseDashboardModal } from '@/components/CaseDashboardModal';

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
  // Use local date to avoid timezone shifts
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL params
  const viewParam = searchParams.get('view') as ViewMode | null;
  const dateParam = searchParams.get('date');
  const openCaseParam = searchParams.get('openCase');

  const [viewMode, setViewMode] = useState<ViewMode>(viewParam || 'month');
  const [currentDate, setCurrentDate] = useState<Date>(() => parseDateParam(dateParam));

  // Calendar data
  const [monthCases, setMonthCases] = useState<CalendarCaseSummary[]>([]);
  const [weekCases, setWeekCases] = useState<CalendarCaseSummary[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // Case Dashboard Modal state
  const [caseDashboardOpen, setCaseDashboardOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

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

  // Handle opening case dashboard modal
  const handleOpenCaseDashboard = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setCaseDashboardOpen(true);
  }, []);

  // Handle case dashboard modal close
  const handleCloseCaseDashboard = useCallback(() => {
    setCaseDashboardOpen(false);
    setSelectedCaseId(null);
    // Clean up openCase URL parameter if present
    if (openCaseParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('openCase');
      const newUrl = `/calendar?${params.toString()}`;
      router.replace(newUrl, { scroll: false });
    }
  }, [openCaseParam, searchParams, router]);

  // Reload calendar data after case changes
  const reloadCalendarData = useCallback(async () => {
    if (!token || viewMode === 'day') return;
    // Trigger re-fetch by re-running the effect
    setIsLoadingCalendar(true);
  }, [token, viewMode]);

  // Selected date string for Day View
  const selectedDateStr = useMemo(() => formatDateParam(currentDate), [currentDate]);

  // Load calendar data based on view mode
  useEffect(() => {
    const loadCalendarData = async () => {
      if (!token || viewMode === 'day') return;

      setIsLoadingCalendar(true);
      setCalendarError('');

      try {
        let startDate: string;
        let endDate: string;

        if (viewMode === 'month') {
          // For month view, get the full month plus padding for calendar display
          const monthStart = getStartOfMonth(currentDate);
          const monthEnd = getEndOfMonth(currentDate);
          // Include days from previous/next months that appear in the calendar grid
          const calendarStart = getStartOfWeek(monthStart);
          const calendarEnd = getEndOfWeek(monthEnd);

          startDate = formatDateParam(calendarStart);
          endDate = formatDateParam(calendarEnd);
        } else {
          // Week view
          const weekStart = getStartOfWeek(currentDate);
          const weekEnd = getEndOfWeek(currentDate);

          startDate = formatDateParam(weekStart);
          endDate = formatDateParam(weekEnd);
        }

        // Both month and week views use 'case' granularity for surgeon colors
        const result = await getCalendarSummary(token, startDate, endDate, 'case');

        if (result.cases) {
          if (viewMode === 'month') {
            setMonthCases(result.cases);
          } else {
            setWeekCases(result.cases);
          }
        }
      } catch (err) {
        setCalendarError(err instanceof Error ? err.message : 'Failed to load calendar data');
      } finally {
        setIsLoadingCalendar(false);
      }
    };

    loadCalendarData();
  }, [token, viewMode, currentDate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Auto-open modal when returning from verify page with openCase param
  useEffect(() => {
    if (openCaseParam && !caseDashboardOpen && !isLoading && user) {
      setSelectedCaseId(openCaseParam);
      setCaseDashboardOpen(true);
    }
  }, [openCaseParam, caseDashboardOpen, isLoading, user]);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      <Header title="Case Calendar" />

      <main className="container-full">
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
            cases={monthCases}
            onDayClick={handleDayClickFromMonth}
            onOpenCaseDashboard={handleOpenCaseDashboard}
            isLoading={isLoadingCalendar}
          />
        )}

        {viewMode === 'week' && (
          <WeekView
            currentDate={currentDate}
            cases={weekCases}
            onDayClick={handleDayClickFromWeek}
            onOpenCaseDashboard={handleOpenCaseDashboard}
            isLoading={isLoadingCalendar}
          />
        )}

        {viewMode === 'day' && (
          <RoomBasedDayView
            selectedDate={selectedDateStr}
            token={token!}
            user={{
              id: user.id,
              name: user.name,
              role: user.role,
              roles: user.roles,
              facilityName: user.facilityName,
            }}
          />
        )}
      </main>

      {/* Case Dashboard Modal for Week/Month views */}
      {token && user && (
        <CaseDashboardModal
          isOpen={caseDashboardOpen}
          caseId={selectedCaseId}
          token={token}
          user={{
            id: user.id,
            name: user.name,
            role: user.role,
            roles: user.roles,
            facilityName: user.facilityName,
          }}
          onClose={handleCloseCaseDashboard}
          onSuccess={reloadCalendarData}
        />
      )}
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
