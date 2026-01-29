'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { RoomColumn, RoomSchedule } from './RoomColumn';
import { ScheduleCard, ScheduleItem, scheduleCardStyles } from './ScheduleCard';
import { CreateCaseModal } from '@/components/CreateCaseModal';
import { ScheduleCaseModal } from '@/components/ScheduleCaseModal';
import { BlockTimeModal } from './BlockTimeModal';
import { CaseDashboardModal } from '@/components/CaseDashboardModal';
import { TimeoutModal, DebriefModal } from '@/components/Checklists';
import {
  getDaySchedule,
  setRoomDayConfig,
  reorderScheduleItems,
  assignCaseRoom,
  type DayScheduleResponse,
  type BlockTime,
} from '@/lib/api';

interface RoomBasedDayViewProps {
  selectedDate: string;
  token: string;
  user: {
    id: string;
    name: string;
    role: string;
    roles?: string[];
    facilityName: string;
  };
}

// Helper to parse item ID from sortable ID format "type-id"
function parseItemId(sortableId: string): { type: 'case' | 'block'; id: string } {
  const [type, ...idParts] = sortableId.split('-');
  return { type: type as 'case' | 'block', id: idParts.join('-') };
}

// Droppable wrapper for the unassigned column
function UnassignedDroppable({ children, isOver }: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({
    id: 'unassigned',
  });

  return (
    <div
      ref={setNodeRef}
      className={`unassigned-content ${isOver ? 'drop-target-active' : ''}`}
    >
      {children}
    </div>
  );
}

export function RoomBasedDayView({ selectedDate, token, user }: RoomBasedDayViewProps) {
  const router = useRouter();
  const [data, setData] = useState<DayScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Block time modal state
  const [showBlockTimeModal, setShowBlockTimeModal] = useState(false);
  const [blockTimeRoomId, setBlockTimeRoomId] = useState<string>('');
  const [blockTimeRoomName, setBlockTimeRoomName] = useState<string>('');
  const [editingBlockTime, setEditingBlockTime] = useState<ScheduleItem | null>(null);

  // Case Dashboard modal state
  const [caseDashboardOpen, setCaseDashboardOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Checklist modal state
  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
  const [debriefModalOpen, setDebriefModalOpen] = useState(false);
  const [checklistCaseId, setChecklistCaseId] = useState<string | null>(null);

  // Check if user can edit (ADMIN or SCHEDULER)
  const userRoles = user.roles || [user.role];
  const canEdit = userRoles.includes('ADMIN') || userRoles.includes('SCHEDULER');

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activating
      },
    })
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getDaySchedule(token, selectedDate);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setIsLoading(false);
    }
  }, [token, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartTimeChange = async (roomId: string, newStartTime: string) => {
    if (!token) return;
    try {
      await setRoomDayConfig(token, roomId, selectedDate, newStartTime);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update start time');
    }
  };

  const handleItemClick = (item: ScheduleItem, roomId?: string, roomName?: string) => {
    if (item.type === 'case') {
      setSelectedCaseId(item.id);
      setCaseDashboardOpen(true);
    } else if (item.type === 'block' && canEdit && roomId && roomName) {
      // Open edit modal for block times
      setBlockTimeRoomId(roomId);
      setBlockTimeRoomName(roomName);
      setEditingBlockTime(item);
      setShowBlockTimeModal(true);
    }
  };

  const handleCloseCaseDashboard = () => {
    setCaseDashboardOpen(false);
    setSelectedCaseId(null);
  };

  const handleTimeoutClick = (caseId: string) => {
    setChecklistCaseId(caseId);
    setTimeoutModalOpen(true);
  };

  const handleDebriefClick = (caseId: string) => {
    setChecklistCaseId(caseId);
    setDebriefModalOpen(true);
  };

  const handleAddBlockTime = (roomId: string, roomName: string) => {
    setBlockTimeRoomId(roomId);
    setBlockTimeRoomName(roomName);
    setEditingBlockTime(null);
    setShowBlockTimeModal(true);
  };

  const handleBlockTimeModalClose = () => {
    setShowBlockTimeModal(false);
    setBlockTimeRoomId('');
    setBlockTimeRoomName('');
    setEditingBlockTime(null);
  };

  // Find which room an item is in
  const findContainer = (id: string): string | null => {
    if (!data) return null;

    // Check if it's in unassigned
    const unassignedItem = data.unassignedCases.find(
      item => `${item.type}-${item.id}` === id
    );
    if (unassignedItem) return 'unassigned';

    // Check rooms
    for (const room of data.rooms) {
      const found = room.items.find(item => `${item.type}-${item.id}` === id);
      if (found) return room.roomId;
    }

    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || !data || !token) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const sourceContainer = findContainer(activeIdStr);
    let targetContainer: string | null = null;

    // Determine target container
    if (overIdStr === 'unassigned') {
      targetContainer = 'unassigned';
    } else if (data.rooms.some(r => r.roomId === overIdStr)) {
      targetContainer = overIdStr;
    } else {
      // Might be dropping on another item - find its container
      targetContainer = findContainer(overIdStr);
    }

    if (!sourceContainer || !targetContainer) return;

    // If same container and same position, do nothing
    if (sourceContainer === targetContainer && activeIdStr === overIdStr) return;

    const { type, id } = parseItemId(activeIdStr);

    // Handle cross-container moves (room assignment changes)
    if (sourceContainer !== targetContainer) {
      if (type === 'case') {
        const targetRoomId = targetContainer === 'unassigned' ? null : targetContainer;
        try {
          await assignCaseRoom(token, id, { roomId: targetRoomId });
          await loadData();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to assign room');
        }
      }
      return;
    }

    // Handle reordering within the same container
    const containerItems = targetContainer === 'unassigned'
      ? data.unassignedCases
      : data.rooms.find(r => r.roomId === targetContainer)?.items || [];

    const activeIndex = containerItems.findIndex(
      item => `${item.type}-${item.id}` === activeIdStr
    );
    const overIndex = containerItems.findIndex(
      item => `${item.type}-${item.id}` === overIdStr
    );

    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;

    // Build new order
    const newItems = [...containerItems];
    const [movedItem] = newItems.splice(activeIndex, 1);
    newItems.splice(overIndex, 0, movedItem);

    const orderedItems = newItems.map(item => ({
      type: item.type,
      id: item.id,
    }));

    try {
      await reorderScheduleItems(token, {
        roomId: targetContainer === 'unassigned' ? null : targetContainer,
        date: selectedDate,
        orderedItems,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder items');
    }
  };

  // Get the active item for the drag overlay
  const getActiveItem = (): ScheduleItem | null => {
    if (!activeId || !data) return null;

    for (const item of data.unassignedCases) {
      if (`${item.type}-${item.id}` === activeId) return item;
    }

    for (const room of data.rooms) {
      for (const item of room.items) {
        if (`${item.type}-${item.id}` === activeId) return item;
      }
    }

    return null;
  };

  // Calculate totals
  const totalCases = data
    ? data.rooms.reduce((sum, room) => sum + room.items.filter(i => i.type === 'case').length, 0) + data.unassignedCases.length
    : 0;

  const totalMinutes = data
    ? data.rooms.reduce(
        (sum, room) => sum + room.items.reduce((s, i) => s + i.durationMinutes, 0),
        0
      )
    : 0;

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const activeItem = getActiveItem();

  // Filter function to exclude inactive cases when toggle is off
  const filterItems = (items: ScheduleItem[]) => {
    if (showInactive) return items;
    return items.filter(item => item.type === 'block' || item.isActive !== false);
  };

  // Filter unassigned cases and room items
  const filteredUnassignedCases = data ? filterItems(data.unassignedCases) : [];
  const filteredRooms = data?.rooms.map(room => ({
    ...room,
    items: filterItems(room.items),
  })) || [];

  const unassignedIds = filteredUnassignedCases.map(item => `${item.type}-${item.id}`);

  return (
    <div className="room-based-day-view">
      <div className="day-view-header">
        <div className="day-view-summary">
          <span className="summary-item">
            <strong>{totalCases}</strong> case{totalCases !== 1 ? 's' : ''}
          </span>
          <span className="summary-item">
            <strong>{data?.rooms.length || 0}</strong> room{(data?.rooms.length || 0) !== 1 ? 's' : ''}
          </span>
          <span className="summary-item">
            <strong>{totalHours}h {remainingMinutes}m</strong> scheduled
          </span>
        </div>
        <div className="day-view-actions">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show Inactive
          </label>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
          {canEdit && (
            <button
              className="btn btn-create btn-sm"
              onClick={() => setShowScheduleModal(true)}
            >
              + Add to Schedule
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCreateModal(true)}
          >
            Request Case
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {isLoading && !data ? (
        <div className="loading-state">Loading schedule...</div>
      ) : data ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="schedule-container">
            {/* Unassigned Cases Column */}
            {(filteredUnassignedCases.length > 0 || canEdit) && (
              <div className={`unassigned-column ${overId === 'unassigned' ? 'drop-target' : ''}`}>
                <div className="unassigned-header">
                  <h3>Unassigned</h3>
                  <span className="unassigned-count">{filteredUnassignedCases.length}</span>
                </div>
                <SortableContext items={unassignedIds} strategy={verticalListSortingStrategy}>
                  <UnassignedDroppable isOver={overId === 'unassigned'}>
                    {filteredUnassignedCases.length === 0 ? (
                      <div className="unassigned-empty">
                        {canEdit ? 'Drag cases here to unassign' : 'No unassigned cases'}
                      </div>
                    ) : (
                      filteredUnassignedCases.map((item) => (
                        <ScheduleCard
                          key={item.id}
                          item={item}
                          startTime="--:--"
                          isDraggable={canEdit}
                          onClick={() => handleItemClick(item)}
                        />
                      ))
                    )}
                  </UnassignedDroppable>
                </SortableContext>
              </div>
            )}

            {/* Room Columns */}
            <div className="rooms-container">
              {filteredRooms.length === 0 ? (
                <div className="no-rooms">
                  No operating rooms configured.
                  {canEdit && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => router.push('/admin/general-settings/operating-rooms')}
                    >
                      Configure Rooms
                    </button>
                  )}
                </div>
              ) : (
                filteredRooms.map((room) => (
                  <RoomColumn
                    key={room.roomId}
                    room={room}
                    canEdit={canEdit}
                    onStartTimeChange={handleStartTimeChange}
                    onItemClick={handleItemClick}
                    onAddBlockTime={handleAddBlockTime}
                    onTimeoutClick={handleTimeoutClick}
                    onDebriefClick={handleDebriefClick}
                    isOver={overId === room.roomId}
                  />
                ))
              )}
            </div>
          </div>

          <DragOverlay>
            {activeItem ? (
              <div className="drag-overlay-card">
                <ScheduleCard
                  item={activeItem}
                  startTime="--:--"
                  isDraggable={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      <CreateCaseModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={loadData}
        token={token}
        defaultDate={selectedDate}
      />

      <ScheduleCaseModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSuccess={loadData}
        token={token}
        defaultDate={selectedDate}
      />

      <BlockTimeModal
        isOpen={showBlockTimeModal}
        onClose={handleBlockTimeModalClose}
        onSuccess={loadData}
        token={token}
        roomId={blockTimeRoomId}
        roomName={blockTimeRoomName}
        date={selectedDate}
        editingBlockTime={editingBlockTime ? {
          id: editingBlockTime.id,
          durationMinutes: editingBlockTime.durationMinutes,
          notes: editingBlockTime.notes,
        } : null}
      />

      <CaseDashboardModal
        isOpen={caseDashboardOpen}
        caseId={selectedCaseId}
        token={token}
        user={user}
        onClose={handleCloseCaseDashboard}
        onSuccess={loadData}
      />

      <TimeoutModal
        isOpen={timeoutModalOpen}
        caseId={checklistCaseId}
        token={token}
        user={user}
        onClose={() => {
          setTimeoutModalOpen(false);
          setChecklistCaseId(null);
        }}
        onComplete={() => {
          setTimeoutModalOpen(false);
          setChecklistCaseId(null);
          loadData();
        }}
        zIndex={1000}
      />

      <DebriefModal
        isOpen={debriefModalOpen}
        caseId={checklistCaseId}
        token={token}
        user={user}
        onClose={() => {
          setDebriefModalOpen(false);
          setChecklistCaseId(null);
        }}
        onComplete={() => {
          setDebriefModalOpen(false);
          setChecklistCaseId(null);
          loadData();
        }}
        zIndex={1000}
      />

      <style jsx>{`
        .room-based-day-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .day-view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: var(--color-gray-50);
          border-bottom: 1px solid var(--color-gray-200);
          flex-wrap: wrap;
          gap: 1rem;
        }

        .day-view-summary {
          display: flex;
          gap: 1.5rem;
        }

        .summary-item {
          font-size: 0.875rem;
          color: var(--color-gray-600);
        }

        .summary-item strong {
          color: var(--color-gray-900);
        }

        .day-view-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .toggle-label {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.875rem;
          color: var(--color-gray-600);
          cursor: pointer;
          user-select: none;
        }

        .toggle-label input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }

        .toggle-label:hover {
          color: var(--color-gray-800);
        }

        .error-banner {
          padding: 1rem;
          background: var(--color-red-50, #FEE2E2);
          color: var(--color-red-700, #B91C1C);
          border-bottom: 1px solid var(--color-red-200, #FECACA);
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          color: var(--color-gray-500);
        }

        .schedule-container {
          display: flex;
          flex: 1;
          overflow-x: auto;
          padding: 1rem;
          gap: 1rem;
        }

        .unassigned-column {
          min-width: 180px;
          max-width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--color-orange-50, #FFF7ED);
          border-radius: 8px;
          border: 2px dashed var(--color-orange-300, #FDBA74);
          transition: border-color 0.15s, background 0.15s;
        }

        .unassigned-column.drop-target {
          border-color: var(--color-blue);
          background: var(--color-blue-50, #EBF8FF);
        }

        .unassigned-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-orange-200, #FED7AA);
        }

        .unassigned-header h3 {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-orange-800, #9A3412);
          margin: 0;
        }

        .unassigned-count {
          background: var(--color-orange-200, #FED7AA);
          color: var(--color-orange-800, #9A3412);
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .unassigned-content {
          flex: 1;
          padding: 0.5rem;
          overflow-y: auto;
          min-height: 200px;
        }

        .unassigned-content.drop-target-active {
          background-color: var(--color-blue-50, #EBF8FF);
          border: 2px dashed var(--color-blue-300, #90CDF4);
          border-radius: 6px;
        }

        .unassigned-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 100px;
          color: var(--color-orange-400, #FB923C);
          font-size: 0.75rem;
          text-align: center;
          padding: 1rem;
        }

        .rooms-container {
          display: flex;
          gap: 1rem;
          flex: 1;
        }

        .no-rooms {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          flex: 1;
          color: var(--color-gray-500);
          font-size: 0.875rem;
        }

        .drag-overlay-card {
          opacity: 0.9;
          cursor: grabbing;
        }
      `}</style>

      <style jsx global>{scheduleCardStyles}</style>
    </div>
  );
}
