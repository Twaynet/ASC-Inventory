# PHI Blast Radius Map

> Phase 2 Prep: Classification of all API endpoints by PHI exposure.
>
> Generated from codebase analysis against `phi-foundation-v1`.
> This document is an input to Phase 2 wiring decisions — it does NOT authorize changes.

---

## 1. PHI_EXPOSING Routes

These endpoints return or accept data that includes patient-linked clinical information
(procedure name, surgeon-patient linkage, case identifiers, scheduling tied to patients).

### Cases (`/api/cases` — 15 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/cases` | PHI_CLINICAL | CLINICAL_CARE | No (list) | Returns procedureName, surgeonName, dates for all cases |
| POST | `/cases` | PHI_CLINICAL | CLINICAL_CARE | No (creation) | Creates case with clinical data |
| GET | `/cases/:caseId` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Full case object |
| PATCH | `/cases/:caseId` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Updates clinical fields |
| POST | `/cases/:caseId/approve` | PHI_CLINICAL | SCHEDULING | Yes (`:caseId`) | Approve for surgery |
| POST | `/cases/:caseId/reject` | PHI_CLINICAL | SCHEDULING | Yes (`:caseId`) | Reject with reason |
| POST | `/cases/:caseId/activate` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Activate case |
| POST | `/cases/:caseId/deactivate` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Deactivate case |
| POST | `/cases/:caseId/cancel` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Cancel case |
| POST | `/cases/:caseId/check-in-preop` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | PreOp check-in |
| GET | `/cases/:caseId/status-events` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:caseId`) | Case audit trail |
| POST | `/cases/:id/preference-card` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Links card to case |
| PUT | `/cases/:id/requirements` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Case supply needs |
| DELETE | `/cases/:id` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Delete case |
| PATCH | `/cases/:caseId/assign-room` | PHI_CLINICAL | SCHEDULING | Yes (`:caseId`) | Room assignment returns case data |

### Case Dashboard (`/api/case-dashboard` — 13 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/case-dashboard/:caseId` | PHI_CLINICAL | CLINICAL_CARE | Yes | Full workspace: case, readiness, checklists |
| POST | `/case-dashboard/:caseId/attest` | PHI_CLINICAL | CLINICAL_CARE | Yes | Readiness sign-off |
| PUT | `/case-dashboard/:caseId/anesthesia` | PHI_CLINICAL | CLINICAL_CARE | Yes | Anesthesia plan |
| GET | `/case-dashboard/:caseId/event-log` | PHI_CLINICAL | CLINICAL_CARE | Yes | Full case event history |
| PUT | `/case-dashboard/:caseId/case-summary` | PHI_CLINICAL | CLINICAL_CARE | Yes | Case summary fields |
| PUT | `/case-dashboard/:caseId/scheduling` | PHI_CLINICAL | SCHEDULING | Yes | Date/time/room |
| PUT | `/case-dashboard/:caseId/link-case-card` | PHI_CLINICAL | CLINICAL_CARE | Yes | Links card (returns case context) |
| POST | `/case-dashboard/:caseId/case-card-unlink` | PHI_CLINICAL | CLINICAL_CARE | Yes | Unlink card |
| GET | `/case-dashboard/:caseId/case-card-link` | PHI_CLINICAL | CLINICAL_CARE | Yes | Link status |
| POST | `/case-dashboard/:caseId/overrides` | PHI_CLINICAL | CLINICAL_CARE | Yes | Case override |
| PUT | `/case-dashboard/:caseId/overrides/:id` | PHI_CLINICAL | CLINICAL_CARE | Yes | Modify override |
| DELETE | `/case-dashboard/:caseId/overrides/:id` | PHI_CLINICAL | CLINICAL_CARE | Yes | Remove override |
| POST | `/case-dashboard/:caseId/void` | PHI_CLINICAL | CLINICAL_CARE | Yes | Void attestation |

### Checklists — Case-Scoped (`/api/cases/:id/checklists` — 6 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/cases/:id/checklists` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Case checklists |
| POST | `/cases/:id/checklists/start` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Start checklist |
| POST | `/cases/:id/checklists/:type/respond` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Record response |
| POST | `/cases/:id/checklists/:type/sign` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Add signature |
| POST | `/cases/:id/checklists/:type/complete` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Complete checklist |
| POST | `/cases/:id/checklists/debrief/async-review` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Debrief review |

### Readiness (`/api/readiness` — 5 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/readiness/day-before` | PHI_CLINICAL | CLINICAL_CARE | No (multi-case) | Returns procedureName, surgeonName per case |
| GET | `/readiness/cases/:id` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Full case readiness with surgeon/procedure |
| GET | `/readiness/cases/:id/attestations` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Case attestation history |
| GET | `/readiness/cases/:id/verification` | PHI_CLINICAL | CLINICAL_CARE | Yes (`:id`) | Item verification matrix |
| POST | `/readiness/attestations` | PHI_CLINICAL | CLINICAL_CARE | No (caseId in body) | Creates attestation for a case |

### Schedule (`/api/schedule` — 2 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/schedule/day` | PHI_CLINICAL | SCHEDULING | No (multi-case) | Returns procedureName, surgeonName, laterality per case |
| GET | `/schedule/unassigned` | PHI_CLINICAL | SCHEDULING | No (multi-case) | Unassigned cases with procedure/surgeon |

### Reports — Clinical (`/api/reports` — 6 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/reports/case-summary` | PHI_CLINICAL | AUDIT | No (export) | Case data export |
| GET | `/reports/cancelled-cases` | PHI_CLINICAL | AUDIT | No (export) | Cancellation export |
| GET | `/reports/case-timelines` | PHI_CLINICAL | AUDIT | No (export) | Status transitions |
| GET | `/reports/case-event-log` | PHI_CLINICAL | AUDIT | No (export) | Full event log |
| GET | `/reports/checklist-compliance` | PHI_CLINICAL | AUDIT | No (export) | Checklist metrics (case-linked) |
| GET | `/reports/debrief-summary` | PHI_CLINICAL | AUDIT | No (export) | Debrief metrics |

### Reports — Financial (`/api/reports` — 3 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| GET | `/reports/vendor-concessions` | PHI_BILLING | BILLING | No (export) | Vendor cost data |
| GET | `/reports/inventory-valuation` | PHI_BILLING | BILLING | No (export) | On-hand valuation |
| GET | `/reports/loaner-exposure` | PHI_BILLING | BILLING | No (export) | Loaner financial exposure |

### Inventory — Case-Linked (`/api/inventory` — 3 endpoints)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| POST | `/inventory/events` | PHI_CLINICAL | CLINICAL_CARE | No (caseId in body) | Event links item to case |
| POST | `/inventory/events/bulk` | PHI_CLINICAL | CLINICAL_CARE | No (caseId in body) | Bulk events link items to cases |
| GET | `/inventory/items/:itemId/history` | PHI_CLINICAL | CLINICAL_CARE | No (caseId in event rows) | Event history includes caseId, caseName |

### AI (`/api/ai` — 1 endpoint)

| Method | Path | Classification | Default Purpose | Case-Level Check | Notes |
|--------|------|---------------|-----------------|-----------------|-------|
| POST | `/ai/explain-readiness` | PHI_CLINICAL | CLINICAL_CARE | No (caseId in body) | Request body contains caseId, procedureName, surgeonName |

**Total PHI_EXPOSING: ~54 endpoints**

---

## 2. PHI_ADJACENT Routes

These are case-related or operational but do NOT return patient-identifying data in their responses.

| Method | Path | Why Safe |
|--------|------|----------|
| GET | `/readiness/calendar-summary` | Aggregate counts per day (total/green/red) — no case-level detail |
| POST | `/readiness/refresh` | Cache refresh, returns only status |
| POST | `/readiness/attestations/:id/void` | Voids by attestation ID — returns void status only |
| GET | `/pending-reviews` | Review queue metadata — reviewer names, not patient data |
| GET | `/my-pending-reviews` | Personal review queue — same |
| GET | `/flagged-reviews` | QA flags — signature metadata only |
| POST | `/flagged-reviews/:signatureId/resolve` | Resolution status only |
| POST | `/flagged-reviews/:instanceId/resolve-surgeon-flag` | Resolution status only |
| GET | `/surgeon/my-checklists` | Surgeon's checklist queue — metadata references |
| PUT/PATCH | `/surgeon/checklists/:instanceId/feedback` | Surgeon feedback text — no patient data in response |
| POST | `/schedule/block-times` | Room block — no case data |
| PATCH | `/schedule/block-times/:id` | Room block update |
| DELETE | `/schedule/block-times/:id` | Room block delete |
| PUT | `/schedule/rooms/:roomId/day-config` | Room start time config |
| PATCH | `/schedule/reorder` | Drag-drop position only |
| GET | `/inventory/items` | Item list — `reservedForCaseId` is a UUID reference but no patient data exposed |
| GET | `/inventory/items/:itemId` | Single item — same caseId reference concern |
| POST | `/inventory/items` | Create item — no case linkage |
| PATCH | `/inventory/items/:itemId` | Update item location/status |
| POST | `/inventory/events/financial` | Financial event — vendor/cost only |
| POST | `/inventory/device-events` | Device scan — returns `reservedForCaseId` in candidate |
| GET | `/inventory/devices` | Device config list |
| GET | `/inventory/risk-queue` | Risk-scored items — no case data |
| GET | `/reports` | Report catalog — metadata only |
| GET | `/reports/inventory-readiness` | Inventory status — no patient identifiers |
| GET | `/reports/verification-activity` | Staff activity — who verified items, not patient context |

**Note on inventory items:** `GET /inventory/items` and `GET /inventory/items/:itemId` return a
`reservedForCaseId` field. This is a UUID reference — it does not expose procedureName, surgeonName,
or patient data directly. However, a determined actor could cross-reference with case endpoints.
Consider these **borderline** — Phase 2 may choose to guard them or strip the caseId from responses
for users without PHI access.

**Total PHI_ADJACENT: ~26 endpoints**

---

## 3. NON_PHI Routes

These have no connection to patient data, case data, or clinical workflows.

| Route Group | Endpoints | Reason |
|-------------|-----------|--------|
| `/api/auth/*` | 3 | Authentication/session — no patient data |
| `/api/users/*` | 7 | Staff management — names, roles, emails |
| `/api/locations/*` | 6 | Physical facility locations |
| `/api/catalog/*` | 9 | Product catalog — medical supplies |
| `/api/catalog/groups/*` | 6 | Catalog item grouping |
| `/api/catalog/sets/*` | 6 | Kit/container definitions |
| `/api/catalog/:id/images/*` | 5 | Product images |
| `/api/preference-cards/*` | 8 | Surgeon preference templates (not case-bound) |
| `/api/settings/*` | 8 | Rooms, surgeon display config |
| `/api/case-cards/*` | 20 | Procedure templates — not patient-linked; surgeonName is template author |
| `/api/general-settings/*` | 7 | Config items, dropdowns |
| `/api/admin/settings/*` | 5 | Aggregated settings views |
| `/api/vendors/*` | 4 | Vendor CRUD |
| `/api/loaner-sets/*` | 6 | Loaner equipment tracking — vendor/supply data |
| `/api/attention/*` | 1 | Derived alerts — no case/patient identifiers |
| `/api/organizations/*` | 6 | Org management — structural data |
| `/api/platform/*` | 2+ | Control plane — cross-tenant admin |
| `/api/health` | 1 | Health check |

**Total NON_PHI: ~110 endpoints**

---

## Summary

| Classification | Count | Phase 2 Action |
|---------------|-------|----------------|
| **PHI_EXPOSING** | ~54 | Wire `requirePhiAccess()` with appropriate classification and `evaluateCase` |
| **PHI_ADJACENT** | ~26 | Review; borderline cases (inventory caseId references) may need guarding |
| **NON_PHI** | ~110 | No PHI guard needed |

---

## Key Architectural Finding

**Case linkage is the primary PHI vector.** Any endpoint that returns or accepts a `caseId` creates
a transitive link to patient-identifiable information. The ~54 PHI_EXPOSING endpoints cluster
around 6 route files:

1. `cases.routes.ts` (15 endpoints)
2. `case-dashboard.routes.ts` (13 endpoints)
3. `checklists.routes.ts` (6 case-scoped endpoints)
4. `readiness.routes.ts` (5 endpoints)
5. `schedule.routes.ts` (2 endpoints)
6. `reports.routes.ts` (9 endpoints)

Plus 3 endpoints in `inventory.routes.ts` and 1 in `ai.routes.ts`.

These files represent the Phase 2 wiring surface.

---

## Phase 2 Wiring Recommendations

### Endpoint-level `evaluateCase` decisions

- **Routes with `:caseId` param** (cases, case-dashboard, checklists, readiness): use `evaluateCase: true`
- **Multi-case list routes** (GET /cases, /readiness/day-before, /schedule/day): use `evaluateCase: false` — filtering must happen at the query layer (WHERE clause filters by user's affiliated org IDs)
- **Body-based caseId** (POST /readiness/attestations, /inventory/events, /ai/explain-readiness): use `evaluateCase: true` — guard resolves caseId from request body
- **Report exports**: use `evaluateCase: false` — reports are facility-scoped aggregates; PHI capability check is sufficient

### Purpose header strategy

Endpoint-level default purposes are listed in the tables above. See Section D of the Phase 2 prep
report for the full purpose header strategy (default + override approach).
