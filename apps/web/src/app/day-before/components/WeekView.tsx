'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarCaseSummary } from '@/lib/api';

interface WeekViewProps {
  currentDate: Date;
  cases: CalendarCaseSummary[];
  onDayClick: (date: Date) => void;
  isLoading?: boolean;
}

function getWeekDays(date: Date): Date[] {
  const days: Date[] = [];
  const startOfWeek = new Date(date);
  const dayOfWeek = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(day.getDate() + i);
    days.push(day);
  }

  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function WeekView({
  currentDate,
  cases,
  onDayClick,
  isLoading,
}: WeekViewProps) {
  const router = useRouter();
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  const casesByDay = useMemo(() => {
    const map = new Map<string, CalendarCaseSummary[]>();
    for (const c of cases) {
      const existing = map.get(c.scheduledDate) || [];
      existing.push(c);
      map.set(c.scheduledDate, existing);
    }
    return map;
  }, [cases]);

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleCaseClick = (caseId: string) => {
    router.push(`/cases/${caseId}`);
  };

  return (
    <div className="week-view">
      <div className="week-container">
        {weekDays.map((date, index) => {
          const dateKey = formatDateKey(date);
          const dayCases = casesByDay.get(dateKey) || [];
          const isTodayDate = isToday(date);

          return (
            <div key={index} className={`week-day-column ${isTodayDate ? 'today' : ''}`}>
              <div
                className="week-day-header"
                onClick={() => onDayClick(date)}
              >
                <span className="week-day-name">{weekdayNames[date.getDay()]}</span>
                <span className="week-day-date">
                  {monthNames[date.getMonth()]} {date.getDate()}
                </span>
                <span className="week-day-count">
                  {dayCases.length} case{dayCases.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="week-day-cases">
                {isLoading ? (
                  <div className="week-loading">Loading...</div>
                ) : dayCases.length === 0 ? (
                  <div className="week-no-cases">No cases</div>
                ) : (
                  dayCases.map((c) => (
                    <div
                      key={c.caseId}
                      className={`case-badge status-${c.readinessState.toLowerCase()}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCaseClick(c.caseId);
                      }}
                    >
                      <div className="case-badge-time">{formatTime(c.scheduledTime)}</div>
                      <div className="case-badge-name">{c.procedureName}</div>
                      <div className="case-badge-surgeon">Dr. {c.surgeonName}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
