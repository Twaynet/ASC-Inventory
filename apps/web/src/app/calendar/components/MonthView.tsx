'use client';

import { useMemo } from 'react';
import type { CalendarCaseSummary } from '@/lib/api';

interface MonthViewProps {
  currentDate: Date;
  cases: CalendarCaseSummary[];
  onDayClick: (date: Date) => void;
  onOpenCaseDashboard: (caseId: string) => void;
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
  // Use local date to avoid timezone shifts
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  cases,
  onDayClick,
  onOpenCaseDashboard,
  isLoading,
}: MonthViewProps) {
  const days = useMemo(
    () => getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate]
  );

  const casesByDay = useMemo(() => {
    const map = new Map<string, CalendarCaseSummary[]>();
    for (const c of cases) {
      const existing = map.get(c.scheduledDate) || [];
      existing.push(c);
      map.set(c.scheduledDate, existing);
    }
    return map;
  }, [cases]);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="month-view">
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="status-dot green"></span>
          <span>Ready</span>
        </div>
        <div className="legend-item">
          <span className="status-dot orange"></span>
          <span>Pending</span>
        </div>
        <div className="legend-item">
          <span className="status-dot red"></span>
          <span>Missing Items</span>
        </div>
        <div className="legend-item">
          <span className="status-dot gray"></span>
          <span>Inactive</span>
        </div>
      </div>

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
          const dayCases = casesByDay.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(date, currentDate);
          const isTodayDate = isToday(date);

          return (
            <div
              key={index}
              className={`day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isTodayDate ? 'today' : ''} ${dayCases.length > 0 ? 'has-cases' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="day-number">{date.getDate()}</span>

              {isLoading ? (
                <div className="day-loading" />
              ) : dayCases.length > 0 ? (
                <div className="day-cases">
                  {dayCases.slice(0, 4).map((c) => (
                    <div
                      key={c.caseId}
                      className={`month-case-badge ${c.isActive ? `status-${c.readinessState.toLowerCase()}` : 'inactive'}`}
                      style={c.surgeonColor ? { borderLeftColor: c.surgeonColor } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCaseDashboard(c.caseId);
                      }}
                      title={`${c.procedureName} - Dr. ${c.surgeonName}`}
                    >
                      {c.surgeonColor && (
                        <span
                          className="surgeon-color-dot"
                          style={{ backgroundColor: c.surgeonColor }}
                        />
                      )}
                      <span className="month-case-name">{c.procedureName}</span>
                    </div>
                  ))}
                  {dayCases.length > 4 && (
                    <div className="month-more-cases">
                      +{dayCases.length - 4} more
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
