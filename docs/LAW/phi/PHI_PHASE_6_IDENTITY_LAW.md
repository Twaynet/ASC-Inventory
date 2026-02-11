# PHI_PHASE_6_IDENTITY_LAW.md

## Status
**DRAFT — PROPOSED**  
(Additive only. No modifications to existing PHI LAW documents.)

---

## Purpose

Phase 6 introduces **patient identity** into the ASC Inventory Truth platform in a strictly controlled manner.

This phase establishes a **PHI Identity Domain** that enables real-world surgical case association while preserving all existing PHI access, audit, retention, and governance invariants defined in PHI Phases 1–5.

Phase 6 is intentionally limited to **identity only**.  
No documents, exports, or external transmission mechanisms are introduced.

---

## Scope

### In Scope (Phase 6A)
- Patient identity records
- Patient identifiers (name, DOB, MRN, gender)
- Association of patient identity to surgical cases
- Read access to identity data for authorized clinical workflows

### Explicitly Out of Scope
- Clinical documents (PDFs, images, scans)
- Outbound PHI transmission (exports, integrations, messaging)
- Audit UI display of patient identifiers
- Analytics containing patient identifiers
- Any modification to PHI Phases 1–5 behavior

---

## Definitions

### PHI Identity
For Phase 6, **PHI Identity** consists of the following data elements:

- Patient full name
- Date of birth
- Medical record number (MRN) or facility-scoped identifier
- Gender (Amendment 1: constrained to MALE, FEMALE, OTHER, UNKNOWN; required for surgical timeout patient verification)

No other clinical or administrative data is considered PHI under this phase unless explicitly added by later law.

---

## Core Principles

1. Identity is a distinct PHI domain
2. Operational data remains non-PHI
3. PHI access is explicit, minimal, and observable
4. All prior PHI laws apply unchanged

---

## Data Model Rules

1. PHI identity data MUST reside in dedicated PHI tables
   - No PHI fields may be embedded into existing operational tables
   - Operational objects MAY reference identity by opaque identifier only

2. Surgical cases MAY reference a patient by ID
   - No patient identifiers may be duplicated into case tables
   - Historical relinking (if required) must preserve auditability

3. PHI identity tables MUST be facility-scoped
   - Cross-facility PHI visibility is prohibited unless allowed by existing PHI law

---

## Access Control Rules

1. All PHI identity access is governed by existing PHI access laws
   - Purpose-bound access (Phase 1–2)
   - Full audit logging of ALLOWED and DENIED access
   - Time-bound clinical access and break-glass rules (Phase 3)

2. PHI identity access requires explicit PHI capability
   - Existing CASE / INVENTORY capabilities do NOT imply PHI access
   - A PHI-specific read capability MUST be required for identity access

3. Access is field-minimal
   - Endpoints MUST return only the identity fields required for the requesting surface
   - “Convenience joins” that leak identity into non-PHI endpoints are prohibited

---

## API Surface Rules

1. PHI identity endpoints MUST be clearly delineated
   - PHI endpoints must be identifiable as PHI-bearing by path or module
   - Non-PHI endpoints MUST NOT return patient identifiers

2. PHI identity endpoints MUST fail closed
   - Missing purpose headers
   - Missing PHI capability
   - Expired access windows
   - Audit system unavailability

3. Errors MUST NOT include PHI
   - No patient identifiers in error messages, logs, or debug output

---

## UI Rules

1. PHI identity MAY appear only in PHI-aware UI components
   - Components rendering identity must be explicitly designated as PHI-aware
   - Default dashboards, lists, and calendars remain non-PHI unless explicitly authorized

2. PHI identity display MUST be intentional
   - Identity display locations should be limited and enumerable
   - “Implicit” identity exposure via shared components is prohibited

3. PHI Audit UI remains PHI-free
   - Phase 5 audit UI MUST NOT display patient identifiers
   - No identity lookup, drill-down, or export is permitted from audit surfaces

---

## Audit & Observability

1. All PHI identity access MUST be auditable
   - Access events must appear in existing PHI audit logs
   - Both ALLOWED and DENIED access must be recorded

2. Audit analytics MUST remain de-identified
   - Identity values must not appear in analytics output
   - Hashing or aggregation must follow Phase 4 rules

---

## Retention

- PHI identity retention follows existing Phase 4 retention policy
- No new retention enforcement is introduced in Phase 6 unless added by future law
- Identity deletion or anonymization (if supported) must preserve audit integrity

---

## Explicit Prohibitions

The following are **forbidden** under Phase 6:

- PHI in audit UI displays
- PHI in analytics exports
- PHI in CSV or file exports
- PHI embedded in operational or event tables
- PHI included in logs or error payloads
- Implicit PHI access via non-PHI endpoints
- Introduction of document storage or external transmission

---

## Change Control

- This law is additive only
- Modifications require a new PHI law document
- No existing PHI LAW documents may be altered to accommodate Phase 6

---

## Exit Criteria (Phase 6 Completion)

Phase 6 is considered complete when:

- PHI identity exists only in designated tables
- PHI access is gated by explicit PHI capability
- All PHI identity access is auditable
- Phase 5 audit UI remains unchanged and PHI-free
- Removal of Phase 6 code would not impact Phases 1–5 behavior

---

## Future Phases

- Phase 6B: Clinical documents (deferred — see _drafts/)
- Phase 7: Outbound PHI transmission / integrations

These phases require separate LAW documents.
