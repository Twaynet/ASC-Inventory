# Phase 1: Surgery Request Readiness Implementation

## What is a SurgeryRequest?

A **SurgeryRequest** is a pre-case governance artifact submitted by a referring clinic to an ASC facility. It represents a clinic's intent to schedule a surgical procedure and carries structured readiness data.

### What it IS:
- An operational governance object
- A structured submission from clinic to ASC
- A precursor to a `surgical_case` (created upon conversion)
- An audit-trailed lifecycle artifact

### What it is NOT:
- An EMR record (no clinical notes, diagnoses, labs, imaging)
- A financial/insurance tracking object (Phase 2)
- A scheduling system (it expresses *intent*, not confirmed schedule)
- A replacement for `surgical_case` — it becomes one after conversion

---

## State Machine

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
SUBMITTED ──────► RETURNED_TO_CLINIC ──────► SUBMITTED (resubmit)
    │                    │
    ├──► ACCEPTED ──► CONVERTED (terminal)
    │
    ├──► REJECTED (terminal)
    │
    └──► WITHDRAWN (terminal)
         ▲
         │
    RETURNED_TO_CLINIC ──► WITHDRAWN (terminal)
    ACCEPTED ──► WITHDRAWN (terminal)
```

### Allowed Transitions

| From | To |
|------|-----|
| SUBMITTED | RETURNED_TO_CLINIC, ACCEPTED, REJECTED, WITHDRAWN |
| RETURNED_TO_CLINIC | SUBMITTED (resubmit), WITHDRAWN |
| ACCEPTED | CONVERTED, WITHDRAWN |
| REJECTED | *(terminal)* |
| WITHDRAWN | *(terminal)* |
| CONVERTED | *(terminal)* |

Invalid transitions return **409 Conflict**.

---

## Authentication

### Clinic API Key
- Header: `X-Clinic-Key: <raw-key>`
- Key format: random 64-character hex string
- Lookup: first 8 chars (prefix) used for DB index lookup
- Verification: full key hashed with SHA-256 and compared to stored hash
- Context: `clinicId` derived from key — never accepted from request body

### ASC User (JWT)
- Standard JWT auth via `Authorization: Bearer <token>`
- Capabilities:
  - `SURGERY_REQUEST_REVIEW` — view, return, accept, reject
  - `SURGERY_REQUEST_CONVERT` — convert accepted request to surgical_case
- Roles: ADMIN has both capabilities; SCHEDULER has REVIEW only

---

## API Endpoints

### Clinic Endpoints (API Key Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/clinic/surgery-requests` | Submit or resubmit a request |
| GET | `/api/clinic/surgery-requests` | List own requests |
| GET | `/api/clinic/surgery-requests/:id` | Get single request |
| POST | `/api/clinic/surgery-requests/:id/withdraw` | Withdraw a request |

### Admin Endpoints (JWT + Capability)

| Method | Path | Capability | Description |
|--------|------|-----------|-------------|
| GET | `/api/admin/surgery-requests` | REVIEW | List requests for facility |
| GET | `/api/admin/surgery-requests/clinics` | REVIEW | List clinics with requests |
| GET | `/api/admin/surgery-requests/:id` | REVIEW | Detailed view |
| POST | `/api/admin/surgery-requests/:id/return` | REVIEW | Return to clinic |
| POST | `/api/admin/surgery-requests/:id/accept` | REVIEW | Accept request |
| POST | `/api/admin/surgery-requests/:id/reject` | REVIEW | Reject request |
| POST | `/api/admin/surgery-requests/:id/convert` | CONVERT | Convert to case |

---

## Scope Rules

1. **Clinic scope**: Clinics can only see/modify their own requests (`source_clinic_id` derived from API key)
2. **Facility scope**: ASC users can only see/act on requests targeting their facility (`target_facility_id = user.facilityId`)
3. **Immutability**: ASC users NEVER modify clinic-submitted fields in-place. Corrections require returning to clinic for resubmission.
4. **Terminal states**: REJECTED, WITHDRAWN, CONVERTED — no further transitions allowed

---

## Idempotency

Submissions are identified by `(source_clinic_id, source_request_id)`:

1. **New request**: Creates request + submission(seq=1) + checklist + audit → 201
2. **Existing + RETURNED_TO_CLINIC**: Creates new submission(seq+1) + new checklist + audit RESUBMITTED → 200
3. **Existing + any other status**: Returns existing request (no duplicate) → 200

---

## Conversion Semantics

When an ACCEPTED request is converted:

1. A new `surgical_case` is created with status `REQUESTED`
2. Fields mapped: `procedure_name`, `surgeon_id`, `scheduled_date`, `scheduled_time`
3. A `surgery_request_conversion` bridge record links the two
4. The request status becomes `CONVERTED` (terminal)
5. Case number is auto-generated via `generate_case_number()`

---

## Database Tables

| Table | Type | Purpose |
|-------|------|---------|
| `clinic` | Mutable | Source tenant |
| `clinic_api_key` | Mutable | API authentication keys |
| `patient_ref` | Mutable | Minimal identity pointer |
| `surgery_request` | Mutable | Core request lifecycle |
| `surgery_request_submission` | Append-only | Submission attempt log |
| `surgery_request_checklist_template_version` | Mutable | Checklist schemas |
| `surgery_request_checklist_instance` | Mutable | Per-submission checklist |
| `surgery_request_checklist_response` | Append-only | Item responses |
| `surgery_request_audit_event` | Append-only | Lifecycle audit trail |
| `surgery_request_conversion` | Immutable (1:1) | Bridge to surgical_case |

---

## UI Pages

- **`/admin/surgery-requests`** — List view with status/clinic/date filters
- **`/admin/surgery-requests/:id`** — Detail view with read-only clinic data, checklist responses, submission history, audit timeline, and action buttons
