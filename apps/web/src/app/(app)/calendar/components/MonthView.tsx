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

  // Get unique rooms from all cases
  const rooms = useMemo(() => {
    const roomMap = new Map<string, string>();
    for (const c of cases) {
      if (c.roomId && c.roomName) {
        roomMap.set(c.roomId, c.roomName);
      }
    }
    // Sort rooms by name
    return Array.from(roomMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [cases]);

  // Group cases by day and room
  const casesByDayAndRoom = useMemo(() => {
    const map = new Map<string, Map<string, CalendarCaseSummary[]>>();
    for (const c of cases) {
      if (!map.has(c.scheduledDate)) {
        map.set(c.scheduledDate, new Map());
      }
      const dayMap = map.get(c.scheduledDate)!;
      const roomKey = c.roomId || 'unassigned';
      if (!dayMap.has(roomKey)) {
        dayMap.set(roomKey, []);
      }
      dayMap.get(roomKey)!.push(c);
    }
    return map;
  }, [cases]);

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
          const dayRooms = casesByDayAndRoom.get(dateKey);
          const isCurrentMonth = isSameMonth(date, currentDate);
          const isTodayDate = isToday(date);
          const hasCases = dayRooms && dayRooms.size > 0;

          return (
            <div
              key={index}
              className={`day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isTodayDate ? 'today' : ''} ${hasCases ? 'has-cases' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="day-number">{date.getDate()}</span>

              {isLoading ? (
                <div className="day-loading" />
              ) : hasCases ? (
                <div className="day-rooms">
                  {rooms.map((room) => {
                    const roomCases = dayRooms.get(room.id) || [];
                    if (roomCases.length === 0) return null;
                    return (
                      <div key={room.id} className="room-column">
                        {roomCases.map((c) => (
                          <div
                            key={c.caseId}
                            className={`case-dot ${c.isActive ? `status-${c.readinessState.toLowerCase()}` : 'inactive'}`}
                            style={c.surgeonColor ? { backgroundColor: c.surgeonColor } : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCaseDashboard(c.caseId);
                            }}
                            title={`${c.procedureName} - Dr. ${c.surgeonName} (${room.name})`}
                          />
                        ))}
                      </div>
                    );
                  })}
                  {/* Unassigned cases */}
                  {dayRooms.has('unassigned') && (
                    <div className="room-column unassigned">
                      {dayRooms.get('unassigned')!.map((c) => (
                        <div
                          key={c.caseId}
                          className={`case-dot ${c.isActive ? `status-${c.readinessState.toLowerCase()}` : 'inactive'}`}
                          style={c.surgeonColor ? { backgroundColor: c.surgeonColor } : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCaseDashboard(c.caseId);
                          }}
                          title={`${c.procedureName} - Dr. ${c.surgeonName} (Unassigned)`}
                        />
                      ))}
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
