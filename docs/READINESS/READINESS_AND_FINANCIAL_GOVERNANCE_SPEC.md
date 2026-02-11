# READINESS AND FINANCIAL GOVERNANCE SPEC
ASC Inventory Truth — Operational Governance Layer

---

# 1. Purpose

This document defines the structured governance model for:

- Clinic-submitted Surgery Requests
- Insurance and financial readiness tracking
- ASC verification workflow
- Administrative financial risk visibility
- Cancellation attribution analytics

This system:

- Does NOT replace clinic EMRs
- Does NOT function as a billing engine
- Does NOT store scanned documents
- Does NOT integrate payer APIs (at this stage)
- Does NOT automatically influence scheduling or block allocation

It enforces structured readiness and surfaces financial risk.

---

# 2. Core Concept

ASC Inventory Truth is the operational hub.

It governs:

- Physical inventory
- Case lifecycle
- Identity (minimal)
- Readiness inventory
- Financial verification
- Accountability

Clinics PUSH structured readiness data.
ASC verifies and governs risk.

---

# 3. SurgeryRequest Object

A SurgeryRequest is a pre-case readiness object submitted by a clinic.

It becomes a surgical_case only after ASC scheduling.

---

## 3.1 Minimal Identity Fields

Required:

- firstName
- lastName
- dateOfBirth
- gender
- clinicPatientMrn
- surgeonId
- clinicId

No longitudinal chart data stored.

---

## 3.2 Scheduling Intent

- proposedProcedureName
- CPTCodes (array)
- ICD10Codes (array)
- preferredDateWindowStart
- preferredDateWindowEnd
- estimatedDurationMinutes
- implantRequired (boolean)
- specialEquipmentNotes (optional)

---

# 4. Financial Readiness Model

Insurance data is structured and dual-tracked.

ASC does not trust clinic declaration without verification.

---

## 4.1 Clinic Declaration (Structured Only)

- clinicPrimaryPayerName
- clinicMemberId
- clinicGroupNumber
- clinicAuthStatus (NOT_REQUIRED | PENDING | APPROVED | DENIED)
- clinicAuthNumber
- clinicVerifiedAt
- clinicVerifiedBy

This is declarative only.

---

## 4.2 ASC Verification (Authoritative)

- ascPrimaryPayerName
- ascMemberId
- ascGroupNumber
- ascAuthStatus (NOT_REQUIRED | PENDING | APPROVED | DENIED)
- ascAuthNumber
- ascVerifiedAt
- ascVerifiedBy
- ascVerificationNotes

ASC values determine readiness.

---

# 5. Financial Risk State (Computed)

Each case receives a computed `financialRiskState`.

### GREEN
ASC verified AND auth APPROVED or NOT_REQUIRED.

### YELLOW
ASC verification pending, outside risk window.

### ORANGE
ASC verification pending and within risk threshold window (default: < 48 hours before surgery).

### RED
Authorization DENIED OR verification missing past threshold.

### PURPLE
Admin override used.

Threshold window configurable by ADMIN.

---

# 6. State Machine

SurgeryRequest lifecycle:

DRAFT  
→ SUBMITTED  
→ UNDER_REVIEW  
→ READY_FOR_SCHEDULING  
→ SCHEDULED  
→ REJECTED  

Scheduling is never blocked by insurance verification.

Financial readiness influences risk state only.

---

# 7. Override Model

Admin may override financial readiness.

Override requires:

- Structured reason code
- Free-text note
- userId
- timestamp

Override sets `financialRiskState = PURPLE`.

Overrides are logged and never silent.

---

# 8. Dashboard: Financial Readiness (ADMIN Only)

Location: Admin module (not mixed with inventory alerts).

Visibility:
- ADMIN only
- Not visible to surgeons or clinics

Default time window:
- Upcoming 7 days (configurable)

---

## 8.1 Summary Metrics

- Total upcoming cases
- % GREEN
- % YELLOW
- % ORANGE
- % RED
- Total overrides

No auto-ranking.
No default sort by worst performer.

---

## 8.2 Aggregated Views

### Risk by Surgeon (Observational)

Columns:
- Surgeon Name
- Total cases
- % GREEN
- % RED
- % Overrides
- Avg verification lag (clinicDeclaredAt → ascVerifiedAt)
- Denial count

Sortable only.

---

### Risk by Clinic (Observational)

Columns:
- Clinic Name
- Total cases
- % GREEN
- % RED
- % Overrides
- Avg verification lag
- Denial count

Sortable only.

---

# 9. Alerts

Alerts are:

- In-app only
- Admin-only

Examples:

- Case within 48 hours without ASC verification
- Authorization DENIED
- Authorization expiring before surgery

No email.
No SMS.
No external notification.

---

# 10. Cancellation Attribution Model

At cancellation, structured reason is required.

---

## 10.1 Required Structured Category

Enum: cancellationCategory

### FINANCIAL
- FIN_AUTH_DENIED
- FIN_AUTH_PENDING
- FIN_INCORRECT_INSURANCE
- FIN_ELIGIBILITY_FAILED
- FIN_OTHER

### CLINICAL
- CLINICAL_CHANGE
- MEDICAL_OPTIMIZATION_REQUIRED
- ABNORMAL_LABS
- PROVIDER_DECISION
- CLINICAL_OTHER

### PATIENT
- PATIENT_NO_SHOW
- PATIENT_REQUEST
- PATIENT_NONCOMPLIANCE
- PATIENT_OTHER

### OPERATIONAL
- EQUIPMENT_UNAVAILABLE
- STAFFING_ISSUE
- SCHEDULING_ERROR
- WEATHER
- OPERATIONAL_OTHER

Selection is mandatory.

---

## 10.2 Optional Narrative

- cancellationNotes (text, nullable)

Narrative provides context but is not used for analytics.

---

## 10.3 Reporting Location

Cancellation analytics live under:

/admin/reports

Not inside Financial Readiness dashboard.

Reports are retrospective.
Dashboard is forward-looking.

---

# 11. Scope Model

## 11.1 Clinic Users

Scoped by:
- surgeonId OR
- clinicId

Clinic users may:
- Create SurgeryRequests
- Edit DRAFT requests
- Submit readiness data
- View their own requests

Clinic users may NOT:
- View other clinics' requests
- Override readiness
- View financial dashboard

---

## 11.2 ASC Users

Facility-scoped.

ASC users may:
- View all SurgeryRequests
- Verify financial readiness
- Override readiness
- Convert to surgical_case
- View financial dashboards

---

# 12. Explicit Non-Goals

This system does NOT:

- Store insurance card images
- Store scanned H&P documents
- Submit claims
- Integrate payer APIs (at this stage)
- Calculate reimbursement
- Replace clinic EMR
- Automatically penalize surgeons
- Automatically adjust scheduling priority

It surfaces risk.
Administrators retain leverage.

---

# 13. Strategic Intent

The system transforms:

Unstructured phone calls  
→ Structured declarations

Hidden risk  
→ Visible dashboards

Anecdote  
→ Measurable accountability

It preserves scheduling momentum while enforcing operational governance.
