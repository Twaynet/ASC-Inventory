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
import { ScheduleCard, ScheduleItem } from './ScheduleCard';
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
import { getCalendarSummary, type CalendarCaseSummary } from '@/lib/api/readiness';

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
      className={`flex-1 p-2 overflow-y-auto min-h-[200px] ${
        isOver ? 'bg-[var(--color-blue-50,#EBF8FF)] border-2 border-dashed border-[var(--color-blue-300,#90CDF4)] rounded-md' : ''
      }`}
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
      const [result, readinessResult] = await Promise.all([
        getDaySchedule(token, selectedDate),
        getCalendarSummary(token, selectedDate, selectedDate, 'case').catch(() => null),
      ]);

      // Merge readinessState into schedule items by caseId
      if (readinessResult?.cases) {
        const readinessMap = new Map<string, CalendarCaseSummary['readinessState']>();
        for (const c of readinessResult.cases) {
          readinessMap.set(c.caseId, c.readinessState);
        }
        for (const room of result.rooms) {
          for (const item of room.items) {
            if (item.type === 'case') {
              const state = readinessMap.get(item.id);
              if (state) (item as ScheduleItem).readinessState = state;
            }
          }
        }
        if (result.unassignedCases) {
          for (const item of result.unassignedCases) {
            if (item.type === 'case') {
              const state = readinessMap.get(item.id);
              if (state) (item as ScheduleItem).readinessState = state;
            }
          }
        }
      }

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
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-4 bg-[var(--color-gray-50)] border-b border-[var(--color-gray-200)] flex-wrap gap-4">
        <div className="flex gap-6">
          <span className="text-sm text-[var(--color-gray-600)]">
            <strong className="text-[var(--color-gray-900)]">{totalCases}</strong> case{totalCases !== 1 ? 's' : ''}
          </span>
          <span className="text-sm text-[var(--color-gray-600)]">
            <strong className="text-[var(--color-gray-900)]">{data?.rooms.length || 0}</strong> room{(data?.rooms.length || 0) !== 1 ? 's' : ''}
          </span>
          <span className="text-sm text-[var(--color-gray-600)]">
            <strong className="text-[var(--color-gray-900)]">{totalHours}h {remainingMinutes}m</strong> scheduled
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-[var(--color-gray-600)] cursor-pointer select-none hover:text-[var(--color-gray-800)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
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
        <div className="p-4 bg-[var(--color-red-50,#FEE2E2)] text-[var(--color-red-700,#B91C1C)] border-b border-[var(--color-red-200,#FECACA)]">{error}</div>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center p-12 text-[var(--color-gray-500)]">Loading schedule...</div>
      ) : data ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 overflow-x-auto p-4 gap-4">
            {/* Unassigned Cases Column */}
            {(filteredUnassignedCases.length > 0 || canEdit) && (
              <div className={`unassigned-col min-w-[180px] max-w-[220px] shrink-0 flex flex-col rounded-lg border-2 border-dashed transition-all ${
                overId === 'unassigned'
                  ? 'border-[var(--color-blue)] bg-[var(--color-blue-50,#EBF8FF)]'
                  : 'border-[var(--color-orange-300,#FDBA74)] bg-[var(--color-orange-50,#FFF7ED)]'
              }`}>
                <div className="unassigned-hdr flex justify-between items-center p-3 border-b border-[var(--color-orange-200,#FED7AA)]">
                  <h3 className="unassigned-heading text-sm font-semibold text-[var(--color-orange-800,#9A3412)] m-0">Unassigned</h3>
                  <span className="unassigned-badge bg-[var(--color-orange-200,#FED7AA)] text-[var(--color-orange-800,#9A3412)] px-2 py-0.5 rounded-full text-xs font-semibold">{filteredUnassignedCases.length}</span>
                </div>
                <SortableContext items={unassignedIds} strategy={verticalListSortingStrategy}>
                  <UnassignedDroppable isOver={overId === 'unassigned'}>
                    {filteredUnassignedCases.length === 0 ? (
                      <div className="unassigned-empty-text flex items-center justify-center h-full min-h-[100px] text-[var(--color-orange-400,#FB923C)] text-xs text-center p-4">
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
            <div className="flex gap-4 flex-1">
              {filteredRooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 flex-1 text-[var(--color-gray-500)] text-sm">
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
              <div className="opacity-90 cursor-grabbing">
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

      {/* Minimal dark mode overrides for unassigned column (orange → neutral in dark theme) */}
      <style jsx>{`
        :global([data-theme="dark"]) .unassigned-col {
          background: var(--surface-tertiary);
          border-color: var(--color-gray-400);
        }
        :global([data-theme="dark"]) .unassigned-hdr {
          border-bottom-color: var(--color-gray-400);
        }
        :global([data-theme="dark"]) .unassigned-heading {
          color: var(--text-secondary);
        }
        :global([data-theme="dark"]) .unassigned-badge {
          background: var(--color-gray-400);
          color: var(--text-primary);
        }
        :global([data-theme="dark"]) .unassigned-empty-text {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
