'use client';

import { useMemo } from 'react';
import type { CalendarCaseSummary } from '@/lib/api';

interface WeekViewProps {
  currentDate: Date;
  cases: CalendarCaseSummary[];
  onDayClick: (date: Date) => void;
  onOpenCaseDashboard: (caseId: string) => void;
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
  // Use local date to avoid timezone shifts
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  onOpenCaseDashboard,
  isLoading,
}: WeekViewProps) {
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

  return (
    <div className="week-view">
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
                      className={`case-badge ${c.isActive ? `status-${(c.readinessState ?? 'unknown').toLowerCase()}` : 'inactive'}`}
                      style={c.surgeonColor ? { borderLeftColor: c.surgeonColor } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCaseDashboard(c.caseId);
                      }}
                    >
                      {!c.isActive && (
                        <div className="case-badge-inactive-header">
                          <span className="case-badge-inactive-label">INACTIVE</span>
                        </div>
                      )}
                      <div className="case-badge-case-number">{c.caseNumber}</div>
                      <div className="case-badge-name">
                        {c.laterality && <span className="case-badge-laterality">{c.laterality} </span>}
                        {c.procedureName}
                      </div>
                      <div className="case-badge-surgeon">
                        {c.surgeonColor && (
                          <span
                            className="surgeon-color-dot"
                            style={{ backgroundColor: c.surgeonColor }}
                          />
                        )}
                        Dr. {c.surgeonName}
                      </div>
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
