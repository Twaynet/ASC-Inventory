/**
 * Catalog API module
 */

import { request, API_BASE } from './client';
import { callContract } from './contract-client';
import { contract } from '@asc/contract';
import {
  CatalogImageResponseSchema,
  AddCatalogImageByUrlRequestSchema,
  UpdateCatalogImageRequestSchema,
} from './schemas';

// ============================================================================
// Types
// ============================================================================

export type ItemCategory = 'IMPLANT' | 'INSTRUMENT' | 'EQUIPMENT' | 'MEDICATION' | 'CONSUMABLE' | 'PPE';
export type Criticality = 'CRITICAL' | 'IMPORTANT' | 'ROUTINE';

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  manufacturer: string | null;
  catalogNumber: string | null;
  requiresSterility: boolean;
  isLoaner: boolean;
  active: boolean;
  requiresLotTracking: boolean;
  requiresSerialTracking: boolean;
  requiresExpirationTracking: boolean;
  criticality: Criticality;
  readinessRequired: boolean;
  expirationWarningDays: number | null;
  substitutable: boolean;
  inventoryCount: number;
  imageCount: number;
  identifierCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCatalogItemRequest {
  name: string;
  description?: string;
  category: ItemCategory;
  manufacturer?: string;
  catalogNumber?: string;
  requiresSterility?: boolean;
  isLoaner?: boolean;
  requiresLotTracking?: boolean;
  requiresSerialTracking?: boolean;
  requiresExpirationTracking?: boolean;
  criticality?: Criticality;
  readinessRequired?: boolean;
  expirationWarningDays?: number | null;
  substitutable?: boolean;
}

export interface UpdateCatalogItemRequest {
  name?: string;
  description?: string | null;
  category?: ItemCategory;
  manufacturer?: string | null;
  catalogNumber?: string | null;
  requiresSterility?: boolean;
  isLoaner?: boolean;
  requiresLotTracking?: boolean;
  requiresSerialTracking?: boolean;
  requiresExpirationTracking?: boolean;
  criticality?: Criticality;
  readinessRequired?: boolean;
  expirationWarningDays?: number | null;
  substitutable?: boolean;
}

export interface CatalogImage {
  id: string;
  catalogId: string;
  kind: 'PRIMARY' | 'REFERENCE';
  caption: string | null;
  sortOrder: number;
  assetUrl: string;
  source: 'URL' | 'UPLOAD';
  createdAt: string;
}

export interface CatalogIdentifier {
  id: string;
  catalogId: string;
  identifierType: string;
  rawValue: string;
  source: string;
  classification: string;
  createdAt: string;
  createdByUserId: string | null;
  creatorName?: string | null;
}

// Catalog Groups
export interface CatalogGroup {
  id: string;
  facilityId: string;
  name: string;
  description: string | null;
  active: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogGroupItem {
  id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  catalogNumber: string | null;
  active: boolean;
}

export interface CreateCatalogGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateCatalogGroupRequest {
  name?: string;
  description?: string | null;
  active?: boolean;
}

// Catalog Sets
export interface CatalogSet {
  id: string;
  facilityId: string;
  name: string;
  category: ItemCategory;
  manufacturer: string | null;
  catalogNumber: string | null;
  active: boolean;
  componentCount: number;
}

export interface SetComponent {
  id: string;
  setCatalogId: string;
  componentCatalogId: string;
  componentName: string;
  componentCategory: ItemCategory;
  componentManufacturer: string | null;
  componentCatalogNumber: string | null;
  requiredQuantity: number;
  optionalQuantity: number;
  notes: string | null;
  createdAt: string;
}

export interface CreateSetComponentRequest {
  componentCatalogId: string;
  requiredQuantity?: number;
  optionalQuantity?: number;
  notes?: string;
}

export interface UpdateSetComponentRequest {
  requiredQuantity?: number;
  optionalQuantity?: number;
  notes?: string | null;
}

// ============================================================================
// Endpoints — Catalog Items
// ============================================================================

export async function getCatalogItems(
  token: string,
  filters?: { category?: ItemCategory; includeInactive?: boolean }
): Promise<{ items: CatalogItem[] }> {
  return callContract(contract.catalog.list, {
    query: {
      category: filters?.category,
      includeInactive: filters?.includeInactive ? 'true' : undefined,
    },
    token,
  }) as Promise<{ items: CatalogItem[] }>;
}

export async function getCatalogItem(token: string, catalogId: string): Promise<{ item: CatalogItem }> {
  return callContract(contract.catalog.get, {
    params: { catalogId },
    token,
  }) as Promise<{ item: CatalogItem }>;
}

export async function createCatalogItem(token: string, data: CreateCatalogItemRequest): Promise<{ item: CatalogItem }> {
  return callContract(contract.catalog.create, {
    body: data,
    token,
  }) as Promise<{ item: CatalogItem }>;
}

export async function updateCatalogItem(token: string, catalogId: string, data: UpdateCatalogItemRequest): Promise<{ item: CatalogItem }> {
  return callContract(contract.catalog.update, {
    params: { catalogId },
    body: data,
    token,
  }) as Promise<{ item: CatalogItem }>;
}

export async function deactivateCatalogItem(token: string, catalogId: string): Promise<{ success: boolean }> {
  return callContract(contract.catalog.deactivate, {
    params: { catalogId },
    token,
  }) as Promise<{ success: boolean }>;
}

export async function activateCatalogItem(token: string, catalogId: string): Promise<{ success: boolean }> {
  return callContract(contract.catalog.activate, {
    params: { catalogId },
    token,
  }) as Promise<{ success: boolean }>;
}

// ============================================================================
// Endpoints — Catalog Images
// ============================================================================

export async function getCatalogImages(
  token: string,
  catalogId: string
): Promise<{ images: CatalogImage[] }> {
  return callContract(contract.catalog.listImages, {
    params: { catalogId },
    token,
  }) as Promise<{ images: CatalogImage[] }>;
}

export async function addCatalogImageByUrl(
  token: string,
  catalogId: string,
  data: {
    assetUrl: string;
    kind?: 'PRIMARY' | 'REFERENCE';
    caption?: string;
    sortOrder?: number;
  }
): Promise<{ image: CatalogImage }> {
  return request(`/catalog/${catalogId}/images`, { method: 'POST', body: data, token, requestSchema: AddCatalogImageByUrlRequestSchema, responseSchema: CatalogImageResponseSchema });
}

// TODO(api-schema): FormData upload — cannot validate with JSON schema
export async function uploadCatalogImage(
  token: string,
  catalogId: string,
  file: File,
  options?: {
    kind?: 'PRIMARY' | 'REFERENCE';
    caption?: string;
    sortOrder?: number;
  }
): Promise<{ image: CatalogImage }> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.kind) formData.append('kind', options.kind);
  if (options?.caption) formData.append('caption', options.caption);
  if (options?.sortOrder !== undefined) formData.append('sortOrder', String(options.sortOrder));

  // fetch-allowlist: FormData upload requires raw fetch (request() only handles JSON)
  const response = await fetch(
    `${API_BASE}/catalog/${catalogId}/images/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || `Upload Error: ${response.status}`);
  }

  return response.json();
}

export async function updateCatalogImage(
  token: string,
  catalogId: string,
  imageId: string,
  data: {
    kind?: 'PRIMARY' | 'REFERENCE';
    caption?: string;
    sortOrder?: number;
  }
): Promise<{ image: CatalogImage }> {
  return request(`/catalog/${catalogId}/images/${imageId}`, { method: 'PATCH', body: data, token, requestSchema: UpdateCatalogImageRequestSchema, responseSchema: CatalogImageResponseSchema });
}

// TODO(api-schema): void DELETE — no response body to validate
export async function deleteCatalogImage(
  token: string,
  catalogId: string,
  imageId: string
): Promise<void> {
  await callContract(contract.catalog.deleteImage, {
    params: { catalogId, imageId },
    token,
  });
}

// ============================================================================
// Endpoints — Catalog Identifiers
// ============================================================================

export async function getCatalogIdentifiers(
  token: string,
  catalogId: string
): Promise<{ identifiers: CatalogIdentifier[] }> {
  return callContract(contract.catalog.listIdentifiers, {
    params: { catalogId },
    token,
  }) as Promise<{ identifiers: CatalogIdentifier[] }>;
}

export async function addCatalogIdentifier(
  token: string,
  catalogId: string,
  data: { rawValue: string; source?: string }
): Promise<{ identifier: CatalogIdentifier; gs1Data: import('./inventory').GS1Data | null }> {
  return callContract(contract.catalog.addIdentifier, {
    params: { catalogId },
    body: data,
    token,
  }) as Promise<{ identifier: CatalogIdentifier; gs1Data: import('./inventory').GS1Data | null }>;
}

export async function deleteCatalogIdentifier(
  token: string,
  catalogId: string,
  identifierId: string
): Promise<void> {
  await callContract(contract.catalog.deleteIdentifier, {
    params: { catalogId, identifierId },
    token,
  });
}

// ============================================================================
// Endpoints — Catalog Groups
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getCatalogGroups(
  token: string,
  includeInactive = false
): Promise<{ groups: CatalogGroup[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return request(`/catalog/groups${query}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createCatalogGroup(
  token: string,
  data: CreateCatalogGroupRequest
): Promise<{ group: CatalogGroup }> {
  return request('/catalog/groups', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateCatalogGroup(
  token: string,
  groupId: string,
  data: UpdateCatalogGroupRequest
): Promise<{ group: CatalogGroup }> {
  return request(`/catalog/groups/${groupId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function getCatalogGroupItems(
  token: string,
  groupId: string,
  includeInactive = false
): Promise<{ items: CatalogGroupItem[] }> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return request(`/catalog/groups/${groupId}/items${query}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function addCatalogGroupItems(
  token: string,
  groupId: string,
  catalogIds: string[]
): Promise<{ success: boolean; addedCount: number }> {
  return request(`/catalog/groups/${groupId}/items`, { method: 'POST', body: { catalogIds }, token });
}

// TODO(api-schema): needs Zod response schema
export async function removeCatalogGroupItem(
  token: string,
  groupId: string,
  catalogId: string
): Promise<{ success: boolean }> {
  return request(`/catalog/groups/${groupId}/items/${catalogId}`, { method: 'DELETE', token });
}

// ============================================================================
// Endpoints — Catalog Sets
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getCatalogSets(
  token: string,
  includeEmpty = false
): Promise<{ sets: CatalogSet[] }> {
  const query = includeEmpty ? '?includeEmpty=true' : '';
  return request(`/catalog/sets${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getSetComponents(
  token: string,
  catalogId: string
): Promise<{ setCatalogId: string; components: SetComponent[] }> {
  return request(`/catalog/sets/${catalogId}/components`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function addSetComponent(
  token: string,
  catalogId: string,
  data: CreateSetComponentRequest
): Promise<{ component: SetComponent }> {
  return request(`/catalog/sets/${catalogId}/components`, { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function updateSetComponent(
  token: string,
  catalogId: string,
  componentId: string,
  data: UpdateSetComponentRequest
): Promise<{ component: SetComponent }> {
  return request(`/catalog/sets/${catalogId}/components/${componentId}`, { method: 'PATCH', body: data, token });
}

// TODO(api-schema): needs Zod response schema
export async function removeSetComponent(
  token: string,
  catalogId: string,
  componentId: string
): Promise<{ success: boolean }> {
  return request(`/catalog/sets/${catalogId}/components/${componentId}`, { method: 'DELETE', token });
}
