# PHASE 7 — UI SURFACE COMPLETION
## ASC Inventory Truth

**Status:** Planning Specification  
**Scope:** UI Layer Only  
**Constraint:** No domain model changes unless explicitly required  
**Architecture Rule:** Must respect existing contracts, append-only audit spine, and role-capability enforcement.

---

# OBJECTIVE

Expose existing backend truth layers through operationally meaningful UI surfaces.

The backend already records:
- Append-only event logs
- Financial attribution layers
- Strict state transitions
- Audit trails (case, surgery request, config, auth)
- Cost history
- Device events

Phase 7 makes those visible and actionable.

---

# GLOBAL REQUIREMENTS

All new UI surfaces must:

1. Use existing API wrappers under `apps/web/src/lib/api`
2. Respect role-capability enforcement
3. Preserve append-only truth model (no direct mutation UIs for historical events)
4. Use existing layout hierarchy (App Router structure)
5. Follow existing MudBlazor / Next.js design patterns
6. Avoid introducing new state logic in the client
7. Use contract-client where available
8. Support loading + empty + error states
9. Include filtering where event volumes are high

---

# TIER 1 — OPERATIONAL RISK SURFACES

---

## 7.1 CASE STATUS TIMELINE

### New Route
`/case/[caseId]/timeline`

### Data Sources
- GET `/api/cases/:caseId/status-events`
- GET `/api/case-dashboard/:caseId` (for context)
- GET `/api/cases/:caseId/event-log` (if separate endpoint exists)

### UI Requirements
- Chronological event list
- Show:
  - From status
  - To status
  - Actor
  - Timestamp
  - Reason/context
- Visually differentiate:
  - Status transitions
  - Attestation events
  - Overrides
  - Case card relinks
- Highlight abnormal transitions (VOID after GREEN, etc.)

### Constraints
- Read-only view
- No editing capabilities
- Must handle large event lists efficiently

---

## 7.2 SURGERY REQUEST TIMELINE + CHECKLIST COMPLETION

### Enhancement
`/admin/surgery-requests/[id]`

### Add Tabs
- Overview
- Timeline
- Checklist
- Financial

### Timeline Requirements
Use:
- surgery_request_audit_event
- surgery_request_conversion
- state transitions

Display:
- Status changes
- Actor type (CLINIC / ASC)
- Conversion event
- Timestamp

### Checklist Completion UI

If ASC-side checklist is PENDING:

- Show required checklist items
- Allow completion if rules satisfied
- Visual indicator of completion state
- Lock checklist if terminal state reached

### Constraints
- Respect SURGERY_REQUEST_TRANSITIONS map
- Must not bypass assertTransition() enforcement

---

## 7.3 INVENTORY MISSING WORKFLOW

### New Route
`/admin/inventory/missing`

### Requirements
- Table of inventory items with availability_status = MISSING
- Allow marking item as MISSING via inventory event
- Require reason input
- Show:
  - Last verified
  - Last known location
  - Reserved case (if any)
- Auto-highlight if item is reserved

### Backend Use
POST `/api/inventory/events`

Must not mutate item directly.

---

# TIER 2 — FINANCIAL GOVERNANCE SURFACES

---

## 7.4 INVENTORY FINANCIAL LEDGER

### New Route
`/admin/inventory/financial-ledger`

### Data
GET `/api/inventory/events?financial=true`

### UI Requirements
- Filterable by:
  - Vendor
  - Case
  - Gratis
  - Override reason
- Display:
  - cost_snapshot_cents
  - cost_override_cents
  - providedByVendorId
  - gratisReason
- Running totals
- Link to case detail

### Constraints
- Read-only event ledger
- No retroactive editing

---

## 7.5 CATALOG COST HISTORY

### New Route
`/admin/catalog/[catalogId]/cost-history`

### Data
GET `/api/catalog/:id/cost-events`

### Requirements
- Timeline view
- Chart visualization
- Show:
  - previous_cost
  - new_cost
  - effective_at
  - changed_by
  - reason
- Highlight retroactive changes

---

## 7.6 FINANCIAL READINESS BREAKDOWN VIEW

### Enhance
`/admin/financial-readiness/[requestId]`

### Requirements
Visual stack:

- ClinicFinancialState
- AscFinancialState
- OverrideState
- Computed FinancialRiskState

Must visually show precedence logic.

Example:
```
OverrideState → ASC State → Clinic State → Computed Risk
```

No new backend logic required.

---

# TIER 3 — DEVICE & VERIFICATION SURFACES

---

## 7.7 DEVICE REGISTRY

### New Route
`/admin/devices`

### Data
GET `/api/inventory/devices`

### Display
- Device name
- Type
- Last activity
- Error rate
- Active/inactive status

Allow:
- Disable device (if endpoint exists)

---

## 7.8 DEVICE EVENT EXPLORER

### New Route
`/admin/devices/events`

### Requirements
- Raw device_event log
- GS1 parse results
- Barcode classification
- Filter by:
  - Device
  - Date
  - Error status

Read-only.

---

# TIER 4 — PLATFORM GOVERNANCE

---

## 7.9 CONFIG AUDIT VIEWER

### New Route
`/platform/config-audit`

### Data
GET `/api/platform/audit-log`

### Requirements
- Diff viewer
- Filter by:
  - Facility
  - Config key
  - Actor
- Show:
  - Old value
  - New value
  - Timestamp
  - Risk classification

Must visually highlight high-risk changes.

---

## 7.10 AUTH AUDIT DASHBOARD

### New Route
`/platform/auth-audit`

### Data
GET `/api/platform/auth-audit-log`

### Requirements
- Table view:
  - User
  - IP
  - User agent
  - Success/failure
  - Timestamp
- Visual summary:
  - Failed login spike detection
- Filter by user/date

Read-only.

---

# TIER 5 — INSIGHT SURFACES

---

## 7.11 CASE OVERRIDE LEDGER

### Enhancement
Add tab to:
`/case/[caseId]`

### Requirements
- Full override history
- Actor
- Before/after state
- Justification
- Timestamp

Read-only.

---

## 7.12 READINESS CALENDAR SUMMARY

### New Route
`/readiness/calendar-summary`

### Data
GET `/api/readiness/calendar-summary`

### Requirements
- Multi-day heatmap
- Surgeon-level risk indicators
- OR load overlay
- Filter by date range

---

# IMPLEMENTATION ORDER (MANDATORY PRIORITY)

1. Case Timeline
2. Surgery Request Timeline + Checklist Completion
3. Inventory Missing Workflow
4. Inventory Financial Ledger
5. Catalog Cost History
6. Device Registry
7. Financial Breakdown View
8. Config Audit Viewer
9. Auth Audit Dashboard
10. Calendar Summary

---

# ARCHITECTURAL CONSTRAINTS

- DO NOT modify state machine logic.
- DO NOT bypass append-only event model.
- DO NOT introduce direct DB mutation patterns.
- DO NOT implement business logic in UI layer.
- DO NOT duplicate existing reports logic.

If additional API endpoints are required:
- Document them explicitly
- Do not modify existing contracts without justification

---

# SUCCESS CRITERIA

Phase 7 is complete when:

- All append-only audit tables have visible UI surfaces.
- Financial state logic is transparent to admins.
- Device infrastructure is observable.
- Surgery request transitions are fully visualized.
- No operationally critical data remains API-only.

---

END OF SPEC
