# LAW: Inventory System  
**ASC Inventory Truth**

**Status:** NON-NEGOTIABLE  
**Authority Level:** SYSTEM LAW  
**Applies To:** All humans, all AI agents (including Claude CLI), all code paths  
**Last Updated:** 2026-01-25

---

## 1. Authority & Scope

This document defines binding **SYSTEM LAW** governing the **Inventory system** within the ASC Inventory Truth application.

Any implementation, refactor, automation, migration, or AI-generated output that conflicts with this document is **invalid** and **must not be executed**.

If a conflict exists between this document and any other specification, workflow, comment, or inferred behavior, **this document prevails**.

Ambiguity must always be resolved by **tightening constraints**, never loosening them.

---

## 2. Definition of Inventory

The **Inventory** system tracks **physical instances** of items recognized by the Catalog.

An **Inventory Item** represents:

> A specific, real, physical instance of a Catalog Item.

Inventory Items are:
- Instance-based
- Facility-scoped
- Case-aware (but not case-owned)
- Event-driven
- Auditable

---

## 3. What Inventory Is NOT (Explicit Prohibitions)

Inventory **MUST NOT**:

- Define item meaning (that is Catalog’s responsibility)
- Modify or reinterpret Catalog metadata
- Collapse event history into derived state without preserving events
- Auto-correct inconsistencies silently
- Back-date events
- Delete historical data
- Encode surgical workflow logic

Any violation of these boundaries constitutes a **LAW violation**.

---

## 4. Canonical Responsibilities (Allowed)

The Inventory system **MAY ONLY**:

- Track physical inventory items
- Track location of physical items
- Track sterility state
- Track availability state
- Track reservation for cases
- Track verification status
- Emit immutable audit events
- Support readiness determination

No other responsibilities are permitted.

---

## 5. Canonical Inventory Item Data Model (Authoritative)

Every Inventory Item **MUST** include the following fields:

- `id` — immutable UUID
- `facility_id` — tenant boundary
- `catalog_id` — foreign key to Catalog Item
- `serial_number` — optional
- `lot_number` — optional
- `barcode` — optional
- `location_id`
- `sterility_status` — ENUM:
  - `STERILE`
  - `NON_STERILE`
  - `EXPIRED`
  - `UNKNOWN`
- `sterility_expires_at` — nullable
- `availability_status` — ENUM:
  - `AVAILABLE`
  - `RESERVED`
  - `IN_USE`
  - `UNAVAILABLE`
  - `MISSING`
- `reserved_for_case_id` — nullable
- `last_verified_at` — nullable
- `last_verified_by_user_id` — nullable
- `created_at`
- `updated_at`

No additional fields may be added without formally amending this LAW.

---

## 6. Inventory Events (Append-Only Audit Log)

All meaningful state changes **MUST** produce an **Inventory Event**.

### Event Rules

- Inventory Events are **append-only**
- Inventory Events are **immutable**
- Inventory Events are **never deleted**
- Inventory Events are the **source of audit truth**

### Canonical Event Types

Inventory Events **MUST** be one of:

- `RECEIVED`
- `VERIFIED`
- `LOCATION_CHANGED`
- `STERILITY_CHANGED`
- `RESERVED`
- `RELEASED`
- `CONSUMED`
- `RETURNED`
- `EXPIRED`
- `ADJUSTED`

No implicit or inferred events are allowed.

---

## 7. Event → State Relationship

- Inventory Item state is **derived** from Inventory Events
- Inventory Events **must exist first**
- State **must not change** without an event
- Events **must not be inferred retroactively**

State without events constitutes **audit failure**.

---

## 8. Immutability & Deletion Law

1. Inventory Items **MUST NOT** be hard-deleted
2. Inventory Events **MUST NOT** be edited or deleted
3. Corrections **MUST** be represented by new events
4. Historical states **MUST remain reconstructable**

---

## 9. Relationship to Catalog (Strict Dependency)

- Every Inventory Item **MUST reference exactly one Catalog Item**
- Inventory **depends on Catalog**
- Catalog **MUST NOT depend on Inventory**
- Inventory **MUST NOT redefine Catalog meaning**

This dependency is **one-directional and non-negotiable**.

---

## 10. Relationship to Cases

Inventory Items:
- May be **reserved for** a case
- May be **verified against** a case
- Are **not owned by** a case
- Must persist independently of case lifecycle

Case cancellation or completion **MUST NOT** delete Inventory Items.

---

## 11. Device and Scanner Interaction

- Devices generate **Device Events**, not Inventory Events
- Device Events **MAY** trigger Inventory Events via explicit logic
- Raw device data **MUST be preserved**
- No Inventory state change may occur without a corresponding Inventory Event

---

## 12. Allowed Operations

Only the following operations are lawful:

- Check in new Inventory Item
- Change Inventory Item location
- Verify Inventory Item
- Reserve Inventory Item for a case
- Release Inventory Item reservation
- Consume Inventory Item
- Return Inventory Item
- Mark Inventory Item as expired
- Record Inventory adjustment (with justification)

Any operation not listed here is forbidden.

---

## 13. Forbidden Operations (Hard Stop)

The following actions are **illegal** under this LAW:

- Deleting Inventory Items
- Editing or deleting Inventory Events
- Back-dating events
- Silent state mutation
- Case-owned Inventory records
- Implicit corrections without events
- Auto-merging duplicate Inventory Items

---

## 14. Audit & Historical Integrity

Inventory data **MUST** support:

- Full event replay
- Historical state reconstruction
- Case readiness justification
- External audit inspection

Failure to support audit replay constitutes **system failure**.

---

## 15. Claude CLI Enforcement Rules

When operating under this LAW, Claude CLI:

### MUST:
- Treat Inventory Events as authoritative
- Reject silent state changes
- Reject event deletion or mutation
- Flag LAW violations explicitly
- Refuse to implement conflicting requests

### MUST NOT:
- Infer missing events
- Collapse audit history for convenience
- Modify Catalog through Inventory logic
- Optimize away compliance constraints

---

## 16. Violation Handling

If a request conflicts with this LAW:

1. The request **MUST NOT** be implemented
2. The violation **MUST** be explicitly identified
3. A compliant alternative **MAY** be proposed
4. Partial or silent compliance is **not allowed**

---

## 17. Amendment Procedure

This LAW may only be amended by:

1. Creating a new version of this document
2. Explicitly enumerating all changes
3. Justifying why constraints are being tightened or expanded
4. Updating all dependent specifications

Implicit drift is strictly prohibited.

---

## 18. Summary (Non-Negotiable)

The Inventory system is:
- The physical truth of the ASC
- The audit backbone of the application
- The foundation of readiness and safety

If Inventory is wrong, **patient safety and trust are compromised**.
