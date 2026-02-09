/**
 * Settings API module (facility, rooms, surgeons, config items)
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface FacilitySettings {
  facilityId: string;
  enableTimeoutDebrief: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface RoomDetail {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomRequest {
  name: string;
}

export interface UpdateRoomRequest {
  name?: string;
}

export interface SurgeonSettings {
  id: string;
  name: string;
  username: string;
  displayColor: string | null;
}

export type ConfigItemType = 'PATIENT_FLAG' | 'ANESTHESIA_MODALITY';

export interface ConfigItem {
  id: string;
  itemType: ConfigItemType;
  itemKey: string;
  displayLabel: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigItemRequest {
  itemType: ConfigItemType;
  itemKey: string;
  displayLabel: string;
  description?: string;
}

export interface UpdateConfigItemRequest {
  displayLabel?: string;
  description?: string | null;
}

export interface Location {
  id: string;
  name: string;
  description: string | null;
  parentLocationId: string | null;
  parentLocationName: string | null;
  isActive: boolean;
  childCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationRequest {
  name: string;
  description?: string;
  parentLocationId?: string;
}

export interface UpdateLocationRequest {
  name?: string;
  description?: string | null;
  parentLocationId?: string | null;
}

// ============================================================================
// Endpoints — Facility
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getFacilitySettings(token: string): Promise<FacilitySettings> {
  return request('/facility/settings', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateFacilitySettings(
  token: string,
  settings: { enableTimeoutDebrief?: boolean }
): Promise<FacilitySettings> {
  return request('/facility/settings', { method: 'PATCH', body: settings, token });
}

// TODO(api-schema): needs Zod response schema
export async function getRooms(token: string): Promise<{ rooms: Room[] }> {
  return request('/rooms', { token });
}

// ============================================================================
// Endpoints — Settings Rooms
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getSettingsRooms(
  token: string,
  includeInactive = false
): Promise<{ rooms: RoomDetail[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return request(`/settings/rooms${query}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createRoom(token: string, data: CreateRoomRequest): Promise<{ room: RoomDetail }> {
  return request('/settings/rooms', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateRoom(token: string, roomId: string, data: UpdateRoomRequest): Promise<{ room: RoomDetail }> {
  return request(`/settings/rooms/${roomId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deactivateRoom(token: string, roomId: string): Promise<{ success: boolean }> {
  return request(`/settings/rooms/${roomId}/deactivate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function activateRoom(token: string, roomId: string): Promise<{ success: boolean }> {
  return request(`/settings/rooms/${roomId}/activate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function reorderRooms(token: string, orderedIds: string[]): Promise<{ success: boolean }> {
  return request('/settings/rooms/reorder', { method: 'POST', body: { orderedIds }, token });
}

// ============================================================================
// Endpoints — Surgeon Settings
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getSettingsSurgeons(token: string): Promise<{ surgeons: SurgeonSettings[] }> {
  return request('/settings/surgeons', { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateSurgeonSettings(
  token: string,
  surgeonId: string,
  data: { displayColor?: string | null }
): Promise<{ success: boolean }> {
  return request(`/settings/surgeons/${surgeonId}`, { method: 'PATCH', body: data, token });
}

// ============================================================================
// Endpoints — Config Items
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getConfigItems(
  token: string,
  itemType?: ConfigItemType,
  includeInactive?: boolean
): Promise<{ items: ConfigItem[] }> {
  const params = new URLSearchParams();
  if (itemType) params.set('itemType', itemType);
  if (includeInactive) params.set('includeInactive', 'true');
  const queryString = params.toString();
  return request(`/general-settings/config-items${queryString ? `?${queryString}` : ''}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createConfigItem(
  token: string,
  data: CreateConfigItemRequest
): Promise<{ item: ConfigItem }> {
  return request('/general-settings/config-items', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateConfigItem(
  token: string,
  id: string,
  data: UpdateConfigItemRequest
): Promise<{ item: ConfigItem }> {
  return request(`/general-settings/config-items/${id}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deactivateConfigItem(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/general-settings/config-items/${id}/deactivate`, { method: 'POST', token });
}

// TODO(api-schema): needs Zod request + response schema
export async function activateConfigItem(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  return request(`/general-settings/config-items/${id}/activate`, { method: 'POST', token });
}

// TODO(api-schema): needs Zod request + response schema
export async function reorderConfigItems(
  token: string,
  itemType: ConfigItemType,
  orderedIds: string[]
): Promise<{ success: boolean }> {
  return request('/general-settings/config-items/reorder', { method: 'PUT', body: { itemType, orderedIds }, token });
}

// ============================================================================
// Endpoints — Locations
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getLocations(
  token: string,
  includeInactive = false
): Promise<{ locations: Location[] }> {
  const qs = includeInactive ? '?includeInactive=true' : '';
  return request(`/locations${qs}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getLocation(token: string, locationId: string): Promise<{ location: Location }> {
  return request(`/locations/${locationId}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createLocation(token: string, data: CreateLocationRequest): Promise<{ location: Location }> {
  return request('/locations', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateLocation(token: string, locationId: string, data: UpdateLocationRequest): Promise<{ location: Location }> {
  return request(`/locations/${locationId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function deactivateLocation(token: string, locationId: string): Promise<{ success: boolean }> {
  return request(`/locations/${locationId}/deactivate`, { method: 'POST', body: {}, token });
}

export async function activateLocation(token: string, locationId: string): Promise<{ success: boolean }> {
  return request(`/locations/${locationId}/activate`, { method: 'POST', body: {}, token });
}
