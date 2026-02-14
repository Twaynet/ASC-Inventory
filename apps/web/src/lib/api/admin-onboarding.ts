/**
 * Admin Onboarding API module
 *
 * Wrappers for the missing-aging trend, timeline, and resolve endpoints.
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface TrendDataPoint {
  date: string;
  openCount: number;
}

export interface TrendAnnotation {
  date: string;
  label: string;
}

export interface CurrentlyOpenItem {
  inventoryItemId: string;
  catalogName: string;
  locationName: string | null;
  daysOpen: number;
  lastTouchedBy: string | null;
  lastTouchedAt: string;
}

export interface OpenMissingAgingTrendResponse {
  trend: TrendDataPoint[];
  annotations: TrendAnnotation[];
  currentlyOpen: CurrentlyOpenItem[];
}

export interface TimelineEvent {
  eventId: string;
  eventType: string;
  notes: string | null;
  performedByName: string | null;
  occurredAt: string;
}

export interface MissingItemTimelineResponse {
  item: {
    inventoryItemId: string;
    catalogName: string;
    locationName: string | null;
    serialNumber: string | null;
    lotNumber: string | null;
  };
  timeline: TimelineEvent[];
  isOpen: boolean;
  daysOpen: number;
}

export type ResolutionType =
  | 'LOCATED'
  | 'VENDOR_REPLACEMENT'
  | 'CASE_RESCHEDULED'
  | 'INVENTORY_ERROR_CORRECTED'
  | 'OTHER';

export interface ResolveRequest {
  resolutionType: ResolutionType;
  resolutionNotes?: string;
}

export interface ResolveResponse {
  resolutionId: string;
  inventoryItemId: string;
  resolvedAt: string;
}

// ============================================================================
// Endpoints
// ============================================================================

export async function getOpenMissingAgingTrend(
  token: string,
  params?: { days?: number },
): Promise<OpenMissingAgingTrendResponse> {
  const query = params?.days ? `?days=${params.days}` : '';
  return request(`/admin/trends/open-missing-aging${query}`, { token });
}

export async function getMissingItemTimeline(
  token: string,
  inventoryItemId: string,
): Promise<MissingItemTimelineResponse> {
  return request(`/admin/missing/${inventoryItemId}/timeline`, { token });
}

export async function resolveMissingItem(
  token: string,
  inventoryItemId: string,
  data: ResolveRequest,
): Promise<ResolveResponse> {
  return request(`/admin/missing/${inventoryItemId}/resolve`, {
    method: 'POST',
    body: data,
    token,
  });
}
