# LAW: Nomenclature and Entity Separation
Version: 1.0  
Project: ASC Inventory Truth

---

## Purpose (Non-Negotiable)

This document defines the **authoritative nomenclature and entity separation** for surgical cards within this application.

If this law is violated, the system will drift, versioning will break, and downstream workflows (case dashboards, readiness attestation, inventory planning) will become unreliable.

This file is the **single source of truth** for:
- Terminology
- Entity boundaries
- Allowed relationships
- Forbidden relationships

---

## Core Law

A **Surgeon Preference Card** and a **Case Card** are **two distinct entities**.

They are:
- Stored separately
- Modeled separately
- Versioned separately
- Queried separately
- Named separately

They must never be conflated.

---

## Entity Definitions

### Surgeon Preference Card (SPC)

A **Surgeon Preference Card** represents a surgeon’s default preferences for performing a specific procedure.

Characteristics:
- Surgeon-specific
- Procedure-specific
- Not tied to a scheduled case
- Represents intent / defaults
- Dynamic and editable over time
- Viewable by all surgeons and permitted staff
- Editable by permitted staff roles with audit logging

Purpose:
- To act as the **source document** from which case-specific artifacts are derived

Canonical UI:
- `/case-cards` is the authoritative SPC interface

---

### Case Card (CC)

A **Case Card** represents the **operational execution artifact** for a single scheduled surgical case.

Characteristics:
- Tied to exactly one scheduled case instance
- Derived from:
  - a specific Surgeon Preference Card **and version**
  - plus case-instance overrides and additions
- Used by OR staff to prepare and run that specific case
- Immutable with respect to its originating SPC version (unless explicitly updated)

Purpose:
- To capture **what is actually being done for this case**

Case Cards are not preferences.
They are execution records.

---

### Case Instance (Context)

A **Case Instance** represents the scheduled surgery itself.

Characteristics:
- Date, time, facility, room
- Surgeon
- Anesthesia plan
- Readiness attestation and audit trail

Relationships:
- References exactly one SPC (by ID)
- Pins exactly one SPC version
- References zero or one Case Card (derived artifact)

---

## Relationship Rules

### Allowed Relationships

- An SPC may be:
  - Viewed by anyone with access
  - Edited with audit logging
  - Cloned (seeded) to create a new SPC for another surgeon

- A Case Card:
  - Must reference exactly one SPC ID and SPC version
  - May contain case-specific overrides
  - Must never silently change if the SPC is edited later

- A Case Instance:
  - Pins an SPC version at creation or attestation time
  - Uses that pinned version unless explicitly updated

---

### Forbidden Relationships (Hard Errors)

The following are **explicitly forbidden**:

- Using a Case Card as a Surgeon Preference Card
- Treating an SPC as a Case Card
- Having a Case Card auto-update when an SPC is edited
- Using “latest updated” SPC version implicitly
- Sharing storage, models, or services between SPC and CC without clear separation
- Referring to an SPC as a “case card” in code or UI
- Admin-exclusive ownership of SPCs

Any of the above constitutes a bug.

---

## Versioning Rules

### Surgeon Preference Card Versioning

- SPCs may be edited at any time
- Every edit must be audit logged
- Version identifiers may be semantic or implicit via audit history
- A concept of “Active” may exist for selection defaults

### Case Card Versioning

- Case Cards are derived artifacts
- Once created for a case, they are stable records
- Changes to execution must occur via overrides or new Case Cards
- Historical integrity must be preserved

---

## Seeding (Cloning) Rules

- Any SPC may be cloned to create a new SPC
- Cloned SPCs:
  - Receive a new ID
  - Have a new owner-surgeon
  - Start a fresh audit log
- Provenance tracking is not required

---

## Access and Governance Summary

- All surgeons may view all SPCs
- SPCs are not admin-exclusive
- SPC ownership denotes attribution, not edit restriction
- Accountability is enforced via audit logging, not permission bottlenecks

---

## Naming Conventions (Required)

To prevent drift:

- Use `SurgeonPreferenceCard` (or `SPC`) in code for preference entities
- Use `CaseCard` (or `CaseInstanceCard`) for execution artifacts
- Do not use ambiguous names like `Card`, `ProcedureCard`, or `Template`
- Routes, services, and repositories must reflect the entity they serve

Violations of naming conventions are considered architectural defects.

---

## Enforcement

- This document must be consulted before implementing or modifying:
  - Case card workflows
  - Preference card workflows
  - Case dashboards
  - Version resolution logic
- LLM prompts must reference this document explicitly
- Code reviews should reject changes that violate this law

---

## Final Statement

This system prioritizes **clarity, accountability, and real-world OR behavior** over artificial workflow control.

Preference is intent.  
Case cards are execution.  
Confusing the two breaks everything.

---
End of Document
