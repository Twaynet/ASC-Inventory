/**
 * Platform Facility View API module — read-only cross-facility data access.
 *
 * All functions call /api/platform/facility-view/* endpoints.
 * Requires PLATFORM_ADMIN auth token.
 */

import { request } from './client';
import type { OperationsHealthSummary } from './operations';
import type {
  MissingAnalyticsResponse,
  MissingAnalyticsGroupBy,
  MissingAnalyticsResolution,
  MissingEventsResponse,
  OpenMissingAgingResponse,
  DeviceEventListResponse,
  InventoryEventListResponse,
} from './inventory';

const BASE = '/platform/facility-view';

export async function getHealthSummary(
  token: string,
  facilityId: string,
  params: { start?: string; end?: string } = {},
): Promise<OperationsHealthSummary> {
  const qs = new URLSearchParams({ facilityId });
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  return request(`${BASE}/health-summary?${qs}`, { token });
}

export async function getMissingAnalytics(
  token: string,
  facilityId: string,
  params: {
    start: string;
    end: string;
    groupBy: MissingAnalyticsGroupBy;
    resolution?: MissingAnalyticsResolution;
  },
): Promise<MissingAnalyticsResponse> {
  const qs = new URLSearchParams({
    facilityId,
    start: params.start,
    end: params.end,
    groupBy: params.groupBy,
    resolution: params.resolution || 'BOTH',
  });
  return request(`${BASE}/missing-analytics?${qs}`, { token });
}

export async function getMissingEvents(
  token: string,
  facilityId: string,
  params: {
    start: string;
    end: string;
    groupBy: MissingAnalyticsGroupBy;
    resolution?: MissingAnalyticsResolution;
    groupKey?: string;
    date?: string;
    limit?: number;
    offset?: number;
  },
): Promise<MissingEventsResponse> {
  const qs = new URLSearchParams({
    facilityId,
    start: params.start,
    end: params.end,
    groupBy: params.groupBy,
    resolution: params.resolution || 'BOTH',
  });
  if (params.groupKey) qs.set('groupKey', params.groupKey);
  if (params.date) qs.set('date', params.date);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  return request(`${BASE}/missing-events?${qs}`, { token });
}

export async function getOpenMissingAging(
  token: string,
  facilityId: string,
): Promise<OpenMissingAgingResponse> {
  return request(`${BASE}/open-missing-aging?facilityId=${facilityId}`, { token });
}

export async function getDeviceEvents(
  token: string,
  facilityId: string,
  options?: {
    start?: string;
    end?: string;
    hasError?: boolean;
    limit?: number;
    cursor?: string;
  },
): Promise<DeviceEventListResponse> {
  const qs = new URLSearchParams({ facilityId });
  if (options?.start) qs.set('start', options.start);
  if (options?.end) qs.set('end', options.end);
  if (options?.hasError !== undefined) qs.set('hasError', String(options.hasError));
  if (options?.limit) qs.set('limit', String(options.limit));
  if (options?.cursor) qs.set('cursor', options.cursor);
  return request(`${BASE}/device-events?${qs}`, { token });
}

export async function getInventoryEvents(
  token: string,
  facilityId: string,
  options?: {
    financial?: boolean;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  },
): Promise<InventoryEventListResponse> {
  const qs = new URLSearchParams({ facilityId });
  if (options?.financial !== undefined) qs.set('financial', String(options.financial));
  if (options?.start) qs.set('start', options.start);
  if (options?.end) qs.set('end', options.end);
  if (options?.limit) qs.set('limit', String(options.limit));
  if (options?.offset !== undefined) qs.set('offset', String(options.offset));
  return request(`${BASE}/events?${qs}`, { token });
}
