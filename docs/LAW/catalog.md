# LAW: Catalog System  
**ASC Inventory Truth**

**Status:** NON-NEGOTIABLE  
**Authority Level:** SYSTEM LAW  
**Applies To:** All humans, all AI agents (including Claude CLI), all code paths  
**Last Updated:** 2026-01-25

---

## 1. Authority & Scope

This document defines binding **SYSTEM LAW** governing the **Catalog system** within the ASC Inventory Truth application.

Any implementation, refactor, automation, migration, or AI-generated output that conflicts with this document is **invalid** and **must not be executed**.

If a conflict exists between this document and any other specification, workflow, comment, or inferred behavior, **this document prevails**.

Ambiguity must always be resolved by **tightening constraints**, never loosening them.

---

## 2. Definition of Catalog

The **Catalog** defines the **universe of allowable item types** recognized by the system.

A **Catalog Item** represents:

> A *type* of item the system recognizes — not a physical instance.

Catalog Items are:
- Abstract
- Non-physical
- Non-consumable
- Time-invariant identifiers
- Semantic anchors for downstream systems

---

## 3. What the Catalog Is NOT (Explicit Prohibitions)

The Catalog **MUST NOT**:

- Track quantity
- Track stock levels
- Track physical location
- Track sterility state
- Track expiration
- Track availability
- Track case assignment
- Track usage
- Track lifecycle events
- Track ownership of physical objects

Any appearance of these concepts within the Catalog constitutes a **LAW violation**.

---

## 4. Canonical Responsibilities (Allowed)

The Catalog **MAY ONLY**:

- Define allowable item types
- Classify items into a fixed category set
- Provide stable identifiers referenced by other systems
- Store descriptive metadata
- Enable or disable future use via soft activation

No other responsibilities are permitted.

---

## 5. Canonical Data Model (Authoritative)

Every Catalog Item **MUST** include the following fields:

- `id` — immutable UUID
- `facility_id` — tenant boundary
- `name` — human-readable item name
- `description` — optional
- `category` — ENUM (closed set):
  - `IMPLANT`
  - `INSTRUMENT`
  - `HIGH_VALUE_SUPPLY`
  - `LOANER`
- `manufacturer`
- `catalog_number`
- `requires_sterility` — boolean
- `is_loaner` — boolean
- `active` — boolean (soft enable/disable)
- `created_at`
- `updated_at`

No additional fields may be added without formally amending this LAW.

---

## 6. Immutability & Identity Law

1. A Catalog Item’s `id` is immutable and permanent
2. Catalog Items **MUST NOT** be hard-deleted
3. Deactivation **MUST NOT** invalidate historical references
4. All historical references **MUST remain resolvable**
5. Catalog Items serve as **semantic anchors across time**

Breaking referential integrity is a **critical system violation**.

---

## 7. Relationship to Inventory (Strict Boundary)

- Catalog defines **what may exist**
- Inventory defines **what physically exists**

Rules:
- Inventory Items **MUST reference exactly one Catalog Item**
- Catalog **MUST NOT reference Inventory**
- Catalog **MUST NOT infer physical state**
- Inventory **MUST NOT redefine item meaning**

This is a **one-way dependency**: Inventory depends on Catalog, never the reverse.

---

## 8. Relationship to Preference Cards & Case Cards

- Preference Cards reference **Catalog Items**
- Case Cards derive requirements from **Catalog Items**
- Catalog **MUST NOT reference cases**
- Catalog **MUST NOT encode surgical or procedural context**

Catalog meaning must remain **procedure-agnostic**.

---

## 9. Allowed Operations

Only the following operations are lawful:

- Create Catalog Item
- Update descriptive metadata
- Activate Catalog Item
- Deactivate Catalog Item
- Read Catalog Items

Any operation not explicitly listed here is forbidden.

---

## 10. Forbidden Operations (Hard Stop)

The following actions are **illegal** under this LAW:

- Deleting Catalog Items
- Auto-creating Inventory Items from Catalog Items
- Encoding quantities or stock levels
- Encoding usage statistics
- Encoding per-case logic
- Encoding time-based lifecycle behavior
- Encoding scanner or device logic
- Encoding audit or event behavior

Any request proposing these actions **MUST be rejected**.

---

## 11. Audit & Historical Integrity

Catalog Items:
- MUST remain resolvable for all historical Inventory Events
- MUST remain resolvable for all past Cases
- MUST remain resolvable for all past Readiness calculations

Loss of resolution constitutes **audit failure**.

---

## 12. Claude CLI Enforcement Rules

When operating under this LAW, Claude CLI:

### MUST:
- Treat Catalog IDs as immutable
- Reject any attempt to introduce physical state
- Reject any attempt to infer quantity or availability
- Explicitly flag LAW violations
- Refuse to implement conflicting requests

### MUST NOT:
- Merge Catalog and Inventory concepts
- Introduce convenience shortcuts
- Assume small-scale systems justify relaxation of constraints

---

## 13. Violation Handling

If a request conflicts with this LAW:

1. The request **MUST NOT** be implemented
2. The violation **MUST** be explicitly identified
3. A compliant alternative **MAY** be proposed
4. Silent or partial compliance is **not allowed**

---

## 14. Amendment Procedure

This LAW may only be amended by:

1. Creating a new version of this document
2. Explicitly enumerating all changes
3. Justifying why constraints are being tightened or expanded
4. Updating all dependent specifications

Implicit drift is strictly prohibited.

---

## 15. Summary (Non-Negotiable)

The Catalog is:
- The semantic foundation of ASC Inventory Truth
- The anchor for audit integrity
- The first system that must be correct

If the Catalog is wrong, **every downstream system is untrustworthy**.
