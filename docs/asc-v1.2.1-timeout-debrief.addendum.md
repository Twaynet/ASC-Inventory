# v1.2.1 Addendum — OR Time Out + Post-op Debrief Gates (Feature-Flagged)

## Status
This document is an ADDENDUM to the existing v1.2.0 implementation.

### NON-NEGOTIABLE: NO REFACTOR RULE
- Do NOT rename or restructure existing v1.2.0 inventory truth entities, events, readiness logic, or routes.
- Do NOT change existing database tables except to ADD new tables/columns needed for this addendum.
- Do NOT alter existing behavior unless explicitly listed in “Allowed Modifications”.

This addendum introduces **new workflow gates**:
- OR Time Out
- Post-op Debrief

They must be implemented as an extension with a feature flag.

---

## Feature Flag
Add a facility-scoped feature flag:

- `FacilitySettings.EnableTimeoutDebrief` (boolean, default false)

If false:
- no new gates enforced
- screens may be hidden or read-only

If true:
- time out gate required before case start
- debrief gate required before case completion

---

## New Concepts (High Level)
1) A facility can define a Time Out checklist template and a Debrief checklist template.
2) Each checklist is versioned and auditable.
3) For each case, the system creates checklist instances (Time Out and Debrief).
4) Completion requires required items + required role signatures.
5) These are hard stops when feature flag is enabled.

---

## Gate B — Time Out

### Rule
If `EnableTimeoutDebrief = true`, a case cannot be marked “Started” until:
- Time Out checklist is completed
- Required roles have signed

### Checklist Template Requirements (v1 defaults)
Time Out template must support at minimum:
- Patient identity confirmed
- Procedure confirmed
- Site/laterality confirmed
- Consent verified
- Antibiotics status (given / not applicable / pending)
- Implant/special equipment readiness banner (READ-ONLY) sourced from existing readiness state:
  - If readiness is 🟢, show “Inventory Ready”
  - If 🟠, show “Proceeding with acknowledged gaps” + list gaps + surgeon acknowledgment timestamp
  - If 🔴, show “Inventory incomplete” and prevent Time Out completion unless surgeon acknowledgment exists (reuse existing rule)

### Signatures (facility-configurable with defaults)
Defaults:
- Circulator: required
- Surgeon: required
- Anesthesia: optional
- Scrub: optional

---

## Gate C — Debrief

### Rule
If `EnableTimeoutDebrief = true`, a case cannot be marked “Complete” until:
- Debrief checklist completed
- Required roles have signed

### Debrief Template Requirements (v1 defaults)
Debrief template must support at minimum:
- Counts status (correct / exception)
- Specimens (yes/no + details)
- Implants used confirmation (optionally link later)
- Equipment issues (yes/no + short note)
- Improvement opportunity (optional note)

Defaults:
- Circulator: required
- Surgeon: optional
- Scrub: optional

---

## Data Model Additions (ADD ONLY)

### FacilitySettings (if not already present)
- FacilityId (PK/FK)
- EnableTimeoutDebrief (bool default false)

### ChecklistTemplate
- ChecklistTemplateId
- FacilityId
- Type: TimeOut | Debrief
- Name
- IsActive
- CurrentVersionId

### ChecklistTemplateVersion (immutable)
- ChecklistTemplateVersionId
- ChecklistTemplateId
- VersionNumber
- EffectiveAt
- CreatedByUserId
- Items JSON (definitions)

### CaseChecklistInstance
- CaseChecklistInstanceId
- CaseId
- Type: TimeOut | Debrief
- ChecklistTemplateVersionId
- Status: InProgress | Completed
- StartedAt
- CompletedAt
- RoomId (nullable)
- CreatedByUserId

### CaseChecklistResponse
- CaseChecklistResponseId
- CaseChecklistInstanceId
- ItemKey
- Value (string)
- CompletedByUserId
- CompletedAt

### CaseChecklistSignature
- CaseChecklistSignatureId
- CaseChecklistInstanceId
- Role
- SignedByUserId
- SignedAt
- Method (Login | PIN | Badge | KioskTap)

### Room (optional)
- RoomId
- FacilityId
- Name

---

## API Additions (NEW ROUTES ONLY)

- GET /cases/:id/checklists (time out + debrief instances + status)
- POST /cases/:id/checklists/:type/start
- POST /cases/:id/checklists/:type/respond
- POST /cases/:id/checklists/:type/sign
- POST /cases/:id/checklists/:type/complete

Enforce:
- completion requirements
- role-based signing
- feature-flag gating

---

## UI Additions (NEW PAGES ONLY)

### OR Time Out Page (iPad/workstation friendly)
- single case view
- readiness banner (from existing readiness logic)
- checklist items
- signatures
- complete action

### Debrief Page
- single case view
- checklist items
- signatures
- complete action

---

## Allowed Modifications to Existing Code
- Add FacilitySettings + feature flag evaluation
- Add “case start/complete” checks to enforce gates when enabled
- Read existing inventory readiness + surgeon acknowledgment and display it in Time Out UI

No other behavior changes allowed.

---

## Explicitly NOT in scope
- Replacing EMR documentation
- OR scheduling system
- Analytics dashboards beyond simple completion status
- Device-specific drivers
- Refactoring existing readiness logic
