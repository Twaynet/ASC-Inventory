import { z } from 'zod';

// ============================================================================
// BRANDED TYPES (for type-safe IDs at application level)
// ============================================================================

export type FacilityId = string & { readonly __brand: 'FacilityId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type CaseId = string & { readonly __brand: 'CaseId' };
export type PreferenceCardId = string & { readonly __brand: 'PreferenceCardId' };
export type PreferenceCardVersionId = string & { readonly __brand: 'PreferenceCardVersionId' };
export type CaseRequirementId = string & { readonly __brand: 'CaseRequirementId' };
export type ItemCatalogId = string & { readonly __brand: 'ItemCatalogId' };
export type LocationId = string & { readonly __brand: 'LocationId' };
export type InventoryItemId = string & { readonly __brand: 'InventoryItemId' };
export type InventoryEventId = string & { readonly __brand: 'InventoryEventId' };
export type AttestationId = string & { readonly __brand: 'AttestationId' };
export type DeviceId = string & { readonly __brand: 'DeviceId' };
export type DeviceEventId = string & { readonly __brand: 'DeviceEventId' };

// ============================================================================
// ENUMS
// ============================================================================

export const UserRole = z.enum([
  'ADMIN',
  'SCHEDULER',
  'INVENTORY_TECH',
  'CIRCULATOR',
  'SURGEON',
  'SCRUB',
  'ANESTHESIA',
]);
export type UserRole = z.infer<typeof UserRole>;

export const CaseStatus = z.enum([
  'DRAFT',
  'REQUESTED',
  'SCHEDULED',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const ReadinessState = z.enum([
  'GREEN',   // All required items verified and locatable
  'ORANGE',  // Pending verification (not yet checked)
  'RED',     // Missing items or sterility issues
]);
export type ReadinessState = z.infer<typeof ReadinessState>;

export const ItemCategory = z.enum([
  'IMPLANT',
  'INSTRUMENT',
  'LOANER',
  'HIGH_VALUE_SUPPLY',
]);
export type ItemCategory = z.infer<typeof ItemCategory>;

export const SterilityStatus = z.enum([
  'STERILE',
  'NON_STERILE',
  'EXPIRED',
  'UNKNOWN',
]);
export type SterilityStatus = z.infer<typeof SterilityStatus>;

export const AvailabilityStatus = z.enum([
  'AVAILABLE',
  'RESERVED',
  'IN_USE',
  'UNAVAILABLE',
  'MISSING',
]);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

export const InventoryEventType = z.enum([
  'RECEIVED',           // Item received into facility
  'VERIFIED',           // Item verified present/sterile
  'LOCATION_CHANGED',   // Item moved to new location
  'RESERVED',           // Item reserved for case
  'RELEASED',           // Item released from case reservation
  'CONSUMED',           // Item consumed in case
  'EXPIRED',            // Item marked expired
  'RETURNED',           // Loaner returned
  'ADJUSTED',           // Manual inventory adjustment
]);
export type InventoryEventType = z.infer<typeof InventoryEventType>;

export const AttestationType = z.enum([
  'CASE_READINESS',         // Staff attests case is ready
  'SURGEON_ACKNOWLEDGMENT', // Surgeon acknowledges red state
]);
export type AttestationType = z.infer<typeof AttestationType>;

// ============================================================================
// CORE DOMAIN ENTITIES (Zod Schemas)
// Note: Using plain z.string() for IDs; cast to branded types at application layer
// ============================================================================

export const FacilitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  timezone: z.string(), // IANA timezone (e.g., 'America/New_York')
  address: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Facility = z.infer<typeof FacilitySchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  username: z.string().min(3).max(100),
  email: z.string().email().optional(), // Required for ADMIN, optional for others
  name: z.string().min(1).max(255),
  role: UserRole,
  passwordHash: z.string(), // Never exposed to API
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const LocationSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  parentLocationId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Location = z.infer<typeof LocationSchema>;

export const ItemCatalogSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: ItemCategory,
  manufacturer: z.string().optional(),
  catalogNumber: z.string().optional(),
  requiresSterility: z.boolean().default(true),
  isLoaner: z.boolean().default(false),
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ItemCatalog = z.infer<typeof ItemCatalogSchema>;

export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  catalogId: z.string().uuid(),
  serialNumber: z.string().optional(),
  lotNumber: z.string().optional(),
  barcode: z.string().optional(),
  locationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus,
  sterilityExpiresAt: z.date().optional(),
  availabilityStatus: AvailabilityStatus,
  reservedForCaseId: z.string().uuid().optional(),
  lastVerifiedAt: z.date().optional(),
  lastVerifiedByUserId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const PreferenceCardSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  surgeonId: z.string().uuid(),
  procedureName: z.string().min(1).max(255),
  description: z.string().optional(),
  active: z.boolean().default(true),
  currentVersionId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PreferenceCard = z.infer<typeof PreferenceCardSchema>;

export const PreferenceCardItemSchema = z.object({
  catalogId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});
export type PreferenceCardItem = z.infer<typeof PreferenceCardItemSchema>;

export const PreferenceCardVersionSchema = z.object({
  id: z.string().uuid(),
  preferenceCardId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  items: z.array(PreferenceCardItemSchema),
  createdAt: z.date(),
  createdByUserId: z.string().uuid(),
});
export type PreferenceCardVersion = z.infer<typeof PreferenceCardVersionSchema>;

export const CaseSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledDate: z.date().optional(), // Optional until case is activated
  scheduledTime: z.string().optional(), // HH:MM format
  surgeonId: z.string().uuid(),
  procedureName: z.string().min(1).max(255),
  preferenceCardVersionId: z.string().uuid().optional(),
  status: CaseStatus,
  notes: z.string().optional(),
  // Active/Inactive workflow
  isActive: z.boolean().default(false),
  activatedAt: z.date().optional(),
  activatedByUserId: z.string().uuid().optional(),
  // Cancellation tracking
  isCancelled: z.boolean().default(false),
  cancelledAt: z.date().optional(),
  cancelledByUserId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Case = z.infer<typeof CaseSchema>;

export const CaseRequirementSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  catalogId: z.string().uuid(),
  quantity: z.number().int().positive(),
  isSurgeonOverride: z.boolean().default(false), // True if surgeon added/modified
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CaseRequirement = z.infer<typeof CaseRequirementSchema>;

// ============================================================================
// APPEND-ONLY EVENT TABLES (Immutable)
// ============================================================================

export const InventoryEventSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  eventType: InventoryEventType,
  caseId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  previousLocationId: z.string().uuid().optional(),
  sterilityStatus: SterilityStatus.optional(),
  notes: z.string().optional(),
  performedByUserId: z.string().uuid(),
  deviceEventId: z.string().uuid().optional(), // Links to originating device event
  occurredAt: z.date(),
  createdAt: z.date(), // Immutable
});
export type InventoryEvent = z.infer<typeof InventoryEventSchema>;

export const AttestationSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  caseId: z.string().uuid(),
  type: AttestationType,
  attestedByUserId: z.string().uuid(),
  readinessStateAtTime: ReadinessState,
  notes: z.string().optional(),
  createdAt: z.date(), // Immutable
});
export type Attestation = z.infer<typeof AttestationSchema>;

// ============================================================================
// DEVICE EVENTS (From Device Adapter Layer)
// ============================================================================

export const DeviceType = z.enum(['barcode', 'rfid', 'nfc', 'other']);
export type DeviceType = z.infer<typeof DeviceType>;

export const DevicePayloadType = z.enum(['scan', 'presence', 'input']);
export type DevicePayloadType = z.infer<typeof DevicePayloadType>;

export const DeviceSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  name: z.string().min(1).max(255),
  deviceType: DeviceType,
  locationId: z.string().uuid().optional(),
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceEventSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  deviceId: z.string().uuid(),
  deviceType: DeviceType,
  payloadType: DevicePayloadType,
  rawValue: z.string(),
  processedItemId: z.string().uuid().optional(), // Resolved item
  processed: z.boolean().default(false),
  processingError: z.string().optional(),
  occurredAt: z.date(),
  createdAt: z.date(), // Immutable
});
export type DeviceEvent = z.infer<typeof DeviceEventSchema>;

// ============================================================================
// COMPUTED/MATERIALIZED TYPES (Not stored, computed from events)
// ============================================================================

export const MissingItemReasonSchema = z.object({
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
export type MissingItemReason = z.infer<typeof MissingItemReasonSchema>;

export const CaseReadinessSchema = z.object({
  caseId: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledDate: z.date(),
  procedureName: z.string(),
  surgeonName: z.string(),
  readinessState: ReadinessState,
  missingItems: z.array(MissingItemReasonSchema),
  totalRequiredItems: z.number().int().nonnegative(),
  totalVerifiedItems: z.number().int().nonnegative(),
  hasAttestation: z.boolean(),
  attestedAt: z.date().optional(),
  attestedByName: z.string().optional(),
  hasSurgeonAcknowledgment: z.boolean(),
  surgeonAcknowledgedAt: z.date().optional(),
  computedAt: z.date(),
});
export type CaseReadiness = z.infer<typeof CaseReadinessSchema>;

// ============================================================================
// CHECKLIST TYPES (OR Time Out & Post-op Debrief)
// ============================================================================

// Branded IDs
export type ChecklistTemplateId = string & { readonly __brand: 'ChecklistTemplateId' };
export type ChecklistTemplateVersionId = string & { readonly __brand: 'ChecklistTemplateVersionId' };
export type ChecklistInstanceId = string & { readonly __brand: 'ChecklistInstanceId' };
export type ChecklistResponseId = string & { readonly __brand: 'ChecklistResponseId' };
export type ChecklistSignatureId = string & { readonly __brand: 'ChecklistSignatureId' };
export type RoomId = string & { readonly __brand: 'RoomId' };

// Enums
export const ChecklistType = z.enum(['TIMEOUT', 'DEBRIEF']);
export type ChecklistType = z.infer<typeof ChecklistType>;

export const ChecklistStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
export type ChecklistStatus = z.infer<typeof ChecklistStatus>;

export const SignatureMethod = z.enum(['LOGIN', 'PIN', 'BADGE', 'KIOSK_TAP']);
export type SignatureMethod = z.infer<typeof SignatureMethod>;

export const ChecklistItemType = z.enum(['checkbox', 'text', 'select', 'readonly']);
export type ChecklistItemType = z.infer<typeof ChecklistItemType>;

// Facility Settings
export const FacilitySettingsSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  enableTimeoutDebrief: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type FacilitySettings = z.infer<typeof FacilitySettingsSchema>;

// Room
export const RoomSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  name: z.string().min(1).max(100),
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Room = z.infer<typeof RoomSchema>;

// Checklist Template Item (stored in JSONB)
export const ChecklistTemplateItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: ChecklistItemType,
  required: z.boolean(),
  options: z.array(z.string()).optional(), // For select type
});
export type ChecklistTemplateItem = z.infer<typeof ChecklistTemplateItemSchema>;

// Required Signature (stored in JSONB)
export const RequiredSignatureSchema = z.object({
  role: z.string(),
  required: z.boolean(),
});
export type RequiredSignature = z.infer<typeof RequiredSignatureSchema>;

// Checklist Template
export const ChecklistTemplateSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  type: ChecklistType,
  name: z.string().min(1).max(255),
  isActive: z.boolean().default(true),
  currentVersionId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;

// Checklist Template Version (immutable)
export const ChecklistTemplateVersionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  items: z.array(ChecklistTemplateItemSchema),
  requiredSignatures: z.array(RequiredSignatureSchema),
  effectiveAt: z.date(),
  createdByUserId: z.string().uuid(),
  createdAt: z.date(),
});
export type ChecklistTemplateVersion = z.infer<typeof ChecklistTemplateVersionSchema>;

// Case Checklist Instance
export const CaseChecklistInstanceSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  facilityId: z.string().uuid(),
  type: ChecklistType,
  templateVersionId: z.string().uuid(),
  status: ChecklistStatus,
  roomId: z.string().uuid().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  createdByUserId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CaseChecklistInstance = z.infer<typeof CaseChecklistInstanceSchema>;

// Case Checklist Response (append-only)
export const CaseChecklistResponseSchema = z.object({
  id: z.string().uuid(),
  instanceId: z.string().uuid(),
  itemKey: z.string(),
  value: z.string(),
  completedByUserId: z.string().uuid(),
  completedAt: z.date(),
  createdAt: z.date(),
});
export type CaseChecklistResponse = z.infer<typeof CaseChecklistResponseSchema>;

// Case Checklist Signature (append-only)
export const CaseChecklistSignatureSchema = z.object({
  id: z.string().uuid(),
  instanceId: z.string().uuid(),
  role: z.string(),
  signedByUserId: z.string().uuid(),
  signedAt: z.date(),
  method: SignatureMethod,
  createdAt: z.date(),
});
export type CaseChecklistSignature = z.infer<typeof CaseChecklistSignatureSchema>;
