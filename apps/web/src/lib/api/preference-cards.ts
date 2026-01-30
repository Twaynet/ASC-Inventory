/**
 * Preference Cards API module
 */

import { request } from './client';
import type { ItemCategory } from './catalog';

// ============================================================================
// Types
// ============================================================================

export interface PreferenceCardItem {
  catalogId: string;
  catalogName: string;
  category: ItemCategory;
  quantity: number;
  notes: string | null;
}

export interface PreferenceCardVersion {
  id: string;
  versionNumber: number;
  items: PreferenceCardItem[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface PreferenceCard {
  id: string;
  surgeonId: string;
  surgeonName: string;
  procedureName: string;
  description: string | null;
  active: boolean;
  currentVersion: PreferenceCardVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreferenceCardRequest {
  surgeonId: string;
  procedureName: string;
  description?: string;
  items: Array<{ catalogId: string; quantity: number; notes?: string }>;
}

export interface UpdatePreferenceCardRequest {
  procedureName?: string;
  description?: string | null;
}

export interface CreatePreferenceCardVersionRequest {
  items: Array<{ catalogId: string; quantity: number; notes?: string }>;
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getPreferenceCards(
  token: string,
  filters?: { surgeonId?: string; includeInactive?: boolean }
): Promise<{ cards: PreferenceCard[] }> {
  const params = new URLSearchParams();
  if (filters?.surgeonId) params.set('surgeonId', filters.surgeonId);
  if (filters?.includeInactive) params.set('includeInactive', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/preference-cards${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getPreferenceCard(token: string, cardId: string): Promise<{ card: PreferenceCard }> {
  return request(`/preference-cards/${cardId}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getPreferenceCardVersions(token: string, cardId: string): Promise<{ versions: PreferenceCardVersion[] }> {
  return request(`/preference-cards/${cardId}/versions`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createPreferenceCard(token: string, data: CreatePreferenceCardRequest): Promise<{ card: PreferenceCard }> {
  return request('/preference-cards', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updatePreferenceCard(token: string, cardId: string, data: UpdatePreferenceCardRequest): Promise<{ card: PreferenceCard }> {
  return request(`/preference-cards/${cardId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createPreferenceCardVersion(
  token: string,
  cardId: string,
  data: CreatePreferenceCardVersionRequest
): Promise<{ version: PreferenceCardVersion }> {
  return request(`/preference-cards/${cardId}/versions`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function deactivatePreferenceCard(token: string, cardId: string): Promise<{ success: boolean }> {
  return request(`/preference-cards/${cardId}/deactivate`, { method: 'POST', body: {}, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function activatePreferenceCard(token: string, cardId: string): Promise<{ success: boolean }> {
  return request(`/preference-cards/${cardId}/activate`, { method: 'POST', body: {}, token });
}
