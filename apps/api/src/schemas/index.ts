/**
 * API Request/Response Schemas
 * Zod schemas for validating API payloads
 */

import { z } from 'zod';
import {
  UserRole,
  CaseStatus,
  SterilityStatus,
  InventoryEventType,
  AttestationType,
  DeviceType,
  DevicePayloadType,
  ReadinessState,
  ChecklistType,
  ChecklistStatus,
  SignatureMethod,
  ItemCategory,
  Criticality,
} from '@asc/domain';

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const LoginRequestSchema = z.object({
  facilityKey: z.string().min(1).max(20),
  username: z.string().min(3).max(100),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email().nullable(),
    name: z.string(),
    role: UserRole, // Primary role (backward compat)
    roles: z.array(UserRole), // All assigned roles
    facilityId: z.string().uuid(),
    facilityName: z.string(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ============================================================================
// USER MANAGEMENT SCHEMAS (ADMIN only)
// ============================================================================

// Username validation: 3-100 chars, alphanumeric + _.-
const usernameRegex = /^[a-zA-Z0-9_.-]+$/;

export const CreateUserRequestSchema = z.object({
  username: z.string().min(3).max(100).regex(usernameRegex, 'Username can only contain letters, numbers, underscores, dots, and hyphens'),
  email: z.string().email().optional(),
  name: z.string().min(1).max(255),
  role: UserRole.optional(), // Keep for backward compat
  roles: z.array(UserRole).min(1).optional(), // New: array of roles
  password: z.string().min(8),
}).refine(
  (data) => {
    // Require at least one role source
    return data.role || (data.roles && data.roles.length > 0);
  },
  { message: 'At least one role is required', path: ['roles'] }
).refine(
  (data) => {
    // If ADMIN is among roles, require email
    const allRoles = data.roles || (data.role ? [data.role] : []);
    return !allRoles.includes('ADMIN') || data.email;
  },
  { message: 'Email is required for ADMIN role', path: ['email'] }
);
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  username: z.string().min(3).max(100).regex(usernameRegex, 'Username can only contain letters, numbers, underscores, dots, and hyphens').optional(),
  email: z.string().email().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  role: UserRole.optional(), // Keep for backward compat
  roles: z.array(UserRole).min(1).optional(), // New: array of roles
  password: z.string().min(8).optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email().nullable(),
  name: z.string(),
  role: UserRole, // Primary role (backward compat)
  roles: z.array(UserRole), // All assigned roles
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

// ============================================================================
// CASE SCHEMAS
// ============================================================================

export const CreateCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD, optional until activation
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), // HH:MM or HH:MM:SS
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // User's preferred date
  requestedTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), // HH:MM or HH:MM:SS
  surgeonId: z.string().uuid(),
  procedureName: z.string().min(1).max(255),
  preferenceCardId: z.string().uuid().optional(),
  notes: z.string().optional(),
  /** Optional status - SCHEDULED allows direct scheduling (Admin/Scheduler only) */
  status: z.enum(['REQUESTED', 'SCHEDULED']).optional(),
});
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const UpdateCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(), // HH:MM or HH:MM:SS
  surgeonId: z.string().uuid().optional(),
  procedureName: z.string().min(1).max(255).optional(),
  preferenceCardVersionId: z.string().uuid().nullable().optional(),
  status: CaseStatus.optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateCaseRequest = z.infer<typeof UpdateCaseRequestSchema>;

export const CaseResponseSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledDate: z.string().nullable(),
  scheduledTime: z.string().nullable(),
  requestedDate: z.string().nullable(),
  requestedTime: z.string().nullable(),
  surgeonId: z.string().uuid(),
  surgeonName: z.string(),
  procedureName: z.string(),
  preferenceCardVersionId: z.string().uuid().nullable(),
  status: CaseStatus,
  notes: z.string().nullable(),
  // Active/Inactive workflow
  isActive: z.boolean(),
  activatedAt: z.string().nullable(),
  activatedByUserId: z.string().uuid().nullable(),
  // Cancellation tracking
  isCancelled: z.boolean(),
  cancelledAt: z.string().nullable(),
  cancelledByUserId: z.string().uuid().nullable(),
  // Rejection tracking
  rejectedAt: z.string().nullable(),
  rejectedByUserId: z.string().uuid().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CaseResponse = z.infer<typeof CaseResponseSchema>;

// Case Activation Schema (ADMIN only)
export const ActivateCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD required
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), // HH:MM or HH:MM:SS
});
export type ActivateCaseRequest = z.infer<typeof ActivateCaseRequestSchema>;

// Cancel Case Schema (any user)
export const CancelCaseRequestSchema = z.object({
  reason: z.string().optional(),
});
export type CancelCaseRequest = z.infer<typeof CancelCaseRequestSchema>;

// Approve Case Request Schema (ADMIN/SCHEDULER only)
export const ApproveCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD required
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), // HH:MM or HH:MM:SS
  roomId: z.string().uuid().nullable().optional(), // Optional room assignment
  estimatedDurationMinutes: z.number().int().min(15).max(720).optional(), // 15 min to 12 hours
});
export type ApproveCaseRequest = z.infer<typeof ApproveCaseRequestSchema>;

// Assign Room Request Schema (ADMIN/SCHEDULER only)
export const AssignRoomRequestSchema = z.object({
  roomId: z.string().uuid().nullable(), // null to unassign
  sortOrder: z.number().int().min(0).optional(),
  estimatedDurationMinutes: z.number().int().min(15).max(720).optional(),
});
export type AssignRoomRequest = z.infer<typeof AssignRoomRequestSchema>;

// Reject Case Request Schema (ADMIN/SCHEDULER only)
export const RejectCaseRequestSchema = z.object({
  reason: z.string().min(1).max(500), // Required
});
export type RejectCaseRequest = z.infer<typeof RejectCaseRequestSchema>;

// ============================================================================
// CASE REQUIREMENT (SURGEON OVERRIDE) SCHEMAS
// ============================================================================

export const SetCaseRequirementsRequestSchema = z.object({
  requirements: z.array(z.object({
    catalogId: z.string().uuid(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
  })),
  isSurgeonOverride: z.boolean().default(false),
});
export type SetCaseRequirementsRequest = z.infer<typeof SetCaseRequirementsRequestSchema>;

// ============================================================================
// INVENTORY EVENT SCHEMAS
// ============================================================================

export const CreateInventoryEventRequestSchema = z.object({
  inventoryItemId: z.string().uuid(),
  eventType: InventoryEventType,
  caseId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  notes: z.string().optional(),
  deviceEventId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(), // Defaults to now
});
export type CreateInventoryEventRequest = z.infer<typeof CreateInventoryEventRequestSchema>;

export const BulkInventoryEventRequestSchema = z.object({
  events: z.array(CreateInventoryEventRequestSchema).min(1).max(100),
});
export type BulkInventoryEventRequest = z.infer<typeof BulkInventoryEventRequestSchema>;

// ============================================================================
// DEVICE EVENT SCHEMAS (from Device Adapter)
// ============================================================================

export const CreateDeviceEventRequestSchema = z.object({
  deviceId: z.string().uuid(),
  deviceType: DeviceType,
  payloadType: DevicePayloadType,
  rawValue: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});
export type CreateDeviceEventRequest = z.infer<typeof CreateDeviceEventRequestSchema>;

// ============================================================================
// ATTESTATION SCHEMAS
// ============================================================================

export const CreateAttestationRequestSchema = z.object({
  caseId: z.string().uuid(),
  type: AttestationType,
  notes: z.string().optional(),
});
export type CreateAttestationRequest = z.infer<typeof CreateAttestationRequestSchema>;

export const AttestationResponseSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  type: AttestationType,
  attestedByUserId: z.string().uuid(),
  attestedByName: z.string(),
  readinessStateAtTime: ReadinessState,
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type AttestationResponse = z.infer<typeof AttestationResponseSchema>;

// ============================================================================
// DAY-BEFORE READINESS SCHEMAS
// ============================================================================

export const MissingItemSchema = z.object({
  catalogId: z.string().uuid(),
  catalogName: z.string(),
  requiredQuantity: z.number().int().positive(),
  availableQuantity: z.number().int().nonnegative(),
  reason: z.enum([
    'NOT_IN_INVENTORY',
    'INSUFFICIENT_QUANTITY',
    'NOT_STERILE',
    'STERILITY_EXPIRED',
    'NOT_AVAILABLE',
    'NOT_VERIFIED',
    'NOT_LOCATABLE',
  ]),
});

export const CaseReadinessResponseSchema = z.object({
  caseId: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledDate: z.string(),
  scheduledTime: z.string().nullable(),
  procedureName: z.string(),
  surgeonId: z.string().uuid(),
  surgeonName: z.string(),
  readinessState: ReadinessState,
  missingItems: z.array(MissingItemSchema),
  totalRequiredItems: z.number().int().nonnegative(),
  totalVerifiedItems: z.number().int().nonnegative(),
  hasAttestation: z.boolean(),
  attestedAt: z.string().nullable(),
  attestedByName: z.string().nullable(),
  hasSurgeonAcknowledgment: z.boolean(),
  surgeonAcknowledgedAt: z.string().nullable(),
});
export type CaseReadinessResponse = z.infer<typeof CaseReadinessResponseSchema>;

export const DayBeforeReadinessResponseSchema = z.object({
  facilityId: z.string().uuid(),
  facilityName: z.string(),
  targetDate: z.string(),
  cases: z.array(CaseReadinessResponseSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    green: z.number().int().nonnegative(),
    orange: z.number().int().nonnegative(),
    red: z.number().int().nonnegative(),
    attested: z.number().int().nonnegative(),
  }),
});
export type DayBeforeReadinessResponse = z.infer<typeof DayBeforeReadinessResponseSchema>;

// ============================================================================
// PREFERENCE CARD SCHEMAS
// ============================================================================

export const SelectPreferenceCardRequestSchema = z.object({
  preferenceCardId: z.string().uuid(),
});
export type SelectPreferenceCardRequest = z.infer<typeof SelectPreferenceCardRequestSchema>;

// ============================================================================
// CHECKLIST SCHEMAS (OR Time Out & Post-op Debrief)
// ============================================================================

export const StartChecklistRequestSchema = z.object({
  type: ChecklistType,
  roomId: z.string().uuid().optional(),
});
export type StartChecklistRequest = z.infer<typeof StartChecklistRequestSchema>;

export const RespondChecklistRequestSchema = z.object({
  itemKey: z.string().min(1).max(100),
  value: z.string(),
});
export type RespondChecklistRequest = z.infer<typeof RespondChecklistRequestSchema>;

export const SignChecklistRequestSchema = z.object({
  method: SignatureMethod.default('LOGIN'),
  flaggedForReview: z.boolean().default(false),
  flagComment: z.string().max(1000).optional(),
});
export type SignChecklistRequest = z.infer<typeof SignChecklistRequestSchema>;

export const CompleteChecklistRequestSchema = z.object({});
export type CompleteChecklistRequest = z.infer<typeof CompleteChecklistRequestSchema>;

// Checklist Template Item (from JSONB)
export const ChecklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['checkbox', 'select', 'text', 'readonly']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// Checklist Required Signature Definition
export const RequiredSignatureSchema = z.object({
  role: z.string(),
  required: z.boolean(),
});
export type RequiredSignature = z.infer<typeof RequiredSignatureSchema>;

// Checklist Instance Response
export const ChecklistInstanceResponseSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  facilityId: z.string().uuid(),
  type: ChecklistType,
  status: ChecklistStatus,
  templateVersionId: z.string().uuid(),
  templateName: z.string(),
  items: z.array(ChecklistItemSchema),
  requiredSignatures: z.array(RequiredSignatureSchema),
  responses: z.array(z.object({
    itemKey: z.string(),
    value: z.string(),
    completedByUserId: z.string().uuid(),
    completedByName: z.string(),
    completedAt: z.string(),
  })),
  signatures: z.array(z.object({
    id: z.string().uuid(),
    role: z.string(),
    signedByUserId: z.string().uuid(),
    signedByName: z.string(),
    signedAt: z.string(),
    method: SignatureMethod,
    flaggedForReview: z.boolean(),
    resolved: z.boolean(),
    resolvedAt: z.string().nullable(),
    resolvedByName: z.string().nullable(),
  })),
  roomId: z.string().uuid().nullable(),
  roomName: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ChecklistInstanceResponse = z.infer<typeof ChecklistInstanceResponseSchema>;

// Case Checklists Response (all checklists for a case)
export const CaseChecklistsResponseSchema = z.object({
  caseId: z.string().uuid(),
  featureEnabled: z.boolean(),
  timeout: ChecklistInstanceResponseSchema.nullable(),
  debrief: ChecklistInstanceResponseSchema.nullable(),
  canStartCase: z.boolean(),
  canCompleteCase: z.boolean(),
});
export type CaseChecklistsResponse = z.infer<typeof CaseChecklistsResponseSchema>;

// Facility Settings Response
export const FacilitySettingsResponseSchema = z.object({
  facilityId: z.string().uuid(),
  enableTimeoutDebrief: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FacilitySettingsResponse = z.infer<typeof FacilitySettingsResponseSchema>;

// Update Facility Settings Request
export const UpdateFacilitySettingsRequestSchema = z.object({
  enableTimeoutDebrief: z.boolean().optional(),
});
export type UpdateFacilitySettingsRequest = z.infer<typeof UpdateFacilitySettingsRequestSchema>;

// ============================================================================
// LOCATION SCHEMAS
// ============================================================================

export const CreateLocationRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  parentLocationId: z.string().uuid().nullable().optional(),
});
export type CreateLocationRequest = z.infer<typeof CreateLocationRequestSchema>;

export const UpdateLocationRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  parentLocationId: z.string().uuid().nullable().optional(),
});
export type UpdateLocationRequest = z.infer<typeof UpdateLocationRequestSchema>;

// ============================================================================
// ITEM CATALOG SCHEMAS
// ============================================================================

export const CreateCatalogItemRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  category: ItemCategory,
  manufacturer: z.string().max(255).optional(),
  catalogNumber: z.string().max(100).optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  // v1.1 Risk-Intent Extensions
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: Criticality.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().int().positive().nullable().optional(),
  substitutable: z.boolean().optional(),
});
export type CreateCatalogItemRequest = z.infer<typeof CreateCatalogItemRequestSchema>;

export const UpdateCatalogItemRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  category: ItemCategory.optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  catalogNumber: z.string().max(100).nullable().optional(),
  requiresSterility: z.boolean().optional(),
  isLoaner: z.boolean().optional(),
  // v1.1 Risk-Intent Extensions
  requiresLotTracking: z.boolean().optional(),
  requiresSerialTracking: z.boolean().optional(),
  requiresExpirationTracking: z.boolean().optional(),
  criticality: Criticality.optional(),
  readinessRequired: z.boolean().optional(),
  expirationWarningDays: z.number().int().positive().nullable().optional(),
  substitutable: z.boolean().optional(),
});
export type UpdateCatalogItemRequest = z.infer<typeof UpdateCatalogItemRequestSchema>;

// ============================================================================
// CATALOG GROUP SCHEMAS (LAW 4D: Human Organization Only)
// ============================================================================

export const CreateCatalogGroupRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});
export type CreateCatalogGroupRequest = z.infer<typeof CreateCatalogGroupRequestSchema>;

export const UpdateCatalogGroupRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateCatalogGroupRequest = z.infer<typeof UpdateCatalogGroupRequestSchema>;

export const AddGroupItemsRequestSchema = z.object({
  catalogIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AddGroupItemsRequest = z.infer<typeof AddGroupItemsRequestSchema>;

export const CatalogGroupResponseSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CatalogGroupResponse = z.infer<typeof CatalogGroupResponseSchema>;

// ============================================================================
// PREFERENCE CARD SCHEMAS
// ============================================================================

export const PreferenceCardItemSchema = z.object({
  catalogId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().max(255).optional(),
});
export type PreferenceCardItem = z.infer<typeof PreferenceCardItemSchema>;

export const CreatePreferenceCardRequestSchema = z.object({
  surgeonId: z.string().uuid(),
  procedureName: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  items: z.array(PreferenceCardItemSchema).min(1),
});
export type CreatePreferenceCardRequest = z.infer<typeof CreatePreferenceCardRequestSchema>;

export const UpdatePreferenceCardRequestSchema = z.object({
  procedureName: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type UpdatePreferenceCardRequest = z.infer<typeof UpdatePreferenceCardRequestSchema>;

export const CreatePreferenceCardVersionRequestSchema = z.object({
  items: z.array(PreferenceCardItemSchema).min(1),
});
export type CreatePreferenceCardVersionRequest = z.infer<typeof CreatePreferenceCardVersionRequestSchema>;

// ============================================================================
// INVENTORY ITEM CRUD SCHEMAS
// ============================================================================

export const CreateInventoryItemRequestSchema = z.object({
  catalogId: z.string().uuid(),
  serialNumber: z.string().max(100).optional(),
  lotNumber: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  sterilityExpiresAt: z.string().datetime().optional(),
});
export type CreateInventoryItemRequest = z.infer<typeof CreateInventoryItemRequestSchema>;

export const UpdateInventoryItemRequestSchema = z.object({
  serialNumber: z.string().max(100).nullable().optional(),
  lotNumber: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  sterilityStatus: SterilityStatus.optional(),
  sterilityExpiresAt: z.string().datetime().nullable().optional(),
});
export type UpdateInventoryItemRequest = z.infer<typeof UpdateInventoryItemRequestSchema>;

// ============================================================================
// ROOM SCHEMAS
// ============================================================================

export const CreateRoomRequestSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const UpdateRoomRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type UpdateRoomRequest = z.infer<typeof UpdateRoomRequestSchema>;

// ============================================================================
// FACILITY CONFIG ITEM SCHEMAS (General Settings)
// ============================================================================

export const ConfigItemType = z.enum(['PATIENT_FLAG', 'ANESTHESIA_MODALITY']);
export type ConfigItemType = z.infer<typeof ConfigItemType>;

// Key validation: must start with letter, contain only letters, numbers, underscores
const itemKeyRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const CreateConfigItemRequestSchema = z.object({
  itemType: ConfigItemType,
  itemKey: z.string().min(1).max(100).regex(itemKeyRegex, 'Key must start with a letter and contain only letters, numbers, and underscores'),
  displayLabel: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});
export type CreateConfigItemRequest = z.infer<typeof CreateConfigItemRequestSchema>;

export const UpdateConfigItemRequestSchema = z.object({
  displayLabel: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type UpdateConfigItemRequest = z.infer<typeof UpdateConfigItemRequestSchema>;

export const ReorderConfigItemsRequestSchema = z.object({
  itemType: ConfigItemType,
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderConfigItemsRequest = z.infer<typeof ReorderConfigItemsRequestSchema>;

export const ConfigItemResponseSchema = z.object({
  id: z.string().uuid(),
  itemType: ConfigItemType,
  itemKey: z.string(),
  displayLabel: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConfigItemResponse = z.infer<typeof ConfigItemResponseSchema>;

// ============================================================================
// BLOCK TIME SCHEMAS (Room Scheduling)
// ============================================================================

export const CreateBlockTimeRequestSchema = z.object({
  roomId: z.string().uuid(),
  blockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  durationMinutes: z.number().int().min(15).max(480).default(60), // 15 min to 8 hours
  notes: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateBlockTimeRequest = z.infer<typeof CreateBlockTimeRequestSchema>;

export const UpdateBlockTimeRequestSchema = z.object({
  durationMinutes: z.number().int().min(15).max(480).optional(),
  notes: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateBlockTimeRequest = z.infer<typeof UpdateBlockTimeRequestSchema>;

export const BlockTimeResponseSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomName: z.string(),
  blockDate: z.string(),
  durationMinutes: z.number().int(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  createdByUserId: z.string().uuid().nullable(),
});
export type BlockTimeResponse = z.infer<typeof BlockTimeResponseSchema>;

// ============================================================================
// ROOM DAY CONFIG SCHEMAS (Room Start Times)
// ============================================================================

export const SetRoomDayConfigRequestSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/), // HH:MM or HH:MM:SS
});
export type SetRoomDayConfigRequest = z.infer<typeof SetRoomDayConfigRequestSchema>;

export const RoomDayConfigResponseSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  configDate: z.string(),
  startTime: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RoomDayConfigResponse = z.infer<typeof RoomDayConfigResponseSchema>;

// ============================================================================
// DAY SCHEDULE SCHEMAS (Calendar Day View)
// ============================================================================

export const ScheduleItemSchema = z.object({
  type: z.enum(['case', 'block']),
  id: z.string().uuid(),
  sortOrder: z.number().int(),
  durationMinutes: z.number().int(),
  // Case-specific fields
  caseNumber: z.string().optional(),
  procedureName: z.string().optional(),
  surgeonId: z.string().uuid().optional(),
  surgeonName: z.string().optional(),
  scheduledTime: z.string().nullable().optional(),
  status: CaseStatus.optional(),
  // Block-specific fields
  notes: z.string().nullable().optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const RoomScheduleSchema = z.object({
  roomId: z.string().uuid(),
  roomName: z.string(),
  startTime: z.string(), // Default or configured start time
  items: z.array(ScheduleItemSchema),
});
export type RoomSchedule = z.infer<typeof RoomScheduleSchema>;

export const DayScheduleResponseSchema = z.object({
  date: z.string(),
  facilityId: z.string().uuid(),
  rooms: z.array(RoomScheduleSchema),
  unassignedCases: z.array(ScheduleItemSchema),
});
export type DayScheduleResponse = z.infer<typeof DayScheduleResponseSchema>;
