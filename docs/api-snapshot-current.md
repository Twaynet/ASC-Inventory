# Comprehensive API Contract Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## Overview

- **Framework:** Fastify with Zod validation
- **Auth:** JWT-based (24h expiry)
- **Base URL:** `http://localhost:3001/api` (configurable via `NEXT_PUBLIC_API_URL`)
- **Client Wrapper:** `apps/web/src/lib/api.ts`

---

## 1. Endpoint Index

### Authentication
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/api/auth/login` | No | `auth.routes.ts:27` |
| GET | `/api/auth/me` | Yes | `auth.routes.ts:125` |

### Users
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/users` | Yes | `users.routes.ts` |
| GET | `/api/users/:userId` | Yes | `users.routes.ts` |
| GET | `/api/users/surgeons` | Yes | `users.routes.ts` |
| POST | `/api/users` | Admin | `users.routes.ts` |
| PATCH | `/api/users/:userId` | Admin | `users.routes.ts` |
| POST | `/api/users/:userId/activate` | Admin | `users.routes.ts` |
| POST | `/api/users/:userId/deactivate` | Admin | `users.routes.ts` |

### Cases
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/cases` | Yes | `cases.routes.ts:65` |
| GET | `/api/cases/:caseId` | Yes | `cases.routes.ts` |
| POST | `/api/cases` | Yes | `cases.routes.ts:90` |
| PATCH | `/api/cases/:caseId` | Yes | `cases.routes.ts` |
| DELETE | `/api/cases/:caseId` | Scheduler | `cases.routes.ts` |
| POST | `/api/cases/:caseId/activate` | Scheduler | `cases.routes.ts` |
| POST | `/api/cases/:caseId/deactivate` | Scheduler | `cases.routes.ts` |
| POST | `/api/cases/:caseId/cancel` | Yes | `cases.routes.ts` |
| POST | `/api/cases/:caseId/approve` | Scheduler | `cases.routes.ts` |
| POST | `/api/cases/:caseId/reject` | Scheduler | `cases.routes.ts` |
| PATCH | `/api/cases/:caseId/assign-room` | Scheduler | `cases.routes.ts` |
| GET | `/api/cases/:caseId/checklists` | Yes | `checklists.routes.ts` |
| POST | `/api/cases/:caseId/checklists/start` | Yes | `checklists.routes.ts` |
| POST | `/api/cases/:caseId/checklists/:type/respond` | Yes | `checklists.routes.ts` |
| POST | `/api/cases/:caseId/checklists/:type/sign` | Yes | `checklists.routes.ts` |
| POST | `/api/cases/:caseId/checklists/:type/complete` | Yes | `checklists.routes.ts` |
| POST | `/api/cases/:caseId/checklists/debrief/async-review` | Yes | `checklists.routes.ts` |

### Case Dashboard
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/case-dashboard/:caseId` | Yes | `case-dashboard.routes.ts` |
| POST | `/api/case-dashboard/:caseId/attest` | Yes | `case-dashboard.routes.ts` |
| POST | `/api/case-dashboard/:caseId/void` | Yes | `case-dashboard.routes.ts` |
| PUT | `/api/case-dashboard/:caseId/anesthesia` | Yes | `case-dashboard.routes.ts` |
| PUT | `/api/case-dashboard/:caseId/link-case-card` | Yes | `case-dashboard.routes.ts` |
| PUT | `/api/case-dashboard/:caseId/case-summary` | Yes | `case-dashboard.routes.ts` |
| PUT | `/api/case-dashboard/:caseId/scheduling` | Scheduler | `case-dashboard.routes.ts` |
| POST | `/api/case-dashboard/:caseId/overrides` | Yes | `case-dashboard.routes.ts` |
| PUT | `/api/case-dashboard/:caseId/overrides/:overrideId` | Yes | `case-dashboard.routes.ts` |
| DELETE | `/api/case-dashboard/:caseId/overrides/:overrideId` | Yes | `case-dashboard.routes.ts` |
| GET | `/api/case-dashboard/:caseId/event-log` | Yes | `case-dashboard.routes.ts` |

### Readiness
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/readiness/day-before` | Yes | `readiness.routes.ts` |
| GET | `/api/readiness/calendar-summary` | Yes | `readiness.routes.ts` |
| GET | `/api/readiness/cases/:caseId/verification` | Yes | `readiness.routes.ts` |
| POST | `/api/readiness/attestations` | Yes | `readiness.routes.ts` |
| POST | `/api/readiness/attestations/:attestationId/void` | Yes | `readiness.routes.ts` |
| POST | `/api/readiness/refresh` | Yes | `readiness.routes.ts` |

### Case Cards (SPCs)
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/case-cards` | Yes | `case-cards.routes.ts` |
| GET | `/api/case-cards/surgeons` | Yes | `case-cards.routes.ts` |
| GET | `/api/case-cards/:id` | Yes | `case-cards.routes.ts` |
| GET | `/api/case-cards/:id/edit-log` | Yes | `case-cards.routes.ts` |
| GET | `/api/case-cards/:id/versions` | Yes | `case-cards.routes.ts` |
| POST | `/api/case-cards` | Yes | `case-cards.routes.ts` |
| PUT | `/api/case-cards/:id` | Yes | `case-cards.routes.ts` |
| POST | `/api/case-cards/:id/activate` | Yes | `case-cards.routes.ts` |
| POST | `/api/case-cards/:id/deprecate` | Yes | `case-cards.routes.ts` |
| GET | `/api/case-cards/:id/feedback` | Yes | `case-cards.routes.ts` |
| POST | `/api/case-cards/:id/feedback` | Yes | `case-cards.routes.ts` |
| POST | `/api/case-cards/:id/feedback/:feedbackId/review` | Yes | `case-cards.routes.ts` |

### Preference Cards (Inventory-based)
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/preference-cards` | Yes | `preference-cards.routes.ts` |
| GET | `/api/preference-cards/:cardId` | Yes | `preference-cards.routes.ts` |
| GET | `/api/preference-cards/:cardId/versions` | Yes | `preference-cards.routes.ts` |
| POST | `/api/preference-cards` | Yes | `preference-cards.routes.ts` |
| PATCH | `/api/preference-cards/:cardId` | Yes | `preference-cards.routes.ts` |
| POST | `/api/preference-cards/:cardId/versions` | Yes | `preference-cards.routes.ts` |
| POST | `/api/preference-cards/:cardId/activate` | Yes | `preference-cards.routes.ts` |
| POST | `/api/preference-cards/:cardId/deactivate` | Yes | `preference-cards.routes.ts` |

### Checklists & Reviews
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/checklists/templates` | Admin | `checklists.routes.ts:119` |
| GET | `/api/checklists/templates/:type` | Admin | `checklists.routes.ts:140` |
| PUT | `/api/checklists/templates/:type` | Admin | `checklists.routes.ts` |
| GET | `/api/pending-reviews` | Yes | `checklists.routes.ts` |
| GET | `/api/my-pending-reviews` | Yes | `checklists.routes.ts` |
| GET | `/api/flagged-reviews` | Yes | `checklists.routes.ts` |
| POST | `/api/flagged-reviews/:signatureId/resolve` | Admin | `checklists.routes.ts` |
| POST | `/api/flagged-reviews/:instanceId/resolve-surgeon-flag` | Admin | `checklists.routes.ts` |
| GET | `/api/surgeon/my-checklists` | Surgeon | `checklists.routes.ts` |
| PUT | `/api/surgeon/checklists/:instanceId/feedback` | Surgeon | `checklists.routes.ts` |

### Facility & Settings
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/facility/settings` | Yes | `checklists.routes.ts:44` |
| PATCH | `/api/facility/settings` | Admin | `checklists.routes.ts:68` |
| GET | `/api/rooms` | Yes | `checklists.routes.ts:101` |
| GET | `/api/settings/rooms` | Yes | `settings.routes.ts` |
| POST | `/api/settings/rooms` | Admin | `settings.routes.ts` |
| PATCH | `/api/settings/rooms/:roomId` | Admin | `settings.routes.ts` |
| POST | `/api/settings/rooms/:roomId/activate` | Admin | `settings.routes.ts` |
| POST | `/api/settings/rooms/:roomId/deactivate` | Admin | `settings.routes.ts` |
| POST | `/api/settings/rooms/reorder` | Admin | `settings.routes.ts` |
| GET | `/api/settings/surgeons` | Yes | `settings.routes.ts` |
| PATCH | `/api/settings/surgeons/:surgeonId` | Admin | `settings.routes.ts` |

### General Settings (Config Items)
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/general-settings/config-items` | Yes | `general-settings.routes.ts` |
| POST | `/api/general-settings/config-items` | Admin | `general-settings.routes.ts` |
| PATCH | `/api/general-settings/config-items/:id` | Admin | `general-settings.routes.ts` |
| POST | `/api/general-settings/config-items/:id/activate` | Admin | `general-settings.routes.ts` |
| POST | `/api/general-settings/config-items/:id/deactivate` | Admin | `general-settings.routes.ts` |
| PUT | `/api/general-settings/config-items/reorder` | Admin | `general-settings.routes.ts` |

### Schedule
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/schedule/day` | Yes | `schedule.routes.ts` |
| GET | `/api/schedule/unassigned` | Yes | `schedule.routes.ts` |
| POST | `/api/schedule/block-times` | Scheduler | `schedule.routes.ts` |
| PATCH | `/api/schedule/block-times/:blockTimeId` | Scheduler | `schedule.routes.ts` |
| DELETE | `/api/schedule/block-times/:blockTimeId` | Scheduler | `schedule.routes.ts` |
| PUT | `/api/schedule/rooms/:roomId/day-config` | Scheduler | `schedule.routes.ts` |
| PATCH | `/api/schedule/reorder` | Scheduler | `schedule.routes.ts` |

### Inventory
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/inventory/items` | Yes | `inventory.routes.ts` |
| GET | `/api/inventory/items/:itemId` | Yes | `inventory.routes.ts` |
| GET | `/api/inventory/items/:itemId/history` | Yes | `inventory.routes.ts` |
| POST | `/api/inventory/items` | Admin | `inventory.routes.ts` |
| PATCH | `/api/inventory/items/:itemId` | Admin | `inventory.routes.ts` |
| POST | `/api/inventory/events` | Yes | `inventory.routes.ts` |
| GET | `/api/inventory/devices` | Yes | `inventory.routes.ts` |
| POST | `/api/inventory/device-events` | Yes | `inventory.routes.ts` |

### Locations
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/locations` | Yes | `locations.routes.ts` |
| GET | `/api/locations/:locationId` | Yes | `locations.routes.ts` |
| POST | `/api/locations` | Admin | `locations.routes.ts` |
| PATCH | `/api/locations/:locationId` | Admin | `locations.routes.ts` |
| DELETE | `/api/locations/:locationId` | Admin | `locations.routes.ts` |

### Catalog
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/catalog` | Yes | `catalog.routes.ts` |
| GET | `/api/catalog/:catalogId` | Yes | `catalog.routes.ts` |
| POST | `/api/catalog` | Admin | `catalog.routes.ts` |
| PATCH | `/api/catalog/:catalogId` | Admin | `catalog.routes.ts` |
| POST | `/api/catalog/:catalogId/activate` | Admin | `catalog.routes.ts` |
| POST | `/api/catalog/:catalogId/deactivate` | Admin | `catalog.routes.ts` |

### Reports
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/api/reports` | Yes | `reports.routes.ts` |
| GET | `/api/reports/inventory-readiness` | Yes | `reports.routes.ts` |
| GET | `/api/reports/verification-activity` | Yes | `reports.routes.ts` |
| GET | `/api/reports/checklist-compliance` | Yes | `reports.routes.ts` |
| GET | `/api/reports/case-summary` | Yes | `reports.routes.ts` |

### Health Check
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/health` | No | `index.ts:66` |

---

## 2. Input/Output Shapes

### Authentication

#### POST `/api/auth/login`
**Input (Zod):** `LoginRequestSchema`
```typescript
{
  facilityKey: string; // 1-20 chars
  username: string;    // 3-100 chars
  password: string;    // min 8 chars
}
```

**Output:** `LoginResponse`
```typescript
{
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: string;      // Primary role
    roles: string[];   // All assigned roles
    facilityId: string;
    facilityName: string;
  }
}
```

#### GET `/api/auth/me`
**Output:** `{ user: LoginResponse['user'] }`

---

### Cases

#### POST `/api/cases`
**Input:** `CreateCaseRequestSchema`
```typescript
{
  scheduledDate?: string;     // YYYY-MM-DD
  scheduledTime?: string;     // HH:MM or HH:MM:SS
  requestedDate?: string;
  requestedTime?: string;
  surgeonId: string;          // UUID
  procedureName: string;
  preferenceCardId?: string;  // UUID
  notes?: string;
  status?: 'REQUESTED' | 'SCHEDULED'; // SCHEDULED requires Admin/Scheduler
}
```

**Output:** `{ case: Case }`

#### GET `/api/cases`
**Query:**
- `date?: string` - YYYY-MM-DD
- `status?: string` - REQUESTED, SCHEDULED, COMPLETED, CANCELLED
- `active?: string` - 'true' or 'false'
- `search?: string` - procedure name search

**Output:** `{ cases: Case[] }`

---

### Checklists

#### POST `/api/cases/:caseId/checklists/start`
**Input:** `StartChecklistRequestSchema`
```typescript
{
  type: 'TIMEOUT' | 'DEBRIEF';
  roomId?: string;
}
```

**Output:** `ChecklistInstance`

#### POST `/api/cases/:caseId/checklists/:type/sign`
**Input:** `SignChecklistRequestSchema`
```typescript
{
  method: 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP'; // default: LOGIN
  flaggedForReview: boolean;  // default: false
  flagComment?: string;       // max 1000 chars
}
```

---

### Case Dashboard

#### PUT `/api/case-dashboard/:caseId/case-summary`
**Input:**
```typescript
{
  estimatedDurationMinutes?: number;
  laterality?: string;
  orRoom?: string;
  schedulerNotes?: string;
  caseType?: 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION';
  procedureCodes?: string[];
  patientFlags?: Record<string, boolean>;
  admissionTypes?: Record<string, boolean>;
}
```

---

## 3. Shared Types & Schemas

### Domain Types (from `@asc/domain`)
**File:** `packages/domain/src/index.ts` (inferred)

```typescript
// Roles
type UserRole = 'SCRUB' | 'CIRCULATOR' | 'INVENTORY_TECH' | 'ADMIN' | 'SURGEON' | 'SCHEDULER';

// Case Status
type CaseStatus = 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Readiness
type ReadinessState = 'GREEN' | 'ORANGE' | 'RED';

// Sterility
type SterilityStatus = 'STERILE' | 'NOT_STERILE' | 'EXPIRED' | 'UNKNOWN';

// Inventory Events
type InventoryEventType = 'RECEIVE' | 'VERIFY' | 'LOCATION_CHANGED' | 'STERILITY_CHANGED' | 'CONSUMED' | 'RETURNED';

// Attestation
type AttestationType = 'CASE_READINESS' | 'SURGEON_ACKNOWLEDGMENT';

// Device
type DeviceType = 'barcode' | 'rfid' | 'nfc' | 'other';
type DevicePayloadType = 'scan' | 'presence' | 'input';

// Checklists
type ChecklistType = 'TIMEOUT' | 'DEBRIEF';
type ChecklistStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
type SignatureMethod = 'LOGIN' | 'PIN' | 'BADGE' | 'KIOSK_TAP';

// Catalog
type ItemCategory = 'IMPLANT' | 'INSTRUMENT' | 'HIGH_VALUE_SUPPLY' | 'LOANER';

// Case Cards
type CaseCardStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
type CaseType = 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION';

// Config Items
type ConfigItemType = 'PATIENT_FLAG' | 'ANESTHESIA_MODALITY';

// Anesthesia
type AnesthesiaModality = 'GENERAL' | 'SPINAL' | 'REGIONAL' | 'MAC' | 'LOCAL' | 'TIVA';
```

### Zod Schemas
**File:** `apps/api/src/schemas/index.ts`

| Schema | Purpose |
|--------|---------|
| `LoginRequestSchema` | Auth login input |
| `LoginResponseSchema` | Auth login output |
| `CreateUserRequestSchema` | User creation |
| `UpdateUserRequestSchema` | User update |
| `UserResponseSchema` | User response |
| `CreateCaseRequestSchema` | Case creation |
| `UpdateCaseRequestSchema` | Case update |
| `ActivateCaseRequestSchema` | Case activation |
| `ApproveCaseRequestSchema` | Case approval |
| `RejectCaseRequestSchema` | Case rejection |
| `CancelCaseRequestSchema` | Case cancellation |
| `AssignRoomRequestSchema` | Room assignment |
| `CreateInventoryEventRequestSchema` | Inventory event |
| `CreateDeviceEventRequestSchema` | Device scan event |
| `CreateAttestationRequestSchema` | Attestation |
| `StartChecklistRequestSchema` | Start checklist |
| `RespondChecklistRequestSchema` | Checklist response |
| `SignChecklistRequestSchema` | Checklist signature |
| `CreateLocationRequestSchema` | Location creation |
| `CreateCatalogItemRequestSchema` | Catalog item |
| `CreatePreferenceCardRequestSchema` | Preference card |
| `CreateConfigItemRequestSchema` | Config item |
| `CreateBlockTimeRequestSchema` | Block time |
| `SetRoomDayConfigRequestSchema` | Room day config |

---

## 4. Client Wrapper Mapping

**File:** `apps/web/src/lib/api.ts`

### Base API Function
```typescript
async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T>
```

### Client Functions → Endpoints

| Client Function | Method | Endpoint |
|-----------------|--------|----------|
| `login()` | POST | `/auth/login` |
| `getMe()` | GET | `/auth/me` |
| `getDayBeforeReadiness()` | GET | `/readiness/day-before` |
| `getCalendarSummary()` | GET | `/readiness/calendar-summary` |
| `createAttestation()` | POST | `/readiness/attestations` |
| `voidAttestation()` | POST | `/readiness/attestations/:id/void` |
| `getCaseVerification()` | GET | `/readiness/cases/:caseId/verification` |
| `getCaseCards()` | GET | `/case-cards` |
| `getCaseCard()` | GET | `/case-cards/:id` |
| `createCaseCard()` | POST | `/case-cards` |
| `updateCaseCard()` | PUT | `/case-cards/:id` |
| `activateCaseCard()` | POST | `/case-cards/:id/activate` |
| `deprecateCaseCard()` | POST | `/case-cards/:id/deprecate` |
| `getCaseCardFeedback()` | GET | `/case-cards/:id/feedback` |
| `submitCaseCardFeedback()` | POST | `/case-cards/:id/feedback` |
| `reviewCaseCardFeedback()` | POST | `/case-cards/:id/feedback/:feedbackId/review` |
| `getCases()` | GET | `/cases` |
| `getCase()` | GET | `/cases/:caseId` |
| `createCase()` | POST | `/cases` |
| `updateCase()` | PATCH | `/cases/:caseId` |
| `deleteCase()` | DELETE | `/cases/:caseId` |
| `activateCase()` | POST | `/cases/:caseId/activate` |
| `deactivateCase()` | POST | `/cases/:caseId/deactivate` |
| `cancelCase()` | POST | `/cases/:caseId/cancel` |
| `approveCase()` | POST | `/cases/:caseId/approve` |
| `rejectCase()` | POST | `/cases/:caseId/reject` |
| `assignCaseRoom()` | PATCH | `/cases/:caseId/assign-room` |
| `getCaseDashboard()` | GET | `/case-dashboard/:caseId` |
| `attestCaseReadiness()` | POST | `/case-dashboard/:caseId/attest` |
| `voidCaseAttestation()` | POST | `/case-dashboard/:caseId/void` |
| `updateAnesthesiaPlan()` | PUT | `/case-dashboard/:caseId/anesthesia` |
| `linkCaseCard()` | PUT | `/case-dashboard/:caseId/link-case-card` |
| `updateCaseSummary()` | PUT | `/case-dashboard/:caseId/case-summary` |
| `updateCaseScheduling()` | PUT | `/case-dashboard/:caseId/scheduling` |
| `addCaseOverride()` | POST | `/case-dashboard/:caseId/overrides` |
| `updateCaseOverride()` | PUT | `/case-dashboard/:caseId/overrides/:id` |
| `removeCaseOverride()` | DELETE | `/case-dashboard/:caseId/overrides/:id` |
| `getCaseEventLog()` | GET | `/case-dashboard/:caseId/event-log` |
| `getCaseChecklists()` | GET | `/cases/:caseId/checklists` |
| `startChecklist()` | POST | `/cases/:caseId/checklists/start` |
| `respondToChecklist()` | POST | `/cases/:caseId/checklists/:type/respond` |
| `signChecklist()` | POST | `/cases/:caseId/checklists/:type/sign` |
| `completeChecklist()` | POST | `/cases/:caseId/checklists/:type/complete` |
| `recordAsyncReview()` | POST | `/cases/:caseId/checklists/debrief/async-review` |
| `getPendingReviews()` | GET | `/pending-reviews` |
| `getMyPendingReviews()` | GET | `/my-pending-reviews` |
| `getFlaggedReviews()` | GET | `/flagged-reviews` |
| `resolveFlaggedReview()` | POST | `/flagged-reviews/:signatureId/resolve` |
| `resolveSurgeonFlag()` | POST | `/flagged-reviews/:instanceId/resolve-surgeon-flag` |
| `getSurgeonChecklists()` | GET | `/surgeon/my-checklists` |
| `updateSurgeonFeedback()` | PUT | `/surgeon/checklists/:instanceId/feedback` |
| `getChecklistTemplates()` | GET | `/checklists/templates` |
| `getChecklistTemplate()` | GET | `/checklists/templates/:type` |
| `updateChecklistTemplate()` | PUT | `/checklists/templates/:type` |
| `getUsers()` | GET | `/users` |
| `getUser()` | GET | `/users/:userId` |
| `getSurgeons()` | GET | `/users/surgeons` |
| `createUser()` | POST | `/users` |
| `updateUser()` | PATCH | `/users/:userId` |
| `activateUser()` | POST | `/users/:userId/activate` |
| `deactivateUser()` | POST | `/users/:userId/deactivate` |
| `getLocations()` | GET | `/locations` |
| `getLocation()` | GET | `/locations/:locationId` |
| `createLocation()` | POST | `/locations` |
| `updateLocation()` | PATCH | `/locations/:locationId` |
| `deleteLocation()` | DELETE | `/locations/:locationId` |
| `getCatalogItems()` | GET | `/catalog` |
| `getCatalogItem()` | GET | `/catalog/:catalogId` |
| `createCatalogItem()` | POST | `/catalog` |
| `updateCatalogItem()` | PATCH | `/catalog/:catalogId` |
| `activateCatalogItem()` | POST | `/catalog/:catalogId/activate` |
| `deactivateCatalogItem()` | POST | `/catalog/:catalogId/deactivate` |
| `getPreferenceCards()` | GET | `/preference-cards` |
| `getPreferenceCard()` | GET | `/preference-cards/:cardId` |
| `getPreferenceCardVersions()` | GET | `/preference-cards/:cardId/versions` |
| `createPreferenceCard()` | POST | `/preference-cards` |
| `updatePreferenceCard()` | PATCH | `/preference-cards/:cardId` |
| `createPreferenceCardVersion()` | POST | `/preference-cards/:cardId/versions` |
| `activatePreferenceCard()` | POST | `/preference-cards/:cardId/activate` |
| `deactivatePreferenceCard()` | POST | `/preference-cards/:cardId/deactivate` |
| `getInventoryItems()` | GET | `/inventory/items` |
| `getInventoryItem()` | GET | `/inventory/items/:itemId` |
| `createInventoryItem()` | POST | `/inventory/items` |
| `updateInventoryItem()` | PATCH | `/inventory/items/:itemId` |
| `getInventoryItemHistory()` | GET | `/inventory/items/:itemId/history` |
| `createInventoryEvent()` | POST | `/inventory/events` |
| `getDevices()` | GET | `/inventory/devices` |
| `sendDeviceEvent()` | POST | `/inventory/device-events` |
| `getFacilitySettings()` | GET | `/facility/settings` |
| `updateFacilitySettings()` | PATCH | `/facility/settings` |
| `getRooms()` | GET | `/rooms` |
| `getSettingsRooms()` | GET | `/settings/rooms` |
| `createRoom()` | POST | `/settings/rooms` |
| `updateRoom()` | PATCH | `/settings/rooms/:roomId` |
| `activateRoom()` | POST | `/settings/rooms/:roomId/activate` |
| `deactivateRoom()` | POST | `/settings/rooms/:roomId/deactivate` |
| `reorderRooms()` | POST | `/settings/rooms/reorder` |
| `getSettingsSurgeons()` | GET | `/settings/surgeons` |
| `updateSurgeonSettings()` | PATCH | `/settings/surgeons/:surgeonId` |
| `getConfigItems()` | GET | `/general-settings/config-items` |
| `createConfigItem()` | POST | `/general-settings/config-items` |
| `updateConfigItem()` | PATCH | `/general-settings/config-items/:id` |
| `activateConfigItem()` | POST | `/general-settings/config-items/:id/activate` |
| `deactivateConfigItem()` | POST | `/general-settings/config-items/:id/deactivate` |
| `reorderConfigItems()` | PUT | `/general-settings/config-items/reorder` |
| `getDaySchedule()` | GET | `/schedule/day` |
| `getUnassignedCases()` | GET | `/schedule/unassigned` |
| `createBlockTime()` | POST | `/schedule/block-times` |
| `updateBlockTime()` | PATCH | `/schedule/block-times/:blockTimeId` |
| `deleteBlockTime()` | DELETE | `/schedule/block-times/:blockTimeId` |
| `setRoomDayConfig()` | PUT | `/schedule/rooms/:roomId/day-config` |
| `reorderScheduleItems()` | PATCH | `/schedule/reorder` |
| `getAvailableReports()` | GET | `/reports` |
| `getInventoryReadinessReport()` | GET | `/reports/inventory-readiness` |
| `getVerificationActivityReport()` | GET | `/reports/verification-activity` |
| `getChecklistComplianceReport()` | GET | `/reports/checklist-compliance` |
| `getCaseSummaryReport()` | GET | `/reports/case-summary` |

---

## 5. Error Handling

### Standard Error Shape
```typescript
{
  error: string;
  message?: string;
  details?: object;
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 400 | Validation error (Zod parse failure) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Resource not found |
| 500 | Internal server error |

### Client Error Handling
**File:** `apps/web/src/lib/api.ts:33-35`
```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({ error: 'Unknown error' }));
  throw new Error(error.error || `API Error: ${response.status}`);
}
```

---

## 6. Inconsistencies & Observations

### Naming Inconsistencies

| Pattern A | Pattern B | Notes |
|-----------|-----------|-------|
| `case-cards` | `preference-cards` | Two separate card systems exist |
| `activate` / `deactivate` | `active` (boolean) | Status toggle naming |
| `PATCH` for updates | `PUT` for some updates | Mixed HTTP methods |

### Endpoint Path Observations

1. **Case Cards vs Preference Cards:**
   - `/api/case-cards` - SPC system with versioning, feedback, edit logs
   - `/api/preference-cards` - Simpler inventory-based card system
   - Both exist independently

2. **Settings Routes Split:**
   - `/api/settings/rooms` - Room management
   - `/api/settings/surgeons` - Surgeon display colors
   - `/api/general-settings/config-items` - Config items (patient flags, modalities)
   - `/api/facility/settings` - Feature flags

3. **Checklist Routes Without Prefix:**
   - Registered with `{ prefix: '/api' }` instead of `/api/checklists`
   - Results in mixed paths like `/api/facility/settings`, `/api/rooms`, `/api/checklists/templates`

### Authorization Patterns

1. **Pre-built role checks in `plugins/auth.ts`:**
   ```typescript
   requireAdmin = requireRoles('ADMIN')
   requireScheduler = requireRoles('ADMIN', 'SCHEDULER')
   requireInventoryTech = requireRoles('ADMIN', 'INVENTORY_TECH')
   requireCirculator = requireRoles('ADMIN', 'CIRCULATOR', 'INVENTORY_TECH')
   requireSurgeon = requireRoles('SURGEON')
   ```

2. **Inline role checks in routes:**
   - Some routes check `role !== 'ADMIN'` directly
   - Some use `preHandler: [requireAdmin]`
   - Mixed patterns across files

### Response Shape Variations

| Pattern | Example |
|---------|---------|
| `{ cases: [...] }` | Array wrapped in named key |
| `{ case: {...} }` | Single object wrapped |
| `{ success: true }` | Action confirmation |
| Direct object | Some responses return unwrapped |

---

## Summary Statistics

- **Total Endpoints:** 110+
- **Route Files:** 14
- **Zod Schemas:** 40+
- **Client Functions:** 95+
- **Auth Required:** 107/110 (97%)
- **Admin-Only:** ~30 endpoints
- **Scheduler-Only:** ~15 endpoints
