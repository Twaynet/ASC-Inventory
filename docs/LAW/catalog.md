# LAW: Catalog System (v2.0)
**ASC Inventory Truth**

**Status:** NON-NEGOTIABLE  
**Authority Level:** SYSTEM LAW  
**Applies To:** All humans, all AI agents (including Claude CLI), all code paths  
**Effective:** 2026-01-25  
**Supersedes:** Catalog LAW v1.x  
**Change Type:** Structural clarification + additive constraints (no relaxation)

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

> A *type* of physical thing the system recognizes — **not** a physical instance.

Catalog Items are:
- Abstract
- Non-physical
- Time-invariant identifiers
- Semantic anchors for downstream systems

Catalog Items exist to make downstream reasoning **deterministic, auditable, and safe**.

---

## 3. What the Catalog Is NOT (Hard Prohibitions)

The Catalog **MUST NOT**:

- Track quantity or stock levels  
- Track physical location  
- Track sterility *state*  
- Track expiration *state* (actual dates)  
- Track availability  
- Track ownership of physical instances  
- Track case assignment  
- Track usage or lifecycle events  
- Track device or scanner events  

Any appearance of these concepts within the Catalog is a **SYSTEM LAW violation**.

---

## 4. Orthogonal Classification Axes (FOUNDATIONAL)

The Catalog uses **multiple orthogonal axes**.  
These axes **MUST NOT** be collapsed, inferred from one another, or repurposed.

---

### 4A. Engine Category (Fixed, Non-Editable)

**Purpose:**  
Defines rule-bearing semantics for alarms, readiness, and safety logic.

**Allowed values ONLY:**
- `IMPLANT`
- `INSTRUMENT`
- `EQUIPMENT`
- `MEDICATION`
- `CONSUMABLE`
- `PPE`

**Rules:**
- Engine Categories are **NOT admin-editable**
- Engine Categories MUST remain **small and stable**
- Engine Categories MUST NOT encode supply, ownership, workflow, or organization
- Adding or changing a category requires an explicit SYSTEM LAW amendment

**Engine Category answers:**  
> “What kind of physical thing is this, in a way the engine can reason about safely?”

---

### 4B. Supply Mode (Separate Axis — NOT a Category)

**Purpose:**  
Defines how an item is supplied, owned, and reconciled.

**Allowed values:**
- `STOCKED`
- `CONSIGNMENT`
- `LOANER`
- `DIRECT_SHIP`
- `PATIENT_SPECIFIC`

**Rules:**
- Supply Mode MUST NOT be encoded as a category
- “Loaner” and “Consignment” are **explicitly forbidden** as categories
- Supply Mode may affect reconciliation workflows
- Supply Mode MUST NOT create readiness requirements

**Supply Mode answers:**  
> “How does this item enter, exist in, and leave the facility?”

---

### 4C. Risk / Intent Flags (Policy-Driven)

**Purpose:**  
Tune system behavior without redefining what an item is.

Examples:
- `requires_lot_tracking`
- `requires_serial_tracking`
- `requires_expiration_tracking`
- `criticality`
- `readiness_required`
- `expiration_warning_days`
- `substitutable`

**Rules:**
- Intent flags declare expectations only
- Intent flags MUST NOT create physical state
- Intent flags MUST NOT create global readiness requirements
- Intent flags MUST NOT bypass case-scoped requirements

**Intent answers:**  
> “What does the system need to care about for this item?”

---

### 4D. Facility Groups (Human Organization Only)

**Purpose:**  
Allow ASC-specific organization, reporting, and mental models.

**Rules:**
- Groups are facility-defined and admin-editable
- Items may belong to multiple groups
- Groups MUST NOT drive alarms, readiness, or enforcement logic
- Groups exist for UI, reporting, and purchasing only

**Groups answer:**  
> “How do humans want to organize and talk about this item?”

---

## 5. Canonical Data Model (Authoritative)

Every Catalog Item **MUST** include the following fields:

### Identity & Metadata
- `id` — immutable UUID  
- `facility_id` — tenant boundary  
- `name` — human-readable name  
- `description` — optional  
- `manufacturer`  
- `catalog_number`  
- `active` — boolean (soft enable/disable)  
- `created_at`  
- `updated_at`

### Engine Classification
- `category` — ENUM (Section 4A)

### Risk / Intent
- `requires_lot_tracking` — boolean  
- `requires_serial_tracking` — boolean  
- `requires_expiration_tracking` — boolean  
- `criticality` — ENUM (`CRITICAL` | `IMPORTANT` | `ROUTINE`)  
- `readiness_required` — boolean  
- `expiration_warning_days` — integer | null  
- `substitutable` — boolean  

---

### Explicit Deprecations

The following concepts are **no longer lawful** in the Catalog:

- `HIGH_VALUE_SUPPLY` category  
- `LOANER` category  
- `is_loaner` boolean  

These concerns are handled exclusively by **Supply Mode** or downstream systems.

---

## 6. Immutability & Identity Law

1. A Catalog Item’s `id` is immutable and permanent  
2. Catalog Items MUST NOT be hard-deleted  
3. Deactivation MUST NOT invalidate historical references  
4. All historical references MUST remain resolvable  
5. Catalog Items serve as semantic anchors across time  

Breaking referential integrity is a **critical system violation**.

---

## 7. Relationship to Inventory (Strict Boundary)

- Catalog defines **what may exist**
- Inventory defines **what physically exists**

Rules:
- Inventory Items MUST reference exactly one Catalog Item
- Catalog MUST NOT reference Inventory
- Catalog MUST NOT infer physical state
- Inventory MUST NOT redefine item meaning

This is a **one-way dependency**.

---

## 8. Relationship to Preference Cards & Cases

- Preference Cards reference Catalog Items
- Case requirements derive from Catalog Items
- Catalog MUST NOT reference cases
- Catalog MUST remain procedure-agnostic

---

## 9. Allowed Operations

The following operations are lawful:

- Create Catalog Item  
- Update descriptive metadata  
- Activate Catalog Item  
- Deactivate Catalog Item  
- Read Catalog Items  

All other operations are forbidden.

---

## 10. Forbidden Operations (Hard Stop)

It is illegal to:

- Delete Catalog Items  
- Encode quantities or stock levels  
- Encode usage statistics  
- Encode per-case logic  
- Encode lifecycle or event history  
- Encode scanner or device behavior  

Any such request **MUST be rejected**.

---

## 11. Audit & Historical Integrity

Catalog Items MUST remain resolvable for:
- Inventory events
- Past cases
- Past readiness evaluations

Loss of resolution constitutes **audit failure**.

---

## 12. Enforcement (Claude CLI & Humans)

Any actor operating under this LAW MUST:

- Treat Catalog IDs as immutable
- Reject physical-state leakage
- Reject axis collapse (category ≠ supply ≠ groups)
- Explicitly flag LAW violations

Silence or partial compliance is prohibited.

---

## 13. Amendment Procedure

This LAW may only be amended by:

1. Issuing a new version  
2. Explicitly enumerating changes  
3. Justifying tightened or expanded constraints  
4. Updating dependent specifications  

Implicit drift is strictly prohibited.

---

## 14. Final Statement (Non-Negotiable)

The Catalog is the **semantic foundation** of ASC Inventory Truth.

If the Catalog is ambiguous,  
every downstream system becomes untrustworthy.

**Correctness here is not optional.**

---

# Amendment: Catalog v2.1 — Set / Kit Definitions & Component Expectations
**Effective:** 2026-01-25  
**Change Type:** Additive (No removals, no boundary relaxation)

This amendment introduces **Catalog-level Set (Kit/Tray) Definitions** to support
loaner sets, instrument trays, and composite items where **expected composition**
must be known independently of any physical instance.

This amendment is REQUIRED to safely support:
- Loaner instrument sets
- Trays with many discrete components
- Verification workflows for completeness
- Staff onboarding and visual disambiguation

This amendment does NOT introduce physical state, verification truth, or readiness logic.

---

## A. Definition: Catalog Set

A **Catalog Set** is a Catalog Item that represents a *defined collection of component items*.

Examples:
- Loaner instrument set
- Arthroscopy tray
- Power tool kit
- Implant system tray

A Catalog Set:
- Is NOT a physical instance
- Does NOT prove completeness
- Does NOT assert availability
- Does NOT assert readiness

It defines **expectation only**.

---

## B. Set Classification Rule

A Catalog Set MUST:
- Be a normal Catalog Item
- Use an appropriate Engine Category (typically `INSTRUMENT` or `EQUIPMENT`)
- Use Supply Mode `LOANER` or `STOCKED` (outside Catalog, per Supply Mode LAW)

A Set is **not** a special category.

---

## C. Catalog Set Components (Expectation Only)

A Catalog Set MAY define a list of **Set Components**.

Each Set Component MUST include:
- `set_catalog_id` — UUID (the parent set)
- `component_catalog_id` — UUID (the expected item type)
- `required_quantity` — integer ≥ 0
- `optional_quantity` — integer ≥ 0 (optional)
- `notes` — text (optional, descriptive only)
- `reference_images[]` — optional URLs or asset references

**Meaning:**
> “A complete instance of this set is expected to include these components.”

---

## D. Explicit Non-Guarantees (Hard Boundary)

Catalog Set Definitions:
- DO NOT prove a component exists
- DO NOT prove a component is present
- DO NOT prove sterility
- DO NOT prove readiness
- DO NOT replace verification workflows
- DO NOT create inventory records

Any attempt to treat a Set Definition as proof is a **SYSTEM LAW violation**.

---

## E. Images (Documentation, Not Evidence)

Reference images:
- MAY be attached to Catalog Sets
- MAY be attached to Set Components
- Exist solely to assist human recognition

Images MUST NOT:
- Assert correctness
- Assert completeness
- Assert verification
- Assert readiness
- Substitute for attestation or inventory events

Images are **documentation**, not evidence.

---

## F. Relationship to Inventory (Strict)

Inventory is the ONLY system allowed to determine:
- Whether a specific set instance exists
- Whether components are present or missing
- Whether substitutions were accepted
- Whether a set is complete for a case

Inventory verification MUST be expressed via:
- Inventory events
- Attestations
- Overrides (per Readiness LAW)

Catalog Set Definitions are inputs to these workflows — never outputs.

---

## G. Relationship to Devices

DeviceEvents MAY:
- Assist lookup
- Assist data entry
- Assist verification workflows

DeviceEvents MUST NOT:
- Satisfy component presence
- Satisfy completeness
- Create inventory truth

---

## H. Enforcement Requirement

Any implementation using Catalog Sets MUST ensure:
1. Set Definitions are read-only during verification
2. Physical completeness is determined only at Inventory layer
3. Missing components generate explicit verification outcomes
4. Substitution is permitted only if Catalog intent allows it

Violation of any rule above is a SYSTEM LAW violation.

---

## I. Summary (Non-Negotiable)

Catalog Sets define **what should be there**.  
Inventory determines **what actually is there**.

This separation is mandatory for loaner safety, auditability, and staff trust.

---
