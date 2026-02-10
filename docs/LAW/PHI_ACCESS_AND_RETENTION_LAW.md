# PHI_ACCESS_AND_RETENTION_LAW.md

## Purpose

This LAW defines how **Protected Health Information (PHI)** is accessed, retained, scoped, and audited within the ASC Inventory Truth platform.

The goals of this LAW are to:
- Enable safe and efficient clinical and operational workflows
- Support long-term billing, compliance, and legal audit requirements
- Prevent unauthorized or incidental disclosure of PHI
- Ensure that PHI access is **explicit, attributable, purpose-limited, time-aware, and auditable**

This LAW is binding across all services, APIs, UIs, background jobs, reporting tools, and integrations.

This LAW is written to support **multiple independent ASC organizations** operating on the same platform without PHI leakage or trust assumptions between them.

---

## Definitions

**PHI (Protected Health Information)**  
Any information that identifies or could reasonably identify a patient, including but not limited to:
- Patient name
- Date of birth
- Medical record numbers
- Dates of service
- Diagnoses and procedures
- Insurance and billing identifiers
- Clinical notes or free-text references

**Organization**  
A legal or operational entity, including:
- Ambulatory Surgery Center (ASC)
- Surgeon Group / Office (including multi-surgeon practices)
- Hospital
- External Billing Entity (under BAA)

Organizations are first-class, isolated tenants unless explicitly linked by policy and attribution.

**Group Practice**  
A surgeon organization in which multiple surgeons and staff operate under a shared practice entity and may legitimately access PHI for patients treated by any surgeon within that group.

**Affiliation**  
A recorded relationship between a user and one or more organizations.

**Case**  
A surgical or procedural encounter. All PHI access is mediated through cases.

**Primary Organization of Record**  
The organization that owns clinical responsibility for a case at the time of creation.  
Each case has exactly one Primary Organization of Record.

**Purpose of Access**  
The explicit operational reason PHI is accessed (e.g., clinical care, scheduling, billing, audit).

---

## Core Principles (Non-Negotiable)

### 1. Retention Does Not Imply Visibility
PHI may be retained long-term to satisfy billing, regulatory, and legal requirements.

Visibility to PHI is always:
- role-based
- purpose-based
- organization-scoped
- time-aware
- auditable

---

### 2. No Implicit PHI Access
PHI access is never granted by convenience, proximity, shared infrastructure, or assumption.

All PHI access must be justified by:
- authenticated identity
- explicit role capability
- declared purpose of access
- documented organizational or case relationship

---

### 3. Case-Scoped PHI
There is no concept of global patient access.

PHI exists only in the context of a **case**.
All access decisions are evaluated at the case level.

---

### 4. Organizational Isolation by Default
ASC organizations, surgeon groups, and offices are isolated by default.

No PHI may flow between organizations unless explicitly permitted by:
- case attribution
- declared purpose
- recorded access grants

---

## PHI Classification

All PHI is classified at read time into one of the following categories:

### PHI_CLINICAL
Used for:
- scheduling
- pre-operative, intra-operative, and post-operative workflows
- surgeon and office coordination

Characteristics:
- Time-bound to active care windows
- Scoped to case attribution and organizational affiliation
- Mutable during active care
- Restricted or read-only after care window closure

---

### PHI_BILLING
Used for:
- claims
- payment posting
- reconciliation
- financial disputes
- long-term revenue reporting

Characteristics:
- Long-term retention (years)
- Purpose-limited
- Accessible only to billing-authorized roles
- Does not confer clinical or scheduling access
- Exposed only via billing-specific endpoints and views

---

### PHI_AUDIT
Used for:
- compliance reviews
- legal inquiries
- internal investigations
- external audits

Characteristics:
- Read-only
- Immutable
- Access requires explicit justification
- Aggressively logged

---

## Access Model

PHI access is granted **if and only if** all of the following are true:

1. The user is authenticated with a unique identity  
2. The user holds a role that permits access to the requested PHI classification  
3. The request declares a valid **Purpose of Access**  
4. One of the following conditions is met:
   - The user is affiliated with an organization attributed to the case
   - The declared purpose (billing or audit) explicitly overrides organizational affiliation
5. The access attempt is logged before PHI is returned

---

## Case Attribution Rules

- Each case must have exactly one **Primary Organization of Record** at creation time
- Case attribution determines default PHI_CLINICAL visibility
- Changes to Primary Organization of Record:
  - require elevated authorization
  - must include justification
  - are fully audit-logged
- Historical access decisions are evaluated based on attribution at the time of access

---

## Group Practice Rules (Explicit)

### Surgeon Group Practices
- A surgeon group is treated as a single organization for PHI access purposes
- Surgeons within the same group may access PHI_CLINICAL for patients of:
  - themselves
  - partners within the same group
- Group staff (schedulers, clinical staff, billing staff) may access PHI only for cases attributed to their group

No inference of access is permitted across different groups, even if surgeons operate in the same ASC.

---

## Covering and Cross-Group Access

- Covering surgeon access must be explicitly recorded at the case level
- Covering access:
  - is time-bounded
  - expires automatically unless renewed
  - does not imply group-level access
- Cross-group access without explicit recording is prohibited

---

## Organizational Shielding Rules

### Office / Group Staff
- May access PHI_CLINICAL only for cases attributed to their organization
- May never access PHI for cases belonging to other organizations
- May see de-identified schedule placeholders for other cases
- No global patient search capability

---

### Surgeons
- May access PHI_CLINICAL for:
  - their own patients
  - patients of partners within the same group
- Access outside group attribution requires explicit, time-bounded case-level grants

---

### ASC Clinical Staff
- May access PHI_CLINICAL only when operationally required
- Access is limited to the active care window
- Long-term browsing of historical PHI is prohibited

---

### Billing Roles
- May access PHI_BILLING across organizations
- Billing access exists solely for financial operations
- Billing access does not permit clinical interpretation or operational use
- Billing access does not imply visibility into active schedules

---

### Audit / Compliance Roles
- May access PHI_AUDIT system-wide
- Access requires:
  - justification
  - timestamp
  - scope declaration
- No modification or deletion is permitted

---

## Time-Based Constraints

- **Clinical Care Window**: configurable per case type  
  Outside this window:
  - PHI_CLINICAL becomes read-only or hidden
- **Billing Retention**: minimum 7–10 years (jurisdiction dependent)
- **Audit Logs**: retained for at least the billing retention period

PHI is not deleted casually.  
Visibility is reduced; retention is preserved.

---

## Logging & Audit Requirements

Every PHI access event must record:
- user ID
- role
- organization(s)
- case ID
- PHI classification
- purpose of access
- timestamp
- access outcome (allowed / denied)

Audit logs are:
- append-only
- immutable
- never user-editable

---

## Free-Text Controls

Free-text fields are treated as high-risk PHI.

Rules:
- Free-text PHI is prohibited unless explicitly designated PHI-allowed
- Free-text is always case-scoped
- Free-text is never visible across organizations by default
- Structured fields are preferred wherever possible

---

## Bulk Export Controls

- Bulk export of PHI requires:
  - elevated authorization
  - explicit purpose declaration
  - audit logging of scope and volume
- Bulk export is prohibited for PHI_CLINICAL unless clinically justified

---

## Emergency (“Break-Glass”) Access

- Emergency access may be permitted for patient safety or legal necessity
- Break-glass access:
  - requires explicit justification
  - is prominently flagged
  - is subject to mandatory review

---

## Integrations & External Entities

- Any external system touching PHI must operate under a valid BAA
- Integrations must explicitly declare:
  - PHI classification accessed
  - purpose
  - retention behavior
- No integration may bypass access enforcement or audit logging

---

## Enforcement

This LAW must be enforced at:
- API boundaries (mandatory)
- Service layers
- Background jobs
- Reporting and export tooling

UI-only enforcement is insufficient and non-compliant.

Violations of this LAW are architectural defects, not feature gaps.

---

## Final Principle

> **PHI exists to support care, billing, and accountability — not convenience.**

If access cannot be clearly justified, it must be denied.
