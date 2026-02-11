# PHI AUDIT UI & OPERATIONAL VISIBILITY LAW (PHASE 5)

**Status:** ACTIVE  
**Phase:** 5  
**Scope:** Admin-only, read-only audit visibility and operational workflows  
**Effective Date:** Upon Phase 5 implementation  

**Depends On:**
- PHI_ACCESS_AND_RETENTION_LAW.md
- PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW.md

---

## 1. Purpose

Phase 5 converts the PHI compliance, logging, analytics, retention, and governance
infrastructure built in Phases 1–4 into **human-operable visibility**.

This phase is **observational only**.

No PHI data is created, modified, deleted, reclassified, or purged.

---

## 2. Core Principle

**Visibility without authority.**

Phase 5 allows administrators to *see* what the system already knows — nothing more.

---

## 3. Authorized Users

### 3.1 Capability Requirement

All Phase 5 functionality requires:

PHI_AUDIT_ACCESS

Currently granted only to:
- ADMIN

### 3.2 Enforcement

- Capability checks MUST be enforced server-side and client-side
- UI gating alone is insufficient
- API denial is authoritative

---

## 4. Read-Only Invariant (Absolute)

Phase 5 MUST NOT introduce:

- POST, PUT, PATCH, DELETE actions on PHI audit data
- Retention overrides or purge execution
- Manual annotations or acknowledgements
- Any mutation of:
  - phi_access_audit_log
  - phi_export_audit_log
  - retention state
  - breach metadata

Audit data is immutable by LAW.

---

## 5. Allowed Surfaces

### 5.1 Audit Visibility Endpoints

- GET /api/phi-audit
- GET /api/phi-audit/:id
- GET /api/phi-audit/stats
- GET /api/phi-audit/sessions
- GET /api/phi-audit/excessive-denials
- GET /api/phi-audit/analytics

### 5.2 Retention Visibility Endpoints

- GET /api/phi-audit/retention
- GET /api/phi-audit/retention/:entityId

No new backend endpoints are permitted in Phase 5.

---

## 6. Data Exposure Constraints

### 6.1 Breach Context

- Breach metadata MUST remain hashed
- UI MUST NOT decode, reverse, enrich, or geo-resolve breach data
- No IP, user-agent, or identity reconstruction is permitted

### 6.2 PHI Content

The audit UI MUST NOT display:
- Patient names
- MRNs
- DOB
- Free-text clinical notes

Case references may appear only as IDs or metadata already exposed elsewhere.

---

## 7. Analytics & Interpretation Boundary

### 7.1 Server Authority

All analytics MUST be computed server-side:
- Session grouping
- Suspicious access flags
- Excessive denial detection
- Emergency access counts
- Retention classification

### 7.2 UI Prohibition

The UI MUST NOT:
- Recompute analytics
- Infer new risk states
- Override or reinterpret server flags

The UI is a viewer, not an analyst.

---

## 8. Pagination & Performance

- All Phase 5 list views MUST use server-side pagination
- No client-side fetch-all behavior is permitted
- UI MUST respect limit, offset, and date filters

---

## 9. Export Discipline

### 9.1 Export Rules

- CSV export is permitted only via existing export endpoints
- All exports:
  - Require AUDIT purpose
  - Must pass enforceExportPurpose()
  - Must generate export audit entries

### 9.2 UI Constraints

- No direct download links
- No client-side CSV generation
- No bypass of API export enforcement

---

## 10. Governance Guarantees

Phase 5 MUST NOT weaken:
- PHI route governance validation
- Route manifest enforcement
- Fail-closed startup behavior
- Emergency access discipline
- Time-bound access enforcement

All Phase 1–4 invariants remain intact.

---

## 11. Explicit Non-Goals (Locked)

Phase 5 does NOT include:
- PHI deletion or purge execution
- Retention override actions
- Automated alerts or schedulers
- Background jobs
- New roles or capabilities
- Write-back annotations
- Real-time streaming or WebSockets
- Client-side risk scoring

---

## 12. Success Criteria

Phase 5 is complete when:
1. Admins can view audit sessions grouped by user
2. Sessions are drillable to individual access entries
3. Suspicious and emergency access is clearly visible
4. Excessive denial patterns are discoverable
5. Retention status is visible and filterable
6. CSV exports require AUDIT purpose
7. No write paths exist
8. All type checks pass
9. All Phase 1–4 invariants remain enforced

---

## 13. Design Intent

Phase 5 exists to answer:

“Could a human auditor understand what happened?”

It does not change what *can* happen — only what can be *seen*.
