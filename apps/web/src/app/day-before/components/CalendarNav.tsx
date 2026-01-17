'use client';

export type ViewMode = 'month' | 'week' | 'day';

interface CalendarNavProps {
  viewMode: ViewMode;
  currentDate: Date;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
}

function formatPeriodLabel(viewMode: ViewMode, date: Date): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (viewMode === 'month') {
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  } else if (viewMode === 'week') {
    // Get start and end of week
    const startOfWeek = new Date(date);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const startMonth = monthNames[startOfWeek.getMonth()].substring(0, 3);
    const endMonth = monthNames[endOfWeek.getMonth()].substring(0, 3);

    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      return `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`;
    } else {
      return `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
    }
  } else {
    // Day view
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

export function CalendarNav({
  viewMode,
  currentDate,
  onViewModeChange,
  onNavigate,
}: CalendarNavProps) {
  return (
    <div className="calendar-nav">
      <div className="calendar-nav-left">
        <button
          className="btn btn-secondary btn-sm calendar-nav-arrow"
          onClick={() => onNavigate('prev')}
          aria-label="Previous"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onNavigate('today')}
        >
          Today
        </button>
        <button
          className="btn btn-secondary btn-sm calendar-nav-arrow"
          onClick={() => onNavigate('next')}
          aria-label="Next"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <h2 className="calendar-nav-title">{formatPeriodLabel(viewMode, currentDate)}</h2>

      <div className="calendar-nav-right">
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
            onClick={() => onViewModeChange('month')}
          >
            Month
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => onViewModeChange('week')}
          >
            Week
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'day' ? 'active' : ''}`}
            onClick={() => onViewModeChange('day')}
          >
            Day
          </button>
        </div>
      </div>
    </div>
  );
}
