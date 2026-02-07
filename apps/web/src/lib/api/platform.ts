/**
 * Platform Control Plane API module
 *
 * LAW §2.3: Separation at API layer - Platform endpoints distinct from tenant
 * LAW §3.1: PLATFORM_ADMIN is no-tenant identity
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface PlatformHealth {
  status: string;
  timestamp: string;
  version: string;
  plane: string;
}

export interface ConfigKey {
  id: string;
  key: string;
  valueType: 'STRING' | 'BOOLEAN' | 'NUMBER' | 'JSON';
  defaultValue: string | null;
  /** The actual saved platform value (null if not set, falls back to defaultValue) */
  platformValue: string | null;
  /** Version number of the saved platform value */
  platformVersion: number | null;
  allowFacilityOverride: boolean;
  riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  displayName: string;
  description: string | null;
  category: string;
  isSensitive: boolean;
}

export interface ConfigKeyDetail {
  key: ConfigKey;
  platformValue: {
    value: string | null;
    version: number;
    effectiveAt: string;
  } | null;
}

export interface Facility {
  id: string;
  name: string;
}

export interface FacilityOverride {
  key: string;
  displayName: string;
  platformValue: string | null;
  facilityValue: string | null;
  facilityVersion: number | null;
  effectiveValue: string | null;
  effectiveSource: 'PLATFORM' | 'FACILITY' | 'CODE_FALLBACK';
  allowOverride: boolean;
  isSensitive: boolean;
}

export interface AuditLogEntry {
  id: string;
  configKey: string;
  scope: 'PLATFORM' | 'FACILITY';
  facilityId: string | null;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  versionBefore: number | null;
  versionAfter: number | null;
  changeReason: string | null;
  changeNote: string | null;
  actorUserId: string;
  actorName: string;
  actorRoles: string[];
  requestId: string | null;
  createdAt: string;
}

export interface SetConfigInput {
  value: string | null;
  reason?: string;
  note?: string;
}

// ============================================================================
// Health Check
// ============================================================================

export async function getPlatformHealth(token: string): Promise<PlatformHealth> {
  return request('/platform/health', { token });
}

// ============================================================================
// Facilities
// ============================================================================

export async function getFacilities(token: string): Promise<{ facilities: Facility[] }> {
  return request('/platform/facilities', { token });
}

// ============================================================================
// Config Keys
// ============================================================================

export async function getConfigKeys(token: string): Promise<{ keys: ConfigKey[] }> {
  return request('/platform/config/keys', { token });
}

export async function getConfigKey(token: string, key: string): Promise<ConfigKeyDetail> {
  return request(`/platform/config/keys/${encodeURIComponent(key)}`, { token });
}

export async function setConfigKey(
  token: string,
  key: string,
  input: SetConfigInput
): Promise<{ version: number }> {
  return request(`/platform/config/keys/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

// ============================================================================
// Facility Overrides
// ============================================================================

export async function getFacilityOverrides(
  token: string,
  facilityId: string
): Promise<{ facilityId: string; overrides: FacilityOverride[] }> {
  return request(`/platform/config/facilities/${facilityId}/overrides`, { token });
}

export async function setFacilityOverride(
  token: string,
  facilityId: string,
  key: string,
  input: SetConfigInput
): Promise<{ version: number }> {
  return request(
    `/platform/config/facilities/${facilityId}/overrides/${encodeURIComponent(key)}`,
    { method: 'PATCH', body: input, token }
  );
}

export async function clearFacilityOverride(
  token: string,
  facilityId: string,
  key: string,
  reason: string
): Promise<{ cleared: boolean }> {
  return request(
    `/platform/config/facilities/${facilityId}/overrides/${encodeURIComponent(key)}`,
    { method: 'DELETE', body: { reason }, token }
  );
}

// ============================================================================
// Audit Log
// ============================================================================

export async function getAuditLog(
  token: string,
  options?: { key?: string; facilityId?: string; limit?: number; offset?: number }
): Promise<{ entries: AuditLogEntry[] }> {
  const params = new URLSearchParams();
  if (options?.key) params.set('key', options.key);
  if (options?.facilityId) params.set('facilityId', options.facilityId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const query = params.toString();
  return request(`/platform/config/audit${query ? `?${query}` : ''}`, { token });
}
