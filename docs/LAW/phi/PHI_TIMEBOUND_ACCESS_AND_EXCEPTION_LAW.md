# PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW

**Status:** ACTIVE  
**Phase:** 3  
**Domain:** PHI Governance  
**Applies To:** All facilities, organizations, users, and services handling PHI  
**Effective Date:** Upon Phase 3 implementation  
**Depends On:**
- PHI_ACCESS_AND_RETENTION_LAW.md
- PHI Phase 1 (Foundation)
- PHI Phase 2 (Enforcement & Redaction)

---

## 0. Purpose

This LAW defines **temporal limits, exception handling, and export discipline** for PHI access.

It operationalizes when PHI may be accessed, how long access remains valid, and how exceptions are handled — without weakening auditability, usability, or enforcement guarantees established in earlier phases.

---

## 1. Core Principle

> **PHI access is contextual, time-bound, and purpose-specific.**  
> Absence of a valid temporal or purpose context MUST result in denial, not degradation.

---

## 2. PHI Classifications (Restated)

PHI within the system remains classified as:

- **PHI_CLINICAL**
- **PHI_BILLING**
- **PHI_AUDIT**

This LAW primarily governs **PHI_CLINICAL**, with secondary constraints on exports of **PHI_BILLING** and **PHI_AUDIT**.

---

## 3. Time-Bound Clinical Access

### 3.1 Clinical Care Window

Clinical PHI access is restricted to a defined window relative to a case’s lifecycle.

**Default window (facility-configurable):**

- **Pre-op:** 7 days before scheduled procedure date
- **Post-completion:** 30 days after case completion

Defaults are defined in `CLINICAL_CARE_WINDOW_DEFAULTS`.

---

### 3.2 Enforcement Rules

For **PHI_CLINICAL** access with purpose `CLINICAL_CARE`:

- Access MUST be denied if the current time is outside the clinical care window
- Denials MUST be logged with reason: `OUTSIDE_CLINICAL_WINDOW`
- Billing and audit access are NOT affected by time window constraints

This enforcement applies to all endpoints returning patient-linked clinical data, including but not limited to:
- Case views
- Case dashboards
- Checklists
- Readiness workflows
- AI clinical explanations

---

### 3.3 Role Behavior Outside Window

| Role Category | Behavior Outside Window |
|--------------|-------------------------|
| Surgeons & Clinical Staff | PHI_CLINICAL denied |
| Billing Access | Allowed (PHI_BILLING) |
| Audit / Compliance | Allowed (PHI_AUDIT) |
| Platform Admin | Denied (no tenant PHI access) |

---

## 4. Emergency (Break-Glass) Access

### 4.1 EMERGENCY Purpose

The `EMERGENCY` access purpose represents **explicit, intentional override** of time and affiliation constraints.

Rules:

- `EMERGENCY` MUST be provided explicitly via `X-Access-Purpose`
- `EMERGENCY` MUST NOT have a default
- `EMERGENCY` bypasses:
  - Clinical care window restrictions
  - Organization affiliation requirements
- `EMERGENCY` DOES NOT bypass:
  - Facility boundaries
  - Capability checks

---

### 4.2 Justification Requirement

Every EMERGENCY access MUST include:

- Free-text justification (minimum length enforced)
- Justification recorded in the PHI audit log
- Audit entry is immutable

Missing justification MUST result in denial with reason:
`EMERGENCY_JUSTIFICATION_REQUIRED`

---

### 4.3 Emergency Audit Visibility

Emergency access MUST:

- Be logged with `outcome = ALLOWED`
- Be flagged as emergency access
- Be clearly distinguishable in audit views

---

## 5. Bulk Export Controls

### 5.1 Export Definition

An export is defined as any response that produces:

- CSV
- XLSX
- Or large JSON datasets exceeding a configurable row threshold

---

### 5.2 Export Purpose Rules

For PHI exports:

- Default purpose MUST be `AUDIT` or `BILLING`
- `CLINICAL_CARE` is NOT a valid export purpose
- `EMERGENCY` MUST NOT be used for bulk export

---

### 5.3 Export Safeguards

Facilities MAY configure:

- Maximum row counts per export
- Rate limits per user
- Mandatory purpose escalation for large exports

All exports MUST log:

- User
- Purpose
- Endpoint
- Row count
- Timestamp

---

## 6. Audit UX Requirements (Read-Only)

Audit interfaces introduced in Phase 3 MUST:

- Be strictly read-only
- Support filtering by:
  - User
  - Case
  - Organization
  - Purpose
  - Outcome
  - Time range
- Display emergency access distinctly
- Never allow modification or deletion of records

---

## 7. Prohibited Behaviors

The following are explicitly forbidden:

- Defaulting any endpoint to `EMERGENCY`
- Silent widening of clinical care windows
- Using `PHI_CLINICAL` for reporting exports
- Masking time-window denials
- Editing or deleting audit records

---

## 8. Deferred (Out of Scope)

Phase 3 explicitly does NOT include:

- New user roles (e.g., BILLER, AUDITOR)
- External integrations or BAAs
- EMR synchronization
- AI autonomy or PHI inference changes
- UI redesign beyond audit visibility

---

## 9. Invariants

The following invariants MUST hold at all times:

1. Every PHI access has an explicit purpose
2. Every PHI access is logged
3. Every exception is intentional and visible
4. Time reduces access; it never expands it
5. Audit data is immutable

---

## 10. Exit Criteria

Phase 3 is complete when:

- Clinical care window enforcement is active
- Emergency access requires justification
- Bulk exports are purpose-constrained
- Audit UX exists and is read-only
- No PHI access path bypasses time, purpose, or logging

---

> **PHI systems fail at the margins, not the center.**  
> This LAW exists to harden the margins without obstructing care.
