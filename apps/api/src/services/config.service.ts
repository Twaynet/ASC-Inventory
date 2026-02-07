/**
 * Configuration Registry Service
 *
 * LAW §5: Configuration Governance
 * LAW §5.4: Effective config resolved: Facility override → Platform default → Code fallback
 * LAW §5.6: All configuration changes are versioned and audited
 * LAW §11.1: All Control Plane mutations emit immutable audit events
 */

import { query, pool } from '../db/index.js';
import type { ConfigScope, ConfigValueType, ConfigRiskClass } from '@asc/domain';

// ============================================================================
// Types
// ============================================================================

export interface ConfigKey {
  id: string;
  key: string;
  valueType: ConfigValueType;
  defaultValue: string | null;
  allowFacilityOverride: boolean;
  riskClass: ConfigRiskClass;
  displayName: string;
  description: string | null;
  category: string;
  isSensitive: boolean;
  deprecatedAt: Date | null;
  validationSchema: object | null;
}

export interface ConfigValue {
  keyId: string;
  key: string;
  value: string | null;
  version: number;
  effectiveAt: Date;
  source: 'PLATFORM' | 'FACILITY' | 'CODE_FALLBACK';
}

export interface EffectiveConfig {
  key: string;
  value: string | null;
  valueType: ConfigValueType;
  source: 'PLATFORM' | 'FACILITY' | 'CODE_FALLBACK';
  platformVersion: number | null;
  facilityVersion: number | null;
  riskClass: ConfigRiskClass;
  isSensitive: boolean;
}

export interface SetConfigInput {
  value: string | null;
  reason?: string;
  note?: string;
  effectiveAt?: Date;
}

export interface AuditContext {
  actorUserId: string;
  actorName: string;
  actorRoles: string[];
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// Cache (LAW §5.4 - deterministic resolution with performance)
// ============================================================================

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const platformCache = new Map<string, CacheEntry>();
const facilityCache = new Map<string, Map<string, CacheEntry>>(); // facilityId -> key -> entry

export function invalidateConfigCache(key?: string, facilityId?: string): void {
  if (key && facilityId) {
    facilityCache.get(facilityId)?.delete(key);
  } else if (key) {
    platformCache.delete(key);
    // Also invalidate all facility caches for this key
    for (const fc of facilityCache.values()) {
      fc.delete(key);
    }
  } else if (facilityId) {
    facilityCache.delete(facilityId);
  } else {
    platformCache.clear();
    facilityCache.clear();
  }
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all config keys (registry definitions)
 */
export async function getAllConfigKeys(): Promise<ConfigKey[]> {
  const result = await query(`
    SELECT
      id, key, value_type, default_value, allow_facility_override,
      risk_class, display_name, description, category, is_sensitive,
      deprecated_at, validation_schema
    FROM platform_config_key
    WHERE deprecated_at IS NULL
    ORDER BY category, key
  `);

  return result.rows.map(row => ({
    id: row.id,
    key: row.key,
    valueType: row.value_type,
    defaultValue: row.default_value,
    allowFacilityOverride: row.allow_facility_override,
    riskClass: row.risk_class,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    isSensitive: row.is_sensitive,
    deprecatedAt: row.deprecated_at,
    validationSchema: row.validation_schema,
  }));
}

/**
 * Get a single config key by key name
 */
export async function getConfigKey(key: string): Promise<ConfigKey | null> {
  const result = await query(`
    SELECT
      id, key, value_type, default_value, allow_facility_override,
      risk_class, display_name, description, category, is_sensitive,
      deprecated_at, validation_schema
    FROM platform_config_key
    WHERE key = $1
  `, [key]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    key: row.key,
    valueType: row.value_type,
    defaultValue: row.default_value,
    allowFacilityOverride: row.allow_facility_override,
    riskClass: row.risk_class,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    isSensitive: row.is_sensitive,
    deprecatedAt: row.deprecated_at,
    validationSchema: row.validation_schema,
  };
}

/**
 * Get platform config value (latest effective version)
 */
export async function getPlatformConfigValue(key: string): Promise<ConfigValue | null> {
  const result = await query(`
    SELECT
      pv.config_key_id, k.key, pv.value, pv.version, pv.effective_at
    FROM platform_config_value pv
    JOIN platform_config_key k ON k.id = pv.config_key_id
    WHERE k.key = $1 AND pv.effective_at <= NOW()
    ORDER BY pv.effective_at DESC, pv.version DESC
    LIMIT 1
  `, [key]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    keyId: row.config_key_id,
    key: row.key,
    value: row.value,
    version: row.version,
    effectiveAt: row.effective_at,
    source: 'PLATFORM',
  };
}

/**
 * Get facility override value (latest effective version)
 */
export async function getFacilityOverrideValue(
  key: string,
  facilityId: string
): Promise<ConfigValue | null> {
  const result = await query(`
    SELECT
      fo.config_key_id, k.key, fo.override_value as value, fo.version,
      fo.effective_at, fo.cleared_at
    FROM facility_config_override fo
    JOIN platform_config_key k ON k.id = fo.config_key_id
    WHERE k.key = $1 AND fo.facility_id = $2 AND fo.effective_at <= NOW()
    ORDER BY fo.effective_at DESC, fo.version DESC
    LIMIT 1
  `, [key, facilityId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  // If cleared, return null (means use platform default)
  if (row.cleared_at) return null;

  return {
    keyId: row.config_key_id,
    key: row.key,
    value: row.value,
    version: row.version,
    effectiveAt: row.effective_at,
    source: 'FACILITY',
  };
}

/**
 * Get effective config value with resolution (LAW §5.4)
 * Resolves: Facility override → Platform default → Code fallback
 */
export async function getEffectiveConfig(
  key: string,
  facilityId?: string
): Promise<EffectiveConfig | null> {
  const configKey = await getConfigKey(key);
  if (!configKey) return null;

  // Check cache first
  const now = Date.now();
  if (facilityId) {
    const facilityEntry = facilityCache.get(facilityId)?.get(key);
    if (facilityEntry && facilityEntry.expiresAt > now) {
      return {
        key,
        value: facilityEntry.value,
        valueType: configKey.valueType,
        source: 'FACILITY', // Cached, source unknown but doesn't matter for value
        platformVersion: null,
        facilityVersion: null,
        riskClass: configKey.riskClass,
        isSensitive: configKey.isSensitive,
      };
    }
  } else {
    const platformEntry = platformCache.get(key);
    if (platformEntry && platformEntry.expiresAt > now) {
      return {
        key,
        value: platformEntry.value,
        valueType: configKey.valueType,
        source: 'PLATFORM',
        platformVersion: null,
        facilityVersion: null,
        riskClass: configKey.riskClass,
        isSensitive: configKey.isSensitive,
      };
    }
  }

  // Resolve effective value
  let effectiveValue: string | null = configKey.defaultValue;
  let source: 'PLATFORM' | 'FACILITY' | 'CODE_FALLBACK' = 'CODE_FALLBACK';
  let platformVersion: number | null = null;
  let facilityVersion: number | null = null;

  // Get platform value
  const platformValue = await getPlatformConfigValue(key);
  if (platformValue) {
    effectiveValue = platformValue.value;
    source = 'PLATFORM';
    platformVersion = platformValue.version;
  }

  // Get facility override if applicable
  if (facilityId && configKey.allowFacilityOverride) {
    const facilityOverride = await getFacilityOverrideValue(key, facilityId);
    if (facilityOverride) {
      effectiveValue = facilityOverride.value;
      source = 'FACILITY';
      facilityVersion = facilityOverride.version;
    }
  }

  // Update cache
  const cacheEntry: CacheEntry = { value: effectiveValue, expiresAt: now + CACHE_TTL_MS };
  if (facilityId) {
    if (!facilityCache.has(facilityId)) {
      facilityCache.set(facilityId, new Map());
    }
    facilityCache.get(facilityId)!.set(key, cacheEntry);
  } else {
    platformCache.set(key, cacheEntry);
  }

  return {
    key,
    value: effectiveValue,
    valueType: configKey.valueType,
    source,
    platformVersion,
    facilityVersion,
    riskClass: configKey.riskClass,
    isSensitive: configKey.isSensitive,
  };
}

/**
 * Get effective config as typed value
 */
export async function getEffectiveConfigValue(
  key: string,
  facilityId?: string
): Promise<string | boolean | number | object | null> {
  const config = await getEffectiveConfig(key, facilityId);
  if (!config || config.value === null) return null;

  switch (config.valueType) {
    case 'BOOLEAN':
      return config.value === 'true';
    case 'NUMBER':
      return parseFloat(config.value);
    case 'JSON':
      try {
        return JSON.parse(config.value);
      } catch {
        return null;
      }
    default:
      return config.value;
  }
}

// ============================================================================
// Write Operations (with audit, LAW §11.1)
// ============================================================================

/**
 * Set platform config value (creates new version)
 */
export async function setPlatformConfig(
  key: string,
  input: SetConfigInput,
  audit: AuditContext
): Promise<{ version: number }> {
  const configKey = await getConfigKey(key);
  if (!configKey) {
    throw new Error(`Config key not found: ${key}`);
  }

  // Validate risk class requirements (LAW §4.3)
  if (['MEDIUM', 'HIGH', 'CRITICAL'].includes(configKey.riskClass) && !input.reason) {
    throw new Error(`Config key ${key} has risk class ${configKey.riskClass} and requires a reason`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current version
    const currentResult = await client.query(`
      SELECT value, version FROM platform_config_value
      WHERE config_key_id = $1
      ORDER BY version DESC LIMIT 1
    `, [configKey.id]);

    const oldValue = currentResult.rows[0]?.value ?? null;
    const newVersion = (currentResult.rows[0]?.version ?? 0) + 1;

    // Insert new version (LAW §6.1)
    await client.query(`
      INSERT INTO platform_config_value
        (config_key_id, version, value, changed_by_user_id, change_reason, change_note, effective_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      configKey.id,
      newVersion,
      input.value,
      audit.actorUserId,
      input.reason || null,
      input.note || null,
      input.effectiveAt || new Date(),
    ]);

    // Write audit log (LAW §11.1)
    await client.query(`
      INSERT INTO config_audit_log
        (config_key, scope, facility_id, action, old_value, new_value,
         version_before, version_after, change_reason, change_note,
         actor_user_id, actor_name, actor_roles, request_id, ip_address, user_agent)
      VALUES ($1, 'PLATFORM', NULL, 'SET', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      key,
      configKey.isSensitive ? '[REDACTED]' : oldValue,
      configKey.isSensitive ? '[REDACTED]' : input.value,
      newVersion - 1 > 0 ? newVersion - 1 : null,
      newVersion,
      input.reason || null,
      input.note || null,
      audit.actorUserId,
      audit.actorName,
      audit.actorRoles,
      audit.requestId || null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ]);

    await client.query('COMMIT');

    // Invalidate cache
    invalidateConfigCache(key);

    return { version: newVersion };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Set facility config override (creates new version)
 */
export async function setFacilityOverride(
  key: string,
  facilityId: string,
  input: SetConfigInput,
  audit: AuditContext
): Promise<{ version: number }> {
  const configKey = await getConfigKey(key);
  if (!configKey) {
    throw new Error(`Config key not found: ${key}`);
  }

  if (!configKey.allowFacilityOverride) {
    throw new Error(`Config key ${key} does not allow facility override`);
  }

  // Validate risk class requirements
  if (['MEDIUM', 'HIGH', 'CRITICAL'].includes(configKey.riskClass) && !input.reason) {
    throw new Error(`Config key ${key} has risk class ${configKey.riskClass} and requires a reason`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current version
    const currentResult = await client.query(`
      SELECT override_value, version FROM facility_config_override
      WHERE config_key_id = $1 AND facility_id = $2
      ORDER BY version DESC LIMIT 1
    `, [configKey.id, facilityId]);

    const oldValue = currentResult.rows[0]?.override_value ?? null;
    const newVersion = (currentResult.rows[0]?.version ?? 0) + 1;

    // Insert new version
    await client.query(`
      INSERT INTO facility_config_override
        (facility_id, config_key_id, version, override_value, changed_by_user_id,
         change_reason, change_note, effective_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      facilityId,
      configKey.id,
      newVersion,
      input.value,
      audit.actorUserId,
      input.reason || null,
      input.note || null,
      input.effectiveAt || new Date(),
    ]);

    // Write audit log
    await client.query(`
      INSERT INTO config_audit_log
        (config_key, scope, facility_id, action, old_value, new_value,
         version_before, version_after, change_reason, change_note,
         actor_user_id, actor_name, actor_roles, request_id, ip_address, user_agent)
      VALUES ($1, 'FACILITY', $2, 'SET', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      key,
      facilityId,
      configKey.isSensitive ? '[REDACTED]' : oldValue,
      configKey.isSensitive ? '[REDACTED]' : input.value,
      newVersion - 1 > 0 ? newVersion - 1 : null,
      newVersion,
      input.reason || null,
      input.note || null,
      audit.actorUserId,
      audit.actorName,
      audit.actorRoles,
      audit.requestId || null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ]);

    await client.query('COMMIT');

    // Invalidate cache
    invalidateConfigCache(key, facilityId);

    return { version: newVersion };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Clear facility override (reverts to platform default)
 */
export async function clearFacilityOverride(
  key: string,
  facilityId: string,
  reason: string,
  audit: AuditContext
): Promise<void> {
  const configKey = await getConfigKey(key);
  if (!configKey) {
    throw new Error(`Config key not found: ${key}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current override
    const currentResult = await client.query(`
      SELECT id, override_value, version FROM facility_config_override
      WHERE config_key_id = $1 AND facility_id = $2 AND cleared_at IS NULL
      ORDER BY version DESC LIMIT 1
    `, [configKey.id, facilityId]);

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return; // No active override to clear
    }

    const oldValue = currentResult.rows[0].override_value;
    const currentVersion = currentResult.rows[0].version;

    // Mark as cleared (soft delete)
    await client.query(`
      UPDATE facility_config_override
      SET cleared_at = NOW(), cleared_by_user_id = $1
      WHERE id = $2
    `, [audit.actorUserId, currentResult.rows[0].id]);

    // Write audit log
    await client.query(`
      INSERT INTO config_audit_log
        (config_key, scope, facility_id, action, old_value, new_value,
         version_before, version_after, change_reason,
         actor_user_id, actor_name, actor_roles, request_id, ip_address, user_agent)
      VALUES ($1, 'FACILITY', $2, 'CLEAR', $3, NULL, $4, NULL, $5, $6, $7, $8, $9, $10, $11)
    `, [
      key,
      facilityId,
      configKey.isSensitive ? '[REDACTED]' : oldValue,
      currentVersion,
      reason,
      audit.actorUserId,
      audit.actorName,
      audit.actorRoles,
      audit.requestId || null,
      audit.ipAddress || null,
      audit.userAgent || null,
    ]);

    await client.query('COMMIT');

    // Invalidate cache
    invalidateConfigCache(key, facilityId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// Audit Log Queries
// ============================================================================

export interface AuditLogEntry {
  id: string;
  configKey: string;
  scope: ConfigScope;
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
  createdAt: Date;
}

export async function getAuditLog(options: {
  key?: string;
  facilityId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.key) {
    conditions.push(`config_key = $${paramIndex++}`);
    params.push(options.key);
  }

  if (options.facilityId) {
    conditions.push(`facility_id = $${paramIndex++}`);
    params.push(options.facilityId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const result = await query(`
    SELECT
      id, config_key, scope, facility_id, action, old_value, new_value,
      version_before, version_after, change_reason, change_note,
      actor_user_id, actor_name, actor_roles, request_id, created_at
    FROM config_audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...params, limit, offset]);

  return result.rows.map(row => ({
    id: row.id,
    configKey: row.config_key,
    scope: row.scope,
    facilityId: row.facility_id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    versionBefore: row.version_before,
    versionAfter: row.version_after,
    changeReason: row.change_reason,
    changeNote: row.change_note,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorRoles: row.actor_roles,
    requestId: row.request_id,
    createdAt: row.created_at,
  }));
}
