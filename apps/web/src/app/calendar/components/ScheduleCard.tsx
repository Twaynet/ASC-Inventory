'use client';

import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface ScheduleItem {
  type: 'case' | 'block';
  id: string;
  sortOrder: number;
  durationMinutes: number;
  // Case-specific fields
  caseNumber?: string;
  procedureName?: string;
  surgeonId?: string;
  surgeonName?: string;
  surgeonColor?: string | null;
  scheduledTime?: string | null;
  status?: string;
  isActive?: boolean;
  // Checklist status (from OR Timeout/Debrief)
  timeoutStatus?: string;
  debriefStatus?: string;
  // Block-specific fields
  notes?: string | null;
}

interface ScheduleCardProps {
  item: ScheduleItem;
  startTime: string;
  isDraggable?: boolean;
  onClick?: () => void;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'SCHEDULED':
    case 'READY':
      return 'var(--color-green)';
    case 'IN_PROGRESS':
      return 'var(--color-orange)';
    case 'COMPLETED':
      return 'var(--color-gray-500)';
    case 'CANCELLED':
    case 'REJECTED':
      return 'var(--color-red)';
    default:
      return 'var(--color-blue)';
  }
}

export function ScheduleCard({ item, startTime, isDraggable, onClick }: ScheduleCardProps) {
  const router = useRouter();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${item.type}-${item.id}`,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (item.type === 'block') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`schedule-card schedule-card-block ${isDragging ? 'dragging' : ''}`}
        onClick={onClick}
        {...attributes}
        {...listeners}
      >
        <div className="schedule-card-time">{formatTime(startTime)}</div>
        <div className="schedule-card-content">
          <div className="schedule-card-title">Block Time</div>
          <div className="schedule-card-subtitle">{item.durationMinutes} min</div>
          {item.notes && (
            <div className="schedule-card-notes">{item.notes}</div>
          )}
        </div>

        <style jsx>{`
          .schedule-card-block {
            background: var(--color-gray-100);
            border-left: 4px solid var(--color-gray-400);
          }
          .schedule-card-block:hover {
            background: var(--color-gray-200);
          }
        `}</style>
      </div>
    );
  }

  // Case card
  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if we're dragging
    if (isDragging) return;

    if (onClick) {
      onClick();
    } else {
      router.push(`/case/${item.id}`);
    }
  };

  const isInactive = item.isActive === false;

  // Use surgeon color for border if available, otherwise fall back to status color
  const borderColor = item.surgeonColor || getStatusColor(item.status);

  // Determine checklist status for display
  const getChecklistStatus = (status?: string) => {
    if (!status) return { className: 'pending', title: 'Not started' };
    switch (status) {
      case 'COMPLETED':
        return { className: 'completed', title: 'Completed' };
      case 'IN_PROGRESS':
        return { className: 'in-progress', title: 'In progress' };
      default:
        return { className: 'pending', title: 'Pending' };
    }
  };

  const timeoutStatus = getChecklistStatus(item.timeoutStatus);
  const debriefStatus = getChecklistStatus(item.debriefStatus);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftColor: borderColor,
        cursor: isDraggable ? 'grab' : 'pointer',
      }}
      className={`schedule-card schedule-card-case ${isDragging ? 'dragging' : ''} ${isInactive ? 'inactive' : 'active'}`}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <div className="schedule-card-time-column">
        <div className="schedule-card-time">{formatTime(startTime)}</div>
        <div className="schedule-card-checklists">
          <span
            className={`checklist-badge ${timeoutStatus.className}`}
            title={`Timeout: ${timeoutStatus.title}`}
          >
            T
          </span>
          <span
            className={`checklist-badge ${debriefStatus.className}`}
            title={`Debrief: ${debriefStatus.title}`}
          >
            D
          </span>
        </div>
      </div>
      <div className="schedule-card-content">
        <div className="schedule-card-title">{item.procedureName}</div>
        <div className="schedule-card-subtitle">
          {item.surgeonColor && (
            <span
              className="surgeon-color-dot"
              style={{ backgroundColor: item.surgeonColor }}
            />
          )}
          Dr. {item.surgeonName}
        </div>
        <div className="schedule-card-meta">
          <span className="schedule-card-duration">{item.durationMinutes} min</span>
          {item.caseNumber && (
            <span className="schedule-card-case-number">{item.caseNumber}</span>
          )}
        </div>
      </div>

      <style jsx>{`
        .surgeon-color-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 0.375rem;
          flex-shrink: 0;
          vertical-align: middle;
        }
        .schedule-card-case {
          border-left-width: 4px;
          border-left-style: solid;
        }
        .schedule-card-case.active {
          background: white;
        }
        .schedule-card-case.active:hover {
          background: var(--color-blue-50, #EBF8FF);
        }
        .schedule-card-case.inactive {
          background: var(--color-gray-100, #F3F4F6);
          opacity: 0.7;
        }
        .schedule-card-case.inactive:hover {
          background: var(--color-gray-200, #E5E7EB);
        }
        .schedule-card-case.inactive .schedule-card-title,
        .schedule-card-case.inactive .schedule-card-subtitle {
          color: var(--color-gray-500, #6B7280);
        }
        .schedule-card-case.dragging {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}

// Shared styles - exported for use in parent components
export const scheduleCardStyles = `
  .schedule-card {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    transition: background 0.15s, box-shadow 0.15s, opacity 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    touch-action: none;
  }

  .schedule-card:hover {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .schedule-card.dragging {
    z-index: 100;
  }

  .schedule-card-time-column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    min-width: 60px;
  }

  .schedule-card-time {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-600);
    white-space: nowrap;
  }

  .schedule-card-content {
    flex: 1;
    min-width: 0;
  }

  .schedule-card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .schedule-card-subtitle {
    font-size: 0.75rem;
    color: var(--color-gray-600);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .schedule-card-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.625rem;
    color: var(--color-gray-500);
  }

  .schedule-card-duration {
    background: var(--color-gray-100);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .schedule-card-case-number {
    color: var(--color-gray-400);
  }

  .schedule-card-notes {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    font-style: italic;
    margin-top: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .schedule-card-checklists {
    display: flex;
    gap: 0.125rem;
  }

  .checklist-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
  }

  .checklist-badge.pending {
    background: var(--color-gray-200, #E5E7EB);
    color: var(--color-gray-500, #6B7280);
  }

  .checklist-badge.in-progress {
    background: var(--color-orange, #F59E0B);
    color: white;
  }

  .checklist-badge.completed {
    background: var(--color-green, #10B981);
    color: white;
  }
`;
