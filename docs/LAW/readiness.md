# LAW: Readiness System  
**ASC Inventory Truth**

**Status:** NON-NEGOTIABLE  
**Authority Level:** SYSTEM LAW  
**Applies To:** All humans, all AI agents (including Claude CLI), all code paths that compute, display, gate, attest, or override readiness  
**Last Updated:** 2026-01-25

**Depends On (Authoritative LAW):**
- `docs/LAW/catalog.md`
- `docs/LAW/inventory.md`
- `docs/LAW/physical-devices.md`
- `docs/LAW/device-events.md`

If any statement in this document conflicts with the above LAW documents, this document must be amended. No implementation may proceed under conflicting assumptions.

---

## 1. Authority & Scope

This document defines binding **SYSTEM LAW** governing the **Readiness system** within the ASC Inventory Truth application.

Any implementation, refactor, automation, migration, or AI-generated output that conflicts with this document is **invalid** and **must not be executed**.

Ambiguity must always be resolved by **tightening constraints**, never loosening them.

---

## 2. Definition of Readiness

**Readiness** is a deterministic, auditable evaluation of whether a **scheduled case** can proceed safely and operationally based on:

- required items (derived from case-linked definitions)
- physical inventory state (Inventory Items + Inventory Events)
- verification activity (Inventory Events)
- checklist completion gates (where enabled)
- explicit, logged exceptions (Overrides)

Readiness is **a computed state**, not a manually set attribute.

---

## 3. Readiness Is NOT (Explicit Prohibitions)

Readiness MUST NOT:

- depend on device APIs or raw device input
- treat DeviceEvents as proof of item identity or presence
- be manually set to “GREEN” (or equivalent) by UI or admin action
- store or require PHI to compute readiness
- mutate inventory truth (inventory is governed by `inventory.md`)
- bypass checklist gate rules when feature flags enable them

---

## 4. Readiness Outputs (Authoritative)

Readiness MUST output a normalized state:

- `GREEN` — requirements satisfied (no blocking deficits)
- `ORANGE` — caution / at-risk (non-blocking deficits exist)
- `RED` — not ready (blocking deficits exist)

Readiness MUST also output machine-readable **reasons** sufficient for audit and debugging.

---

## 5. Readiness Inputs (Authoritative Sources of Truth)

Readiness may only be computed from:

### A) Case Context (Non-PHI)
- case identity (`case_id`)
- facility boundary (`facility_id`)
- scheduled date/time/room (if relevant to timing windows)

### B) Requirements Source
Requirements MUST be derived from one of the following lawful sources:

1. **Linked Case Card / Preference Card Version** copied into case-scoped requirements  
   - Case holds a reference to a specific card version
   - Case requirements are derived/captured for that case

2. **Explicit Case Requirements** created for the case (if permitted by governing docs)
   - Requirements must still reference Catalog Items (via `catalog_id`)

Requirements MUST be Catalog-anchored:
- All requirement line items MUST map to a Catalog Item identity (see `catalog.md`)

### C) Physical Reality
- Inventory Items and Inventory Events (see `inventory.md`)
- Sterility status and expiration (as Inventory state derived from events)
- Reservation status (as Inventory state derived from events)

### D) Attestations / Checklist State
- Readiness attestations (append-only / voidable)
- Checklist instance state (TIMEOUT / DEBRIEF) when the feature flag gates apply

### E) Overrides (Logged Exceptions)
- Only explicitly created, logged overrides may alter readiness evaluation outcomes

---

## 6. Device Input Boundary (Reaffirmation)

Per parent law:
- `physical-devices.md`
- `device-events.md`

DeviceEvents MAY:
- trigger lookup
- populate candidate inputs
- initiate workflows

DeviceEvents MUST NOT:
- satisfy requirements
- change readiness directly
- be treated as truth

---

## 7. Determinism Law

Given the same inputs (requirements + inventory state + overrides + checklist/attestation state), readiness computation MUST:

- produce the same output state
- produce the same reason set (order may be stable but must be deterministic if displayed)

No randomness or heuristic “best guess” logic is allowed.

---

## 8. Blocking vs Non-Blocking Deficits (Authoritative)

Readiness MUST classify deficits as:

### Blocking (forces `RED`)
Examples include (non-exhaustive):
- required Catalog Item has zero valid, available Inventory Items satisfying the requirement
- required item exists but is `EXPIRED` sterility status when sterility is required
- required item exists but is `MISSING` or `UNAVAILABLE` when required for case
- required item is `RESERVED` for a different case at the relevant time window (if reservation logic is in effect)
- any explicitly “blocking” override rule defined by the system (override still must be logged)

### Non-Blocking (allows `ORANGE`)
Examples include (non-exhaustive):
- item is available but not recently verified (if verification recency rules apply)
- informational warnings (e.g., loaner not confirmed received yet) where policy defines as caution
- unresolved candidate matches requiring human selection but not yet evaluated as missing

`GREEN` is only permitted when there are no blocking or non-blocking deficits.

---

## 9. Verification Requirements (Lawful Model)

**Verification** is the workflow by which staff confirm readiness by recording lawful Inventory Events (e.g., VERIFIED).

Rules:
- Verification MUST be recorded via Inventory Events (append-only)
- Verification MUST update readiness only through recomputation using Inventory state/event history
- Verification MUST NOT be inferred from DeviceEvents
- Verification MUST remain reconstructable for audit (event replay)

---

## 10. Overrides (Exceptions) Law

Overrides exist to acknowledge reality when the system cannot automatically satisfy a requirement.

Overrides MUST:
- be explicit and deliberate
- be append-only in audit record (create/modify/remove actions must be logged)
- include:
  - `case_id`
  - `requirement_id` or referenced catalog requirement
  - override type (e.g., “ALLOW_MISSING”, “SUBSTITUTION_APPROVED”, “STERILITY_EXCEPTION”)
  - reason text
  - who created it (`user_id`)
  - timestamp

Overrides MUST NOT:
- delete or falsify underlying deficits
- mutate Inventory Items or Inventory Events directly
- be silent “admin toggles” without audit record

Readiness output MUST reflect when an override is responsible for a non-red result.

---

## 11. Attestation Law (Readiness)

A readiness attestation is a user statement:

> “I attest that readiness has been verified to the best of my role and policy.”

Attestations MUST:
- be stored as append-only records
- record `case_id`, `user_id`, `facility_id`, timestamp, attestation type
- be voidable only via an explicit void action that is also logged

Attestation MUST NOT:
- force readiness to GREEN
- bypass deficits
- replace missing Inventory Events or Overrides

Attestation is **documentation**, not computation.

---

## 12. Gating Law (Timeout/Debrief Feature Flag)

When the system feature flag enabling checklist gates is active:

- Case transition to `IN_PROGRESS` MUST be blocked unless TIMEOUT checklist is completed
- Case transition to `COMPLETED` MUST be blocked unless DEBRIEF checklist is completed

Readiness computation MAY display gate status as part of readiness reasons, but must not “fake” checklist completion.

---

## 13. Readiness Cache (If Implemented)

If the system uses a computed readiness cache:

- Cache is derived data only
- Cache MUST be recomputable from source-of-truth records
- Cache MUST NOT be edited manually
- Cache invalidation/recompute triggers MUST be explicit and auditable (e.g., job run record)

Source of truth remains:
- requirements
- inventory events/state
- overrides
- attestations/checklists

---

## 14. Multi-Tenant Boundary Law

Readiness MUST be computed strictly within a single `facility_id`.

Readiness MUST NOT:
- look up inventory outside the facility
- allow cross-facility substitutions
- display cross-facility data in readiness reasoning

---

## 15. PHI Boundary Law

Readiness MUST be computable without PHI.

Rules:
- Readiness MUST NOT require patient name, DOB, MRN, or identifiers
- If a case has optional patient context fields, readiness must not depend on them
- Readiness reasons must not contain PHI

---

## 16. Allowed Operations

Only the following operations are lawful within the Readiness domain:

- Compute readiness for a case
- View readiness state and reasons
- Perform verification workflows that create Inventory Events
- Create/modify/remove readiness overrides (with audit)
- Create/void readiness attestations
- Recompute readiness caches (if present) from source of truth

Any operation not listed here is forbidden.

---

## 17. Forbidden Operations (Hard Stop)

The following actions are illegal under this LAW:

- manually setting readiness state
- treating DeviceEvents as proof of readiness
- deleting deficits rather than resolving them
- changing readiness without changing source-of-truth inputs
- bypassing checklist gate rules when enabled
- cross-facility readiness computation

---

## 18. Audit & Explainability Requirements

Readiness MUST support:

- “Why is this case RED/ORANGE/GREEN?” explanations
- traceability from each deficit to:
  - requirement definition (Catalog anchored)
  - inventory state/event evidence
  - override record (if applicable)
  - attestation/checklist status (if applicable)

Readiness must be defensible under audit without relying on human memory.

---

## 19. Claude CLI Enforcement Rules

When operating under this LAW, Claude CLI:

### MUST:
- keep readiness computed (never manually set)
- use Inventory Events/State as truth (never DeviceEvents)
- keep overrides explicit and audited
- preserve determinism and facility boundaries
- keep readiness PHI-free

### MUST NOT:
- implement “admin override to GREEN”
- implement “scan equals verified” shortcuts
- implement silent “auto-corrections”
- allow readiness to drift from source-of-truth inputs

---

## 20. Violation Handling

If a request conflicts with this LAW:

1. The request MUST NOT be implemented  
2. The violation MUST be explicitly identified  
3. A compliant alternative MAY be proposed  
4. Partial or silent compliance is not allowed  

---

## 21. Amendment Procedure

This LAW may only be amended by:

1. creating a new version of this document  
2. explicitly enumerating changes  
3. confirming no conflicts with dependent LAW documents  
4. updating dependent specifications and implementations  

Implicit drift is prohibited.

---

## 22. Summary (Non-Negotiable)

Readiness is:
- computed
- deterministic
- auditable
- explainable
- PHI-free

Truth is decided only by:
- Catalog-anchored requirements
- Inventory Events/State
- explicit Overrides
- Attestations and checklist gates (documentation + gating)

Devices emit events, not truth.
