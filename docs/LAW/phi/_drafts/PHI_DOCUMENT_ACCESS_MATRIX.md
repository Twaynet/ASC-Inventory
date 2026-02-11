# PHI_DOCUMENT_ACCESS_MATRIX.md

> **DRAFT — NOT RATIFIED — DOCUMENTS NOT AUTHORIZED IN CORE APP**

## Status
**DRAFT — GOVERNANCE ARTIFACT**
(Companion to PHI_PHASE_6B_DOCUMENTS_LAW.md. Not an implementation authorization.)

---

## Purpose

This matrix defines **who may access which document types, when, and how** if PHI Phase 6B (Documents) is ever authorized.

It exists to:
- Prevent blanket “case access = document access”
- Force document-type–specific access decisions
- Make overexposure visible *before* code exists

If a document type or role is not explicitly listed here, access is **forbidden by default**.

---

## Governing Principles

1. **Document access is narrower than case access**
2. **Different documents imply different risks**
3. **Access must be role-, purpose-, and time-bound**
4. **No role has universal document access**
5. **Read ≠ Write ≠ Capture**

---

## Document Types (Candidate Set)

> These are candidates only. Authorization requires explicit LAW approval.

| Code | Document Type | Description |
|-----|---------------|-------------|
| DOC-CONSENT | Consent Verification | Metadata-only confirmation that consent exists (no PDF stored) |
| DOC-HP | History & Physical | External clinical reference document (discouraged) |
| DOC-IMPLANT | Implant Artifact | Photo or scanned artifact used for implant reconciliation |
| DOC-ADMIN | Administrative Upload | Insurance cards, referrals, misc (strongly discouraged) |

---

## Roles

| Role Code | Role Name |
|----------|-----------|
| ADMIN | Administrator |
| SURGEON | Surgeon |
| ANESTHESIA | Anesthesia |
| CIRCULATOR | Circulating Nurse |
| SCRUB | Scrub Tech |
| SCHEDULER | Scheduler |
| INVENTORY | Inventory Tech |

---

## Access Types

- **R** = Read (view document content)
- **W** = Write (upload / modify)
- **C** = Capture (take photo / attach artifact)
- **—** = No access

---

## Access Matrix

### DOC-CONSENT (Consent Verification — Metadata Only)

| Role | Access | Notes |
|----|--------|------|
| ADMIN | R | Oversight only |
| SURGEON | R | Confirm consent present |
| ANESTHESIA | R | Confirm anesthesia consent |
| CIRCULATOR | — | Not required |
| SCRUB | — | Not required |
| SCHEDULER | R | Scheduling verification |
| INVENTORY | — | Not required |

Retention: **None (metadata only)**  
Storage: **No document stored**

---

### DOC-HP (History & Physical)

| Role | Access | Notes |
|----|--------|------|
| ADMIN | R | Exceptional only |
| SURGEON | R | Pre-op reference |
| ANESTHESIA | R | Pre-op clearance |
| CIRCULATOR | — | Not required |
| SCRUB | — | Not required |
| SCHEDULER | — | Not required |
| INVENTORY | — | Not required |

Retention: **Short-term (pre-op only)**  
Strongly discouraged in favor of external system linkage.

---

### DOC-IMPLANT (Implant Artifact)

| Role | Access | Notes |
|----|--------|------|
| ADMIN | R | Oversight / audit |
| SURGEON | R | Case review |
| ANESTHESIA | — | Not required |
| CIRCULATOR | C | Capture intra-op |
| SCRUB | — | Not required |
| SCHEDULER | — | Not required |
| INVENTORY | R | Reconciliation |

Retention: **Short-lived (days–weeks)**  
Preferred alternative: **structured implant capture**

---

### DOC-ADMIN (Administrative Upload)

| Role | Access | Notes |
|----|--------|------|
| ADMIN | R | Only role allowed |
| SURGEON | — | Not required |
| ANESTHESIA | — | Not required |
| CIRCULATOR | — | Not required |
| SCRUB | — | Not required |
| SCHEDULER | — | Not required |
| INVENTORY | — | Not required |

Retention: **Undefined — NOT APPROVED**  
This category represents **highest scope-creep risk** and should not be authorized.

---

## Time-Bound Access Windows

| Document Type | Access Window |
|--------------|---------------|
| DOC-CONSENT | Pre-op → immediate post-op |
| DOC-HP | Pre-op only |
| DOC-IMPLANT | Intra-op → reconciliation |
| DOC-ADMIN | Undefined (prohibited) |

Access outside these windows requires **break-glass** with justification.

---

## Capability Mapping (Conceptual)

> Final capability names to be defined if Phase 6B proceeds.

| Capability | Grants |
|-----------|--------|
| PHI_DOCUMENT_READ | Read authorized document types |
| PHI_DOCUMENT_WRITE | Upload/modify documents |
| PHI_DOCUMENT_CAPTURE | Capture artifacts (camera/photo) |

Capabilities are **document-type scoped**, not global.

---

## Explicit Prohibitions

- No role receives blanket document access
- No document type may be accessed outside its defined window
- No document type may be added without updating this matrix
- No UI surface may expose documents without referencing this matrix
- No document access via operational endpoints

---

## Decision Gate

Phase 6B must **not** proceed unless:
- This matrix is approved
- Each authorized document type is justified
- Retention policies are agreed upon
- Structured-data alternatives have been explicitly rejected

---

## Notes

This matrix is intentionally conservative.  
Silence is denial. Absence means **no access**.

---

_End of access matrix._
