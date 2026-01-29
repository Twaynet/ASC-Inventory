'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ScheduleCard, ScheduleItem, scheduleCardStyles } from './ScheduleCard';

export interface RoomSchedule {
  roomId: string;
  roomName: string;
  startTime: string; // Default or configured start time (HH:MM:SS)
  items: ScheduleItem[];
}

interface RoomColumnProps {
  room: RoomSchedule;
  canEdit: boolean;
  onStartTimeChange?: (roomId: string, newStartTime: string) => void;
  onItemClick?: (item: ScheduleItem, roomId: string, roomName: string) => void;
  onAddBlockTime?: (roomId: string, roomName: string) => void;
  onTimeoutClick?: (caseId: string) => void;
  onDebriefClick?: (caseId: string) => void;
  isOver?: boolean;
}

/**
 * Parse time string (HH:MM or HH:MM:SS) to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight back to HH:MM
 */
function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

/**
 * Calculate start times for all items in a room based on room start time and durations
 */
function calculateItemTimes(
  roomStartTime: string,
  items: ScheduleItem[]
): Map<string, string> {
  const times = new Map<string, string>();
  let currentMinutes = parseTimeToMinutes(roomStartTime);

  for (const item of items) {
    times.set(item.id, minutesToTime(currentMinutes));
    currentMinutes += item.durationMinutes;
  }

  return times;
}

export function RoomColumn({
  room,
  canEdit,
  onStartTimeChange,
  onItemClick,
  onAddBlockTime,
  onTimeoutClick,
  onDebriefClick,
  isOver,
}: RoomColumnProps) {
  const [isEditingStartTime, setIsEditingStartTime] = useState(false);
  const [editStartTime, setEditStartTime] = useState(room.startTime.slice(0, 5)); // HH:MM

  const { setNodeRef } = useDroppable({
    id: room.roomId,
  });

  const itemTimes = calculateItemTimes(room.startTime, room.items);

  const handleStartTimeBlur = () => {
    setIsEditingStartTime(false);
    if (onStartTimeChange && editStartTime !== room.startTime.slice(0, 5)) {
      onStartTimeChange(room.roomId, editStartTime + ':00');
    }
  };

  const handleStartTimeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStartTimeBlur();
    } else if (e.key === 'Escape') {
      setEditStartTime(room.startTime.slice(0, 5));
      setIsEditingStartTime(false);
    }
  };

  // Calculate total duration
  const totalMinutes = room.items.reduce((sum, item) => sum + item.durationMinutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const totalDuration = totalHours > 0
    ? `${totalHours}h ${remainingMinutes}m`
    : `${remainingMinutes}m`;

  // Create sortable item IDs
  const sortableIds = room.items.map(item => `${item.type}-${item.id}`);

  return (
    <div
      ref={setNodeRef}
      className={`room-column ${isOver ? 'drop-target' : ''}`}
    >
      <div className="room-column-header">
        <h3 className="room-column-name">{room.roomName}</h3>
        <div className="room-column-start-time">
          {canEdit && isEditingStartTime ? (
            <input
              type="time"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
              onBlur={handleStartTimeBlur}
              onKeyDown={handleStartTimeKeyDown}
              autoFocus
              className="start-time-input"
            />
          ) : (
            <button
              className="start-time-display"
              onClick={() => canEdit && setIsEditingStartTime(true)}
              disabled={!canEdit}
              title={canEdit ? 'Click to edit start time' : undefined}
            >
              Start: {room.startTime.slice(0, 5)}
            </button>
          )}
        </div>
      </div>

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="room-column-content">
          {room.items.length === 0 ? (
            <div className="room-column-empty">
              {canEdit ? 'Drop cases here' : 'No cases scheduled'}
            </div>
          ) : (
            room.items.map((item) => (
              <ScheduleCard
                key={item.id}
                item={item}
                startTime={itemTimes.get(item.id) || room.startTime}
                isDraggable={canEdit}
                onClick={() => onItemClick?.(item, room.roomId, room.roomName)}
                onTimeoutClick={item.type === 'case' && onTimeoutClick ? () => onTimeoutClick(item.id) : undefined}
                onDebriefClick={item.type === 'case' && onDebriefClick ? () => onDebriefClick(item.id) : undefined}
              />
            ))
          )}
        </div>
      </SortableContext>

      <div className="room-column-footer">
        <span className="room-column-count">{room.items.length} item{room.items.length !== 1 ? 's' : ''}</span>
        <span className="room-column-duration">{totalDuration}</span>
      </div>

      {canEdit && onAddBlockTime && (
        <button
          className="add-block-btn"
          onClick={() => onAddBlockTime(room.roomId, room.roomName)}
        >
          + Block Time
        </button>
      )}

      <style jsx>{`
        .room-column {
          display: flex;
          flex-direction: column;
          min-width: 200px;
          max-width: 280px;
          flex: 1;
          background: var(--color-gray-50);
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid transparent;
          transition: border-color 0.15s, background 0.15s;
        }

        .room-column.drop-target {
          border-color: var(--color-blue);
          background: var(--color-blue-50, #EBF8FF);
        }

        .room-column-header {
          background: var(--color-gray-200);
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-gray-300);
        }

        .room-column-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-gray-900);
          margin: 0 0 0.25rem 0;
        }

        .room-column-start-time {
          font-size: 0.75rem;
        }

        .start-time-display {
          background: none;
          border: none;
          padding: 0.25rem 0.5rem;
          margin: -0.25rem -0.5rem;
          font-size: 0.75rem;
          color: var(--color-gray-600);
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .start-time-display:hover:not(:disabled) {
          background: var(--color-gray-300);
        }

        .start-time-display:disabled {
          cursor: default;
        }

        .start-time-input {
          padding: 0.25rem;
          font-size: 0.75rem;
          border: 1px solid var(--color-blue);
          border-radius: 4px;
          width: 100px;
        }

        .room-column-content {
          flex: 1;
          padding: 0.5rem;
          overflow-y: auto;
          min-height: 200px;
        }

        .room-column-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-gray-400);
          font-size: 0.875rem;
          font-style: italic;
          min-height: 100px;
        }

        .room-column-footer {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: var(--color-gray-100);
          border-top: 1px solid var(--color-gray-200);
          font-size: 0.75rem;
          color: var(--color-gray-600);
        }

        .room-column-count {
          font-weight: 500;
        }

        .room-column-duration {
          color: var(--color-gray-500);
        }

        .add-block-btn {
          width: 100%;
          padding: 0.5rem;
          background: var(--color-gray-100);
          border: 1px dashed var(--color-gray-300);
          border-radius: 0 0 6px 6px;
          font-size: 0.75rem;
          color: var(--color-gray-600);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }

        .add-block-btn:hover {
          background: var(--color-gray-200);
          color: var(--color-gray-800);
        }
      `}</style>

      <style jsx global>{scheduleCardStyles}</style>
    </div>
  );
}
