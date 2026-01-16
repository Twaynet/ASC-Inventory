/**
 * Checklists Service
 *
 * Handles OR Time Out and Post-op Debrief checklist functionality.
 * Feature-flagged workflow gates for surgical cases.
 */

import { query, transaction } from '../db/index.js';
import type {
  ChecklistType as ChecklistTypeEnum,
  ChecklistStatus as ChecklistStatusEnum,
  SignatureMethod as SignatureMethodEnum,
} from '@asc/domain';

// ============================================================================
// TYPES
// ============================================================================

interface FacilitySettingsRow {
  id: string;
  facility_id: string;
  enable_timeout_debrief: boolean;
  created_at: Date;
  updated_at: Date;
}

interface ChecklistTemplateRow {
  id: string;
  facility_id: string;
  type: string;
  name: string;
  is_active: boolean;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ChecklistTemplateVersionRow {
  id: string;
  template_id: string;
  version_number: number;
  items: ChecklistItem[];
  required_signatures: RequiredSignature[];
  effective_at: Date;
  created_by_user_id: string;
  created_at: Date;
}

interface ChecklistInstanceRow {
  id: string;
  case_id: string;
  facility_id: string;
  type: string;
  template_version_id: string;
  status: string;
  room_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

interface ChecklistResponseRow {
  id: string;
  instance_id: string;
  item_key: string;
  value: string;
  completed_by_user_id: string;
  completed_at: Date;
  created_at: Date;
}

interface ChecklistSignatureRow {
  id: string;
  instance_id: string;
  role: string;
  signed_by_user_id: string;
  signed_at: Date;
  method: string;
  created_at: Date;
}

interface RoomRow {
  id: string;
  facility_id: string;
  name: string;
  active: boolean;
}

export interface ChecklistItem {
  key: string;
  label: string;
  type: 'checkbox' | 'select' | 'text' | 'readonly';
  required: boolean;
  options?: string[];
}

export interface RequiredSignature {
  role: string;
  required: boolean;
}

export interface ChecklistResponse {
  itemKey: string;
  value: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: string;
}

export interface ChecklistSignature {
  role: string;
  signedByUserId: string;
  signedByName: string;
  signedAt: string;
  method: string;
}

export interface ChecklistInstance {
  id: string;
  caseId: string;
  facilityId: string;
  type: string;
  status: string;
  templateVersionId: string;
  templateName: string;
  items: ChecklistItem[];
  requiredSignatures: RequiredSignature[];
  responses: ChecklistResponse[];
  signatures: ChecklistSignature[];
  roomId: string | null;
  roomName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface FacilitySettings {
  facilityId: string;
  enableTimeoutDebrief: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// FACILITY SETTINGS
// ============================================================================

export async function getFacilitySettings(facilityId: string): Promise<FacilitySettings | null> {
  const result = await query<FacilitySettingsRow>(`
    SELECT * FROM facility_settings WHERE facility_id = $1
  `, [facilityId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    facilityId: row.facility_id,
    enableTimeoutDebrief: row.enable_timeout_debrief,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function updateFacilitySettings(
  facilityId: string,
  settings: { enableTimeoutDebrief?: boolean }
): Promise<FacilitySettings> {
  const result = await query<FacilitySettingsRow>(`
    INSERT INTO facility_settings (facility_id, enable_timeout_debrief)
    VALUES ($1, $2)
    ON CONFLICT (facility_id) DO UPDATE SET
      enable_timeout_debrief = COALESCE($2, facility_settings.enable_timeout_debrief),
      updated_at = NOW()
    RETURNING *
  `, [facilityId, settings.enableTimeoutDebrief ?? false]);

  const row = result.rows[0];
  return {
    facilityId: row.facility_id,
    enableTimeoutDebrief: row.enable_timeout_debrief,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ============================================================================
// CHECKLIST TEMPLATES
// ============================================================================

async function getChecklistTemplate(
  facilityId: string,
  type: string
): Promise<{ template: ChecklistTemplateRow; version: ChecklistTemplateVersionRow } | null> {
  const templateResult = await query<ChecklistTemplateRow>(`
    SELECT * FROM checklist_template
    WHERE facility_id = $1 AND type = $2 AND is_active = true
  `, [facilityId, type]);

  if (templateResult.rows.length === 0 || !templateResult.rows[0].current_version_id) {
    return null;
  }

  const template = templateResult.rows[0];

  const versionResult = await query<ChecklistTemplateVersionRow>(`
    SELECT * FROM checklist_template_version
    WHERE id = $1
  `, [template.current_version_id]);

  if (versionResult.rows.length === 0) {
    return null;
  }

  return { template, version: versionResult.rows[0] };
}

// ============================================================================
// CHECKLIST INSTANCES
// ============================================================================

async function getUserName(userId: string): Promise<string> {
  const result = await query<{ name: string }>(`
    SELECT name FROM app_user WHERE id = $1
  `, [userId]);
  return result.rows[0]?.name || 'Unknown';
}

async function getRoomName(roomId: string | null): Promise<string | null> {
  if (!roomId) return null;
  const result = await query<{ name: string }>(`
    SELECT name FROM room WHERE id = $1
  `, [roomId]);
  return result.rows[0]?.name || null;
}

async function buildChecklistInstance(
  row: ChecklistInstanceRow,
  template: ChecklistTemplateRow,
  version: ChecklistTemplateVersionRow
): Promise<ChecklistInstance> {
  // Get responses
  const responsesResult = await query<ChecklistResponseRow & { user_name: string }>(`
    SELECT r.*, u.name as user_name
    FROM case_checklist_response r
    JOIN app_user u ON u.id = r.completed_by_user_id
    WHERE r.instance_id = $1
    ORDER BY r.completed_at DESC
  `, [row.id]);

  // Get signatures
  const signaturesResult = await query<ChecklistSignatureRow & { user_name: string }>(`
    SELECT s.*, u.name as user_name
    FROM case_checklist_signature s
    JOIN app_user u ON u.id = s.signed_by_user_id
    WHERE s.instance_id = $1
    ORDER BY s.signed_at
  `, [row.id]);

  const roomName = await getRoomName(row.room_id);

  // De-duplicate responses to get latest per item
  const responseMap = new Map<string, ChecklistResponse>();
  for (const r of responsesResult.rows) {
    if (!responseMap.has(r.item_key)) {
      responseMap.set(r.item_key, {
        itemKey: r.item_key,
        value: r.value,
        completedByUserId: r.completed_by_user_id,
        completedByName: r.user_name,
        completedAt: r.completed_at.toISOString(),
      });
    }
  }

  return {
    id: row.id,
    caseId: row.case_id,
    facilityId: row.facility_id,
    type: row.type,
    status: row.status,
    templateVersionId: row.template_version_id,
    templateName: template.name,
    items: version.items,
    requiredSignatures: version.required_signatures,
    responses: Array.from(responseMap.values()),
    signatures: signaturesResult.rows.map(s => ({
      role: s.role,
      signedByUserId: s.signed_by_user_id,
      signedByName: s.user_name,
      signedAt: s.signed_at.toISOString(),
      method: s.method,
    })),
    roomId: row.room_id,
    roomName,
    startedAt: row.started_at?.toISOString() || null,
    completedAt: row.completed_at?.toISOString() || null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getChecklistsForCase(
  caseId: string,
  facilityId: string
): Promise<{
  featureEnabled: boolean;
  timeout: ChecklistInstance | null;
  debrief: ChecklistInstance | null;
  canStartCase: boolean;
  canCompleteCase: boolean;
}> {
  const settings = await getFacilitySettings(facilityId);
  const featureEnabled = settings?.enableTimeoutDebrief ?? false;

  const instancesResult = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance
    WHERE case_id = $1
  `, [caseId]);

  let timeout: ChecklistInstance | null = null;
  let debrief: ChecklistInstance | null = null;

  for (const row of instancesResult.rows) {
    const templateData = await getChecklistTemplate(facilityId, row.type);
    if (!templateData) continue;

    // Get version that was used for this instance
    const versionResult = await query<ChecklistTemplateVersionRow>(`
      SELECT * FROM checklist_template_version WHERE id = $1
    `, [row.template_version_id]);

    if (versionResult.rows.length === 0) continue;

    const instance = await buildChecklistInstance(row, templateData.template, versionResult.rows[0]);

    if (row.type === 'TIMEOUT') {
      timeout = instance;
    } else if (row.type === 'DEBRIEF') {
      debrief = instance;
    }
  }

  // Calculate gate status
  const canStartCase = !featureEnabled || (timeout?.status === 'COMPLETED');
  const canCompleteCase = !featureEnabled || (debrief?.status === 'COMPLETED');

  return {
    featureEnabled,
    timeout,
    debrief,
    canStartCase,
    canCompleteCase,
  };
}

export async function startChecklist(
  caseId: string,
  facilityId: string,
  type: string,
  userId: string,
  roomId?: string
): Promise<ChecklistInstance> {
  // Check if checklist already exists
  const existing = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance
    WHERE case_id = $1 AND type = $2
  `, [caseId, type]);

  if (existing.rows.length > 0) {
    throw new Error(`${type} checklist already exists for this case`);
  }

  // Get template
  const templateData = await getChecklistTemplate(facilityId, type);
  if (!templateData) {
    throw new Error(`No active ${type} template found for facility`);
  }

  // Validate room if provided
  if (roomId) {
    const roomResult = await query<RoomRow>(`
      SELECT * FROM room WHERE id = $1 AND facility_id = $2 AND active = true
    `, [roomId, facilityId]);
    if (roomResult.rows.length === 0) {
      throw new Error('Invalid room');
    }
  }

  // Create instance
  const result = await query<ChecklistInstanceRow>(`
    INSERT INTO case_checklist_instance (
      case_id, facility_id, type, template_version_id, status,
      room_id, started_at, created_by_user_id
    ) VALUES ($1, $2, $3, $4, 'IN_PROGRESS', $5, NOW(), $6)
    RETURNING *
  `, [caseId, facilityId, type, templateData.version.id, roomId || null, userId]);

  return buildChecklistInstance(result.rows[0], templateData.template, templateData.version);
}

export async function recordResponse(
  instanceId: string,
  itemKey: string,
  value: string,
  userId: string,
  facilityId: string
): Promise<ChecklistInstance> {
  // Get instance
  const instanceResult = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance
    WHERE id = $1 AND facility_id = $2
  `, [instanceId, facilityId]);

  if (instanceResult.rows.length === 0) {
    throw new Error('Checklist instance not found');
  }

  const instance = instanceResult.rows[0];

  if (instance.status === 'COMPLETED') {
    throw new Error('Cannot modify a completed checklist');
  }

  // Validate item key exists in template
  const versionResult = await query<ChecklistTemplateVersionRow>(`
    SELECT * FROM checklist_template_version WHERE id = $1
  `, [instance.template_version_id]);

  if (versionResult.rows.length === 0) {
    throw new Error('Template version not found');
  }

  const items = versionResult.rows[0].items as ChecklistItem[];
  const item = items.find(i => i.key === itemKey);
  if (!item) {
    throw new Error(`Invalid item key: ${itemKey}`);
  }

  // Insert response (append-only)
  await query(`
    INSERT INTO case_checklist_response (
      instance_id, item_key, value, completed_by_user_id, completed_at
    ) VALUES ($1, $2, $3, $4, NOW())
  `, [instanceId, itemKey, value, userId]);

  // Return updated instance
  const templateData = await getChecklistTemplate(facilityId, instance.type);
  if (!templateData) {
    throw new Error('Template not found');
  }

  return buildChecklistInstance(instance, templateData.template, versionResult.rows[0]);
}

export async function addSignature(
  instanceId: string,
  role: string,
  userId: string,
  method: string,
  facilityId: string
): Promise<ChecklistInstance> {
  // Get instance
  const instanceResult = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance
    WHERE id = $1 AND facility_id = $2
  `, [instanceId, facilityId]);

  if (instanceResult.rows.length === 0) {
    throw new Error('Checklist instance not found');
  }

  const instance = instanceResult.rows[0];

  if (instance.status === 'COMPLETED') {
    throw new Error('Cannot modify a completed checklist');
  }

  // Get template version to validate role
  const versionResult = await query<ChecklistTemplateVersionRow>(`
    SELECT * FROM checklist_template_version WHERE id = $1
  `, [instance.template_version_id]);

  if (versionResult.rows.length === 0) {
    throw new Error('Template version not found');
  }

  const requiredSignatures = versionResult.rows[0].required_signatures as RequiredSignature[];
  const signatureDef = requiredSignatures.find(s => s.role === role);
  if (!signatureDef) {
    throw new Error(`Invalid signature role: ${role}`);
  }

  // Check if already signed
  const existingResult = await query<ChecklistSignatureRow>(`
    SELECT * FROM case_checklist_signature
    WHERE instance_id = $1 AND role = $2
  `, [instanceId, role]);

  if (existingResult.rows.length > 0) {
    throw new Error(`${role} has already signed this checklist`);
  }

  // Insert signature
  await query(`
    INSERT INTO case_checklist_signature (
      instance_id, role, signed_by_user_id, signed_at, method
    ) VALUES ($1, $2, $3, NOW(), $4)
  `, [instanceId, role, userId, method]);

  // Return updated instance
  const templateData = await getChecklistTemplate(facilityId, instance.type);
  if (!templateData) {
    throw new Error('Template not found');
  }

  return buildChecklistInstance(instance, templateData.template, versionResult.rows[0]);
}

export async function completeChecklist(
  instanceId: string,
  facilityId: string
): Promise<ChecklistInstance> {
  // Get instance
  const instanceResult = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance
    WHERE id = $1 AND facility_id = $2
  `, [instanceId, facilityId]);

  if (instanceResult.rows.length === 0) {
    throw new Error('Checklist instance not found');
  }

  const instance = instanceResult.rows[0];

  if (instance.status === 'COMPLETED') {
    throw new Error('Checklist is already completed');
  }

  // Get template version
  const versionResult = await query<ChecklistTemplateVersionRow>(`
    SELECT * FROM checklist_template_version WHERE id = $1
  `, [instance.template_version_id]);

  if (versionResult.rows.length === 0) {
    throw new Error('Template version not found');
  }

  const version = versionResult.rows[0];
  const items = version.items as ChecklistItem[];
  const requiredSignatures = version.required_signatures as RequiredSignature[];

  // Get current responses
  const responsesResult = await query<ChecklistResponseRow>(`
    SELECT DISTINCT ON (item_key) *
    FROM case_checklist_response
    WHERE instance_id = $1
    ORDER BY item_key, completed_at DESC
  `, [instanceId]);

  const responseMap = new Map<string, string>();
  for (const r of responsesResult.rows) {
    responseMap.set(r.item_key, r.value);
  }

  // Validate all required items have responses
  for (const item of items) {
    if (item.required && item.type !== 'readonly') {
      const response = responseMap.get(item.key);
      if (!response || response.trim() === '') {
        throw new Error(`Required item "${item.label}" is not completed`);
      }
    }
  }

  // Get current signatures
  const signaturesResult = await query<ChecklistSignatureRow>(`
    SELECT * FROM case_checklist_signature WHERE instance_id = $1
  `, [instanceId]);

  const signedRoles = new Set(signaturesResult.rows.map(s => s.role));

  // Validate all required signatures
  for (const sig of requiredSignatures) {
    if (sig.required && !signedRoles.has(sig.role)) {
      throw new Error(`Required signature from ${sig.role} is missing`);
    }
  }

  // Mark as completed
  await query(`
    UPDATE case_checklist_instance
    SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [instanceId]);

  // Fetch updated instance
  const updatedResult = await query<ChecklistInstanceRow>(`
    SELECT * FROM case_checklist_instance WHERE id = $1
  `, [instanceId]);

  const templateData = await getChecklistTemplate(facilityId, instance.type);
  if (!templateData) {
    throw new Error('Template not found');
  }

  return buildChecklistInstance(updatedResult.rows[0], templateData.template, version);
}

// ============================================================================
// GATE CHECKS (for case status transitions)
// ============================================================================

export async function canStartCase(caseId: string, facilityId: string): Promise<boolean> {
  const settings = await getFacilitySettings(facilityId);
  if (!settings?.enableTimeoutDebrief) {
    return true;
  }

  const result = await query<{ status: string }>(`
    SELECT status FROM case_checklist_instance
    WHERE case_id = $1 AND type = 'TIMEOUT'
  `, [caseId]);

  return result.rows.length > 0 && result.rows[0].status === 'COMPLETED';
}

export async function canCompleteCase(caseId: string, facilityId: string): Promise<boolean> {
  const settings = await getFacilitySettings(facilityId);
  if (!settings?.enableTimeoutDebrief) {
    return true;
  }

  const result = await query<{ status: string }>(`
    SELECT status FROM case_checklist_instance
    WHERE case_id = $1 AND type = 'DEBRIEF'
  `, [caseId]);

  return result.rows.length > 0 && result.rows[0].status === 'COMPLETED';
}

// ============================================================================
// ROOMS
// ============================================================================

export async function getRooms(facilityId: string): Promise<Array<{ id: string; name: string }>> {
  const result = await query<RoomRow>(`
    SELECT * FROM room WHERE facility_id = $1 AND active = true ORDER BY name
  `, [facilityId]);

  return result.rows.map(r => ({ id: r.id, name: r.name }));
}
