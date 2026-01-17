'use client';

import { useMemo } from 'react';
import type { CalendarDaySummary } from '@/lib/api';

interface MonthViewProps {
  currentDate: Date;
  daySummaries: CalendarDaySummary[];
  onDayClick: (date: Date) => void;
  isLoading?: boolean;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add days from previous month to fill the first week
  const startDayOfWeek = firstDay.getDay();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push(date);
  }

  // Add days of current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day));
  }

  // Add days from next month to complete the last week
  const endDayOfWeek = lastDay.getDay();
  for (let i = 1; i < 7 - endDayOfWeek; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function isSameMonth(date: Date, referenceDate: Date): boolean {
  return (
    date.getMonth() === referenceDate.getMonth() &&
    date.getFullYear() === referenceDate.getFullYear()
  );
}

export function MonthView({
  currentDate,
  daySummaries,
  onDayClick,
  isLoading,
}: MonthViewProps) {
  const days = useMemo(
    () => getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate]
  );

  const summaryMap = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();
    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }
    return map;
  }, [daySummaries]);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="month-view">
      {/* Weekday headers */}
      <div className="month-grid-header">
        {weekdays.map((day) => (
          <div key={day} className="month-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="month-grid">
        {days.map((date, index) => {
          const dateKey = formatDateKey(date);
          const summary = summaryMap.get(dateKey);
          const isCurrentMonth = isSameMonth(date, currentDate);
          const isTodayDate = isToday(date);

          return (
            <div
              key={index}
              className={`day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isTodayDate ? 'today' : ''} ${summary ? 'has-cases' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="day-number">{date.getDate()}</span>

              {isLoading ? (
                <div className="day-loading" />
              ) : summary && summary.caseCount > 0 ? (
                <div className="day-indicators">
                  <div className="case-count">{summary.caseCount} case{summary.caseCount !== 1 ? 's' : ''}</div>
                  <div className="status-dots">
                    {summary.greenCount > 0 && (
                      <span className="status-dot green" title={`${summary.greenCount} ready`}>
                        {summary.greenCount}
                      </span>
                    )}
                    {summary.orangeCount > 0 && (
                      <span className="status-dot orange" title={`${summary.orangeCount} pending`}>
                        {summary.orangeCount}
                      </span>
                    )}
                    {summary.redCount > 0 && (
                      <span className="status-dot red" title={`${summary.redCount} missing`}>
                        {summary.redCount}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <span className="legend-item">
          <span className="status-dot green" />
          Ready
        </span>
        <span className="legend-item">
          <span className="status-dot orange" />
          Pending
        </span>
        <span className="legend-item">
          <span className="status-dot red" />
          Missing Items
        </span>
      </div>
    </div>
  );
}
