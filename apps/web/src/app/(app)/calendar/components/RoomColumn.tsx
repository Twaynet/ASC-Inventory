'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ScheduleCard, ScheduleItem } from './ScheduleCard';

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
      className={`flex flex-col min-w-[200px] max-w-[280px] flex-1 bg-[var(--color-gray-50)] rounded-lg overflow-hidden border-2 transition-all ${
        isOver ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)]' : 'border-transparent'
      }`}
    >
      <div className="bg-[var(--color-gray-200)] p-3 border-b border-[var(--color-gray-300)]">
        <h3 className="text-sm font-semibold text-[var(--color-gray-900)] m-0 mb-1">{room.roomName}</h3>
        <div className="text-xs">
          {canEdit && isEditingStartTime ? (
            <input
              type="time"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
              onBlur={handleStartTimeBlur}
              onKeyDown={handleStartTimeKeyDown}
              autoFocus
              className="p-1 text-xs border border-[var(--color-blue)] rounded w-[100px]"
            />
          ) : (
            <button
              className="bg-transparent border-none py-1 px-2 -my-1 -mx-2 text-xs text-[var(--color-gray-600)] cursor-pointer rounded transition-colors hover:enabled:bg-[var(--color-gray-300)] disabled:cursor-default"
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
        <div className="flex-1 p-2 overflow-y-auto min-h-[200px]">
          {room.items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--color-gray-400)] text-sm italic min-h-[100px]">
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

      <div className="flex justify-between py-2 px-3 bg-[var(--color-gray-100)] border-t border-[var(--color-gray-200)] text-xs text-[var(--color-gray-600)]">
        <span className="font-medium">{room.items.length} item{room.items.length !== 1 ? 's' : ''}</span>
        <span className="text-[var(--color-gray-500)]">{totalDuration}</span>
      </div>

      {canEdit && onAddBlockTime && (
        <button
          className="w-full p-2 bg-[var(--color-gray-100)] border border-dashed border-[var(--color-gray-300)] rounded-b-md text-xs text-[var(--color-gray-600)] cursor-pointer transition-colors hover:bg-[var(--color-gray-200)] hover:text-[var(--color-gray-800)]"
          onClick={() => onAddBlockTime(room.roomId, room.roomName)}
        >
          + Time Slot
        </button>
      )}
    </div>
  );
}
