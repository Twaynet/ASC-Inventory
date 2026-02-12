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
export type OrganizationId = string & { readonly __brand: 'OrganizationId' };
export type AffiliationId = string & { readonly __brand: 'AffiliationId' };
export type PhiAccessLogId = string & { readonly __brand: 'PhiAccessLogId' };
export type AccessGrantId = string & { readonly __brand: 'AccessGrantId' };
// Surgery Request (Phase 1 Readiness)
export type ClinicId = string & { readonly __brand: 'ClinicId' };
export type SurgeryRequestId = string & { readonly __brand: 'SurgeryRequestId' };
export type PatientRefId = string & { readonly __brand: 'PatientRefId' };
export type SurgeryRequestChecklistTemplateVersionId = string & { readonly __brand: 'SurgeryRequestChecklistTemplateVersionId' };
export type SurgeryRequestChecklistInstanceId = string & { readonly __brand: 'SurgeryRequestChecklistInstanceId' };
// Financial Readiness (Phase 2)
export type ClinicFinancialDeclarationId = string & { readonly __brand: 'ClinicFinancialDeclarationId' };
export type AscFinancialVerificationId = string & { readonly __brand: 'AscFinancialVerificationId' };
export type FinancialOverrideId = string & { readonly __brand: 'FinancialOverrideId' };

// ============================================================================
// ENUMS
// ============================================================================

export const UserRole = z.enum([
  'PLATFORM_ADMIN',  // LAW §3.1: No-tenant identity for platform operations
  'ADMIN',
  'SCHEDULER',
  'INVENTORY_TECH',
  'CIRCULATOR',
  'SURGEON',
  'SCRUB',
  'ANESTHESIA',
]);
export type UserRole = z.infer<typeof UserRole>;

// ============================================================================
// PHI CLASSIFICATION & ACCESS (PHI_ACCESS_AND_RETENTION_LAW)
// ============================================================================

// PHI Classification — determines visibility rules and retention policy
export const PhiClassification = z.enum(['PHI_CLINICAL', 'PHI_BILLING', 'PHI_AUDIT']);
export type PhiClassification = z.infer<typeof PhiClassification>;

// Purpose of Access — must be declared on every PHI access request
export const AccessPurpose = z.enum([
  'CLINICAL_CARE',   // Active clinical workflows
  'SCHEDULING',      // Case scheduling and coordination
  'BILLING',         // Claims, payment, reconciliation
  'AUDIT',           // Compliance, legal, investigations
  'EMERGENCY',       // Break-glass access (LAW §Emergency)
]);
export type AccessPurpose = z.infer<typeof AccessPurpose>;

// Organization Type — entities that exist within a facility
export const OrganizationType = z.enum([
  'ASC',              // The facility itself as an organization
  'SURGEON_GROUP',    // Multi-surgeon practice
  'OFFICE',           // Surgeon's office staff
  'BILLING_ENTITY',   // External billing (under BAA)
]);
export type OrganizationType = z.infer<typeof OrganizationType>;

// Affiliation Type — relationship between user and organization
export const AffiliationType = z.enum([
  'PRIMARY',     // Primary organizational membership
  'SECONDARY',   // Additional organizational membership
]);
export type AffiliationType = z.infer<typeof AffiliationType>;

// Gender — minimal patient identity for surgical timeout (Phase 6A.1)
export const GenderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']);
export type Gender = z.infer<typeof GenderEnum>;
export const GENDER_VALUES: readonly Gender[] = GenderEnum.options;

// Clinical Care Window defaults (configurable per facility via config_registry)
// Enforcement deferred to Phase 2; constants established now
export const CLINICAL_CARE_WINDOW_DEFAULTS = {
  preOpDays: 7,           // Days before scheduled date
  postCompletionDays: 30, // Days after case completion
} as const;

// PHI Retention defaults (configurable per facility via config_registry)
// Phase 4: Advisory only — NO DELETES
export const PHI_RETENTION_DEFAULTS = {
  billingYears: 7,
  auditYears: 7,
  clinicalYears: 7,
} as const;

// Maps PHI classification to required capability
export const PHI_CLASSIFICATION_TO_CAPABILITY = {
  PHI_CLINICAL: 'PHI_CLINICAL_ACCESS',
  PHI_BILLING: 'PHI_BILLING_ACCESS',
  PHI_AUDIT: 'PHI_AUDIT_ACCESS',
} as const;

// ============================================================================
// CONFIGURATION REGISTRY (LAW §5)
// ============================================================================

// LAW §5.3: Configuration scopes
export const ConfigScope = z.enum(['PLATFORM', 'FACILITY']);
export type ConfigScope = z.infer<typeof ConfigScope>;

// LAW §5.2: Configuration value types
export const ConfigValueType = z.enum(['STRING', 'BOOLEAN', 'NUMBER', 'JSON']);
export type ConfigValueType = z.infer<typeof ConfigValueType>;

// LAW §4.3, §6.4: Risk classification for configuration keys
export const ConfigRiskClass = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type ConfigRiskClass = z.infer<typeof ConfigRiskClass>;

// ============================================================================
// CAPABILITY SYSTEM — single canonical source for role → capability mapping
// ============================================================================

export type Capability =
  | 'CASE_VIEW'
  | 'CASE_CREATE'
  | 'CASE_UPDATE'
  | 'CASE_APPROVE'
  | 'CASE_REJECT'
  | 'CASE_ASSIGN_ROOM'
  | 'CASE_ACTIVATE'
  | 'CASE_CHECKIN_PREOP'  // Check patient in to preoperative area
  | 'CASE_DELETE'
  | 'CASE_CANCEL'
  | 'CASE_PREFERENCE_CARD_LINK'
  | 'VERIFY_SCAN'
  | 'CHECKLIST_ATTEST'
  | 'OR_DEBRIEF'
  | 'OR_TIMEOUT'
  | 'INVENTORY_READ'
  | 'INVENTORY_CHECKIN'
  | 'INVENTORY_MANAGE'
  | 'USER_MANAGE'
  | 'LOCATION_MANAGE'
  | 'CATALOG_MANAGE'
  | 'REPORTS_VIEW'
  | 'SETTINGS_MANAGE'
  // PHI access capabilities (PHI_ACCESS_AND_RETENTION_LAW)
  | 'PHI_CLINICAL_ACCESS'     // Access PHI_CLINICAL data
  | 'PHI_WRITE_CLINICAL'      // Write PHI_CLINICAL data (Phase 6: patient identity CRUD)
  | 'PHI_PATIENT_SEARCH'      // Search patient identity records (Phase 6B: patient search)
  | 'PHI_BILLING_ACCESS'      // Access PHI_BILLING data
  | 'PHI_AUDIT_ACCESS'        // Access PHI_AUDIT data
  // Organization management
  | 'ORG_MANAGE'              // Create/update organizations
  | 'ORG_AFFILIATION_MANAGE'  // Manage user affiliations
  // Surgery Request (Phase 1 Readiness)
  | 'SURGERY_REQUEST_REVIEW'  // View, return, accept, reject surgery requests
  | 'SURGERY_REQUEST_CONVERT' // Convert accepted surgery request to surgical_case
  // Financial Readiness (Phase 2)
  | 'FINANCIAL_READINESS_VIEW'  // Dashboard + detail view
  | 'FINANCIAL_READINESS_EDIT'  // Record verification + overrides
  // Platform capabilities (LAW §4.2: distinct from tenant capabilities)
  | 'PLATFORM_ADMIN'          // Access to Control Plane
  | 'PLATFORM_CONFIG_VIEW'    // View platform configuration
  | 'PLATFORM_CONFIG_MANAGE'; // Modify platform configuration

/**
 * Role → capability mapping. This is the SINGLE SOURCE OF TRUTH.
 *
 * Policy: CASE_VIEW is granted to all current internal roles (ADMIN, SCHEDULER,
 * SURGEON, CIRCULATOR, SCRUB, INVENTORY_TECH, ANESTHESIA). New roles get NO
 * CASE_VIEW by default — it must be explicitly added here after review.
 */
export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  // LAW §3.1-3.2: PLATFORM_ADMIN is no-tenant identity for Control Plane operations
  // LAW §4.2: Platform capabilities are distinct from tenant capabilities
  PLATFORM_ADMIN: [
    'PLATFORM_ADMIN',
    'PLATFORM_CONFIG_VIEW',
    'PLATFORM_CONFIG_MANAGE',
    // Note: NO tenant capabilities - PLATFORM_ADMIN cannot access tenant data directly
  ],
  SCRUB: ['CASE_VIEW', 'VERIFY_SCAN', 'CHECKLIST_ATTEST', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH'],
  CIRCULATOR: ['CASE_VIEW', 'CHECKLIST_ATTEST', 'OR_DEBRIEF', 'OR_TIMEOUT', 'CASE_CHECKIN_PREOP', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH'],
  INVENTORY_TECH: ['CASE_VIEW', 'INVENTORY_READ', 'INVENTORY_CHECKIN', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH'],
  ADMIN: [
    'USER_MANAGE', 'LOCATION_MANAGE', 'CATALOG_MANAGE',
    'INVENTORY_MANAGE', 'REPORTS_VIEW', 'SETTINGS_MANAGE',
    'CASE_VIEW', 'CASE_CREATE', 'CASE_UPDATE',
    'CASE_APPROVE', 'CASE_REJECT', 'CASE_ASSIGN_ROOM',
    'CASE_ACTIVATE', 'CASE_CHECKIN_PREOP', 'CASE_DELETE', 'CASE_CANCEL', 'CASE_PREFERENCE_CARD_LINK',
    'PHI_CLINICAL_ACCESS', 'PHI_WRITE_CLINICAL', 'PHI_PATIENT_SEARCH', 'PHI_AUDIT_ACCESS', 'ORG_MANAGE', 'ORG_AFFILIATION_MANAGE',
    'SURGERY_REQUEST_REVIEW', 'SURGERY_REQUEST_CONVERT',
    'FINANCIAL_READINESS_VIEW', 'FINANCIAL_READINESS_EDIT',
  ],
  SURGEON: ['CASE_VIEW', 'CASE_CREATE', 'CASE_UPDATE', 'CASE_CANCEL',
    'CASE_PREFERENCE_CARD_LINK', 'CHECKLIST_ATTEST', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH'],
  SCHEDULER: ['CASE_VIEW', 'CASE_CREATE', 'CASE_UPDATE',
    'CASE_APPROVE', 'CASE_REJECT', 'CASE_ASSIGN_ROOM',
    'CASE_ACTIVATE', 'CASE_CHECKIN_PREOP', 'CASE_CANCEL', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH',
    'SURGERY_REQUEST_REVIEW'],
  ANESTHESIA: ['CASE_VIEW', 'CHECKLIST_ATTEST', 'PHI_CLINICAL_ACCESS', 'PHI_PATIENT_SEARCH'],
};

/**
 * Derive the UNION of all capabilities from a user's roles array.
 */
export function deriveCapabilities(roles: UserRole[]): Capability[] {
  const caps = new Set<Capability>();
  for (const role of roles) {
    for (const cap of (ROLE_CAPABILITIES[role] || [])) {
      caps.add(cap);
    }
  }
  return Array.from(caps);
}

export const CaseStatus = z.enum([
  'DRAFT',
  'REQUESTED',
  'SCHEDULED',
  'IN_PREOP',      // Patient checked into preoperative area
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

// LAW catalog.md v2.0 §4A: Engine Category (immutable without LAW amendment)
export const ItemCategory = z.enum([
  'IMPLANT',
  'INSTRUMENT',
  'EQUIPMENT',
  'MEDICATION',
  'CONSUMABLE',
  'PPE',
]);
export type ItemCategory = z.infer<typeof ItemCategory>;

// v1.1: Criticality classification for alarm priority
export const Criticality = z.enum([
  'CRITICAL',   // Highest alarm priority
  'IMPORTANT',  // Elevated alarm priority
  'ROUTINE',    // Standard alarm priority
]);
export type Criticality = z.infer<typeof Criticality>;

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
// SURGERY REQUEST ENUMS & STATE MACHINE (Phase 1 Readiness)
// ============================================================================

export const SurgeryRequestStatus = z.enum([
  'SUBMITTED',
  'RETURNED_TO_CLINIC',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'CONVERTED',
]);
export type SurgeryRequestStatus = z.infer<typeof SurgeryRequestStatus>;

export const SurgeryRequestEventType = z.enum([
  'SUBMITTED',
  'RESUBMITTED',
  'RETURNED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'CONVERTED',
]);
export type SurgeryRequestEventType = z.infer<typeof SurgeryRequestEventType>;

export const SurgeryRequestActorType = z.enum(['CLINIC', 'ASC']);
export type SurgeryRequestActorType = z.infer<typeof SurgeryRequestActorType>;

export const SurgeryRequestChecklistStatus = z.enum(['PENDING', 'COMPLETE']);
export type SurgeryRequestChecklistStatus = z.infer<typeof SurgeryRequestChecklistStatus>;

export const SurgeryRequestReasonCode = z.enum([
  'MISSING_INFO',
  'INVALID_SURGEON',
  'PROCEDURE_UNCLEAR',
  'DUPLICATE',
  'WRONG_FACILITY',
  'OTHER',
]);
export type SurgeryRequestReasonCode = z.infer<typeof SurgeryRequestReasonCode>;

/**
 * Surgery Request state machine: allowed transitions.
 * Key = current status, Value = array of allowed next statuses.
 */
export const SURGERY_REQUEST_TRANSITIONS: Record<SurgeryRequestStatus, SurgeryRequestStatus[]> = {
  SUBMITTED: ['RETURNED_TO_CLINIC', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  RETURNED_TO_CLINIC: ['SUBMITTED', 'WITHDRAWN'],
  ACCEPTED: ['CONVERTED', 'WITHDRAWN'],
  REJECTED: [],    // terminal
  WITHDRAWN: [],   // terminal
  CONVERTED: [],   // terminal
};

// ============================================================================
// FINANCIAL READINESS ENUMS (Phase 2)
// ============================================================================

export const ClinicFinancialState = z.enum(['UNKNOWN', 'DECLARED_CLEARED', 'DECLARED_AT_RISK']);
export type ClinicFinancialState = z.infer<typeof ClinicFinancialState>;

export const AscFinancialState = z.enum(['UNKNOWN', 'VERIFIED_CLEARED', 'VERIFIED_AT_RISK']);
export type AscFinancialState = z.infer<typeof AscFinancialState>;

export const OverrideState = z.enum(['NONE', 'OVERRIDE_CLEARED', 'OVERRIDE_AT_RISK']);
export type OverrideState = z.infer<typeof OverrideState>;

export const FinancialRiskState = z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH']);
export type FinancialRiskState = z.infer<typeof FinancialRiskState>;

export const OverrideReasonCode = z.enum([
  'ADMIN_JUDGMENT', 'URGENT_CASE', 'CLINIC_CONFIRMED', 'PATIENT_PAID', 'OTHER',
]);
export type OverrideReasonCode = z.infer<typeof OverrideReasonCode>;

export const ClinicFinancialReasonCode = z.enum([
  'MISSING_AUTH', 'HIGH_DEDUCTIBLE', 'COVERAGE_UNCERTAIN', 'SELF_PAY_UNCONFIRMED', 'OTHER',
]);
export type ClinicFinancialReasonCode = z.infer<typeof ClinicFinancialReasonCode>;

export const AscFinancialReasonCode = z.enum([
  'BENEFIT_UNCONFIRMED', 'AUTH_PENDING', 'PATIENT_BALANCE_UNRESOLVED', 'COVERAGE_DENIED', 'OTHER',
]);
export type AscFinancialReasonCode = z.infer<typeof AscFinancialReasonCode>;

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
  /** @deprecated Authorization reads roles[] only. Kept for backward compat. */
  role: UserRole,
  roles: z.array(UserRole).min(1),
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
  // v1.1 Risk-Intent Extensions
  requiresLotTracking: z.boolean().default(false),
  requiresSerialTracking: z.boolean().default(false),
  requiresExpirationTracking: z.boolean().default(false),
  criticality: Criticality.default('ROUTINE'),
  readinessRequired: z.boolean().default(true),
  expirationWarningDays: z.number().int().positive().nullable().default(null),
  substitutable: z.boolean().default(false),
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
