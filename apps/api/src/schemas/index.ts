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
} from '@asc/domain';

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: UserRole,
    facilityId: z.string().uuid(),
    facilityName: z.string(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ============================================================================
// CASE SCHEMAS
// ============================================================================

export const CreateCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:MM
  surgeonId: z.string().uuid(),
  patientMrn: z.string().max(50).optional(),
  procedureName: z.string().min(1).max(255),
  preferenceCardId: z.string().uuid().optional(),
  notes: z.string().optional(),
});
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const UpdateCaseRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  surgeonId: z.string().uuid().optional(),
  patientMrn: z.string().max(50).nullable().optional(),
  procedureName: z.string().min(1).max(255).optional(),
  preferenceCardVersionId: z.string().uuid().nullable().optional(),
  status: CaseStatus.optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateCaseRequest = z.infer<typeof UpdateCaseRequestSchema>;

export const CaseResponseSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledDate: z.string(),
  scheduledTime: z.string().nullable(),
  surgeonId: z.string().uuid(),
  surgeonName: z.string(),
  patientMrn: z.string().nullable(),
  procedureName: z.string(),
  preferenceCardVersionId: z.string().uuid().nullable(),
  status: CaseStatus,
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CaseResponse = z.infer<typeof CaseResponseSchema>;

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
    role: z.string(),
    signedByUserId: z.string().uuid(),
    signedByName: z.string(),
    signedAt: z.string(),
    method: SignatureMethod,
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
