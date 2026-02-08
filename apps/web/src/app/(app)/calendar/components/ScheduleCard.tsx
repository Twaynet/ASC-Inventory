'use client';

import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ReadinessBadge } from '@/components/ReadinessBadge';
import { readinessFromState } from '@/lib/readiness/summary';

export interface ScheduleItem {
  type: 'case' | 'block';
  id: string;
  sortOrder: number;
  durationMinutes: number;
  // Case-specific fields
  caseNumber?: string;
  procedureName?: string;
  laterality?: string | null;
  surgeonId?: string;
  surgeonName?: string;
  surgeonColor?: string | null;
  scheduledTime?: string | null;
  status?: string;
  isActive?: boolean;
  // Checklist status (from OR Timeout/Debrief)
  timeoutStatus?: string;
  debriefStatus?: string;
  // Readiness (merged from calendar summary)
  readinessState?: 'GREEN' | 'ORANGE' | 'RED';
  // Block-specific fields
  notes?: string | null;
}

interface ScheduleCardProps {
  item: ScheduleItem;
  startTime: string;
  isDraggable?: boolean;
  onClick?: () => void;
  onTimeoutClick?: () => void;
  onDebriefClick?: () => void;
  onRemoveFromSchedule?: (caseId: string, procedureName: string) => void;
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

function getBadgeClasses(status?: string): string {
  const base = 'inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[0.5rem] font-bold';
  switch (status) {
    case 'COMPLETED':
      return `${base} bg-[var(--color-green)] text-[var(--text-on-primary)]`;
    case 'IN_PROGRESS':
      return `${base} bg-[var(--color-orange)] text-[var(--text-on-primary)]`;
    default:
      return `${base} bg-[var(--color-gray-200)] text-[var(--color-gray-500)]`;
  }
}

function getBadgeTitle(status?: string): string {
  switch (status) {
    case 'COMPLETED': return 'Completed';
    case 'IN_PROGRESS': return 'In Progress';
    default: return 'Not Started';
  }
}

const CARD_BASE = 'flex gap-3 p-3 rounded-md mb-2 shadow-[0_1px_3px_var(--shadow-sm)] hover:shadow-[0_2px_4px_var(--shadow-md)] touch-none transition-all';

export function ScheduleCard({ item, startTime, isDraggable, onClick, onTimeoutClick, onDebriefClick, onRemoveFromSchedule }: ScheduleCardProps) {
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
        className={`${CARD_BASE} bg-[var(--color-gray-100)] border-l-4 border-l-[var(--color-gray-400)] hover:bg-[var(--color-gray-200)] ${isDragging ? 'z-[100]' : ''}`}
        onClick={onClick}
        {...attributes}
        {...listeners}
      >
        <div className="text-xs font-semibold text-[var(--color-gray-600)] whitespace-nowrap">{formatTime(startTime)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--color-gray-900)]">Unoccupied Time</div>
          <div className="text-xs text-[var(--color-gray-600)]">{item.durationMinutes} min</div>
          {item.notes && (
            <div className="text-xs text-[var(--color-gray-500)] italic mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{item.notes}</div>
          )}
        </div>
      </div>
    );
  }

  // Case card
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    if (onClick) {
      onClick();
    } else {
      router.push(`/case/${item.id}`);
    }
  };

  const isInactive = item.isActive === false;
  const borderColor = item.surgeonColor || getStatusColor(item.status);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftColor: borderColor,
        cursor: isDraggable ? 'grab' : 'pointer',
      }}
      className={`${CARD_BASE} border-l-4 ${
        isInactive
          ? 'bg-[var(--color-gray-100)] opacity-70 hover:bg-[var(--color-gray-200)]'
          : 'bg-surface-primary hover:bg-[var(--color-blue-50)]'
      } ${isDragging ? 'shadow-[0_4px_12px_var(--shadow-md)] z-[100]' : ''}`}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <div className="flex flex-col items-start gap-1 min-w-[60px]">
        <div className="text-xs font-semibold text-[var(--color-gray-600)] whitespace-nowrap">{formatTime(startTime)}</div>
        <div className="flex gap-0.5">
          <span
            className={`${getBadgeClasses(item.timeoutStatus)}${onTimeoutClick ? ' hover:scale-[1.15] hover:shadow-[0_1px_3px_var(--shadow-md)]' : ''}`}
            title={`Timeout: ${getBadgeTitle(item.timeoutStatus)}`}
            onClick={(e) => {
              if (onTimeoutClick) {
                e.stopPropagation();
                onTimeoutClick();
              }
            }}
            style={{ cursor: onTimeoutClick ? 'pointer' : 'help' }}
          >
            T
          </span>
          <span
            className={`${getBadgeClasses(item.debriefStatus)}${onDebriefClick ? ' hover:scale-[1.15] hover:shadow-[0_1px_3px_var(--shadow-md)]' : ''}`}
            title={`Debrief: ${getBadgeTitle(item.debriefStatus)}`}
            onClick={(e) => {
              if (onDebriefClick) {
                e.stopPropagation();
                onDebriefClick();
              }
            }}
            style={{ cursor: onDebriefClick ? 'pointer' : 'help' }}
          >
            D
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {isInactive && (
          <span className="inline-block px-1.5 py-0.5 mb-1 text-[0.6rem] font-bold uppercase bg-[var(--color-gray-300)] text-[var(--color-gray-600)] rounded">Deactivated</span>
        )}
        <div className={`text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis ${isInactive ? 'text-[var(--color-gray-500)]' : 'text-[var(--color-gray-900)]'}`}>
          {item.laterality && <span className="text-[var(--color-gray-500)] font-medium">{item.laterality} </span>}
          {item.procedureName}
        </div>
        <div className={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${isInactive ? 'text-[var(--color-gray-500)]' : 'text-[var(--color-gray-600)]'}`}>
          {item.surgeonColor && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 shrink-0 align-middle"
              style={{ backgroundColor: item.surgeonColor }}
            />
          )}
          Dr. {item.surgeonName}
        </div>
        <div className="flex gap-2 mt-1 text-[0.625rem] text-[var(--color-gray-500)]">
          <span className="bg-[var(--color-gray-100)] px-1.5 py-0.5 rounded">{item.durationMinutes} min</span>
          {item.caseNumber && (
            <span className="text-[var(--color-gray-400)]">{item.caseNumber}</span>
          )}
          <ReadinessBadge overall={readinessFromState(item.readinessState)} />
        </div>
        {isInactive && onRemoveFromSchedule && (
          <button
            className="btn btn-danger btn-sm w-full mt-2"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromSchedule(item.id, item.procedureName || 'Unknown Procedure');
            }}
          >
            Remove from Schedule
          </button>
        )}
      </div>
    </div>
  );
}
