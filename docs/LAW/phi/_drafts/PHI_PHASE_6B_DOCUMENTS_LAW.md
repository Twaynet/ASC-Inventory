# PHI_PHASE_6B_DOCUMENTS_LAW.md

> **DRAFT — NOT RATIFIED — DOCUMENTS NOT AUTHORIZED IN CORE APP**

Phase 6B Decision (Deferred)
After threat modeling and access analysis, the platform has determined that proper handling of clinical documents (including H&P, consent, and billing-relevant artifacts) requires long-term retention, broad but controlled access, and legal defensibility.

These requirements exceed the intended scope of Phase 6B at this time.

Therefore, document storage is intentionally deferred.
Documents remain external systems of record until a future phase explicitly authorizes full document lifecycle management.

## Status
**DRAFT — SKELETON ONLY**  
(Not yet ratified. No implementation authorized.)

---

## Purpose

Phase 6B governs the **introduction, storage, access, and retention of clinical documents** within the ASC Inventory Truth platform.

This phase addresses **unstructured PHI artifacts** (documents, images, scans) and establishes strict controls to prevent PHI overexposure, scope creep, and uncontrolled retention.

Phase 6B is intentionally conservative and subordinate to all prior PHI laws (Phases 1–6A).

---

## Scope

### In Scope (Conditional)
Only document types explicitly authorized by this LAW may be introduced.

### Explicitly Out of Scope (Unless Added by Amendment)
- Identity-only data (covered by Phase 6A)
- Outbound PHI transmission (exports, email, integrations)
- Printing, downloading, or offline access
- Analytics or reporting using document contents
- Any document type not explicitly enumerated

---

## Governing Principles

1. **Documents are PHI islands, not PHI rivers**
2. **No document is operationally required unless proven otherwise**
3. **Structured data is always preferred over files**
4. **Access is narrow, time-bound, and auditable**
5. **Retention is explicit and minimal**
6. **No document access without purpose, audit, and capability**

---

## Authorized Document Types

> This section MUST enumerate each allowed document type explicitly.

Each document type must define:
- Clinical purpose
- Allowed roles
- Access window
- Retention class

### Example (Placeholder — NOT APPROVED)
- Implant Artifact (Photo)
- Consent Verification (Metadata-only)
- [No other document types authorized]

No “generic upload” capability is permitted.

---

## Data Model Rules

1. Documents MUST reside in a dedicated PHI document domain
2. Documents MUST NOT be embedded in operational tables
3. Documents MUST be facility-scoped
4. Documents MUST reference cases by opaque identifier only
5. Document metadata MUST NOT include patient identifiers in filenames or paths

---

## Storage Rules

1. Documents MUST be stored outside the primary operational database
2. Object storage MUST enforce:
   - No public access
   - Per-object access control
   - Facility scoping
3. No document URLs may be permanent or guessable
4. Preview generation is prohibited unless explicitly authorized

---

## Access Control Rules

1. All document access MUST comply with existing PHI access laws (Phases 1–5)
2. Document access MUST require:
   - Explicit PHI_DOCUMENT_READ capability
   - Purpose-bound access
   - Audit logging (ALLOWED and DENIED)
3. Write access MUST require PHI_DOCUMENT_WRITE capability
4. Break-glass access applies per document access, not per case

---

## UI Rules

1. Documents MUST NOT be implicitly rendered
2. No document previews or thumbnails unless explicitly authorized
3. Document access MUST be user-initiated
4. Documents MUST NOT appear in:
   - Dashboards
   - Lists
   - Calendars
   - Audit UI

---

## Retention Rules

1. Each document type MUST declare a retention class
2. Retention MUST be minimal and time-bound
3. Deletion MUST:
   - Preserve audit records
   - Remove content access
4. Backup retention implications MUST be documented

---

## Audit & Observability

1. All document access MUST be auditable
2. Audit records MUST NOT contain document content
3. Document existence and access patterns MAY be analyzed in de-identified form
4. No audit UI may expose document contents

---

## Error & Logging Rules

1. Errors MUST NOT include document content or identifiers
2. Logs MUST NOT include filenames, paths, or extracted metadata
3. Content-type sniffing and EXIF passthrough are prohibited

---

## Explicit Prohibitions

The following are forbidden under Phase 6B unless explicitly authorized by amendment:

- Generic document uploads
- Bulk document access
- Printing or downloading documents
- Exporting document content
- Cross-facility document access
- Using documents as a source of truth for identity

---

## Change Control

- This LAW is additive only
- Amendments require:
  - Explicit document type addition
  - Updated access matrix
  - Updated retention declaration
- No implicit expansion is permitted

---

## Exit Criteria (Phase 6B Completion)

Phase 6B may be considered complete only if:

- Authorized document types are explicitly enumerated
- No unauthorized document types can be uploaded
- Document access is narrow, auditable, and time-bound
- Retention behavior is documented and enforced
- Phase 5 audit UI remains unchanged and PHI-free

---

## Relationship to Other PHI Laws

- Phase 1–5: Access, audit, retention, governance (unchanged)
- Phase 6A: Identity domain (unchanged)
- Phase 6B: Documents (this LAW)

No document may weaken or bypass any prior PHI LAW.

---

## Non-Goals

- Becoming a document management system
- Replacing the EHR
- Serving as a legal document repository
- Acting as a long-term archive

---

_End of LAW skeleton._
