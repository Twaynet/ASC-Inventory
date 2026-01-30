/**
 * Schedule API module
 */

import { request } from './client';
import type { Case } from './cases';

// ============================================================================
// Types
// ============================================================================

export interface ScheduleItem {
  type: 'case' | 'block';
  id: string;
  sortOrder: number;
  durationMinutes: number;
  caseNumber?: string;
  procedureName?: string;
  laterality?: string | null;
  surgeonId?: string;
  surgeonName?: string;
  surgeonColor?: string | null;
  scheduledTime?: string | null;
  status?: string;
  isActive?: boolean;
  timeoutStatus?: string;
  debriefStatus?: string;
  notes?: string | null;
}

export interface RoomSchedule {
  roomId: string;
  roomName: string;
  startTime: string;
  items: ScheduleItem[];
}

export interface DayScheduleResponse {
  date: string;
  facilityId: string;
  rooms: RoomSchedule[];
  unassignedCases: ScheduleItem[];
}

export interface BlockTime {
  id: string;
  facilityId: string;
  roomId: string;
  roomName: string;
  blockDate: string;
  durationMinutes: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  createdByUserId: string | null;
}

export interface RoomDayConfig {
  id: string;
  roomId: string;
  configDate: string;
  startTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnassignedCase {
  id: string;
  type: 'case';
  caseNumber: string;
  procedureName: string;
  surgeonId: string;
  surgeonName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
  durationMinutes: number;
  isActive: boolean;
}

export interface UnassignedCasesResponse {
  unassignedCases: UnassignedCase[];
  count: number;
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getDaySchedule(
  token: string,
  date: string
): Promise<DayScheduleResponse> {
  return request(`/schedule/day?date=${date}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getUnassignedCases(token: string): Promise<UnassignedCasesResponse> {
  return request('/schedule/unassigned', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createBlockTime(
  token: string,
  data: {
    roomId: string;
    blockDate: string;
    durationMinutes?: number;
    notes?: string;
    sortOrder?: number;
  }
): Promise<{ blockTime: BlockTime }> {
  return request('/schedule/block-times', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateBlockTime(
  token: string,
  blockTimeId: string,
  data: {
    durationMinutes?: number;
    notes?: string | null;
    sortOrder?: number;
  }
): Promise<{ blockTime: BlockTime }> {
  return request(`/schedule/block-times/${blockTimeId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function deleteBlockTime(
  token: string,
  blockTimeId: string
): Promise<{ success: boolean }> {
  return request(`/schedule/block-times/${blockTimeId}`, { method: 'DELETE', token });
}

// TODO(api-schema): needs Zod request + response schema
export async function setRoomDayConfig(
  token: string,
  roomId: string,
  date: string,
  startTime: string
): Promise<{ config: RoomDayConfig }> {
  return request(`/schedule/rooms/${roomId}/day-config?date=${date}`, {
    method: 'PUT',
    body: { startTime },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function reorderScheduleItems(
  token: string,
  data: {
    roomId: string | null;
    date: string;
    orderedItems: Array<{ type: 'case' | 'block'; id: string }>;
  }
): Promise<{ success: boolean }> {
  return request('/schedule/reorder', { method: 'PATCH', body: data, token });
}
