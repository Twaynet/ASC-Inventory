# PHI Quiet Failure Audit

## Purpose

This document records the explicit audit performed to identify and eliminate
“quiet failure” paths where PHI-exposing API calls could bypass PHI access
controls without triggering errors or audit logs.

A “quiet failure” is defined as:
- A request that successfully returns PHI
- Without passing through `requirePhiAccess()`
- Or without supplying a valid `X-Access-Purpose` header
- And without generating a DENIED audit event

This audit was performed after completion of **PHI Phase 2**.

---

## Scope of Audit

The audit reviewed **all client-side API invocation paths**, including:

- Centralized API client (`apps/web/src/lib/api/client.ts`)
- Route-specific API helpers
- Direct `fetch()` calls bypassing the client abstraction
- CSV / export flows
- FormData-based uploads
- Background and utility requests

The authoritative PHI exposure classification was the
**PHI Blast Radius Map (Phase 2, Section C)**.

---

## Findings

### 1. Centralized Client (SAFE)

**File:** `apps/web/src/lib/api/client.ts`

- All API calls routed through the shared client
- Purpose resolution performed via `PHI_PURPOSE_RULES`
- `X-Access-Purpose` header injected automatically for all PHI_EXPOSING routes
- NON_PHI routes explicitly return `null` and do not inject headers

**Result:**  
✅ No quiet failure risk.

---

### 2. Direct `fetch()` Usage (REVIEWED)

#### 2.1 Admin CSV Export (FIXED)

**File:** `apps/web/src/app/(app)/admin/reports/page.tsx`

- **Endpoint:** `/reports/{type}?format=csv`
- **Classification:** PHI_EXPOSING
- **Issue:** Raw `fetch()` call bypassed API client
- **Risk:** Missing `X-Access-Purpose` header would cause silent PHI denial or mis-logging

**Resolution:**
- Explicit purpose mapping added inline:
  - Clinical reports → `AUDIT`
  - Financial reports → `BILLING`
- Header injected directly on the request

**Status:**  
🟢 Remediated

---

#### 2.2 Catalog Image Upload (SAFE)

**File:** `apps/web/src/lib/api/catalog.ts`

- **Endpoint:** `/catalog/:id/images/upload`
- **Classification:** NON_PHI
- **Reason:** Product image upload
- **Constraint:** FormData payload cannot use shared JSON client

**Status:**  
🟢 Safe by design

---

#### 2.3 Device Inventory Fetch (SAFE)

**File:** `apps/web/src/app/(app)/inventory/DayView.tsx`

- **Endpoint:** `/inventory/devices`
- **Classification:** PHI_ADJACENT
- **Behavior:** Returns device configuration and scan candidates
- **Note:** PHI guard intentionally not wired to this endpoint

**Status:**  
🟢 Safe per PHI Phase 2 scope

---

## Assertions

After remediation:

- All **PHI_EXPOSING** API calls include a valid `X-Access-Purpose`
- All PHI access is evaluated by `requirePhiAccess()`
- All denied or malformed PHI access attempts generate audit log entries
- No API path can return PHI without:
  - Purpose classification
  - Capability evaluation
  - Facility scoping
  - Audit logging

---

## Conclusion

The system contains **no remaining quiet failure paths** for PHI access.

All PHI exposure is:
- Intentional
- Classified
- Purpose-scoped
- Audited

This audit closes the PHI Phase 2 surface.

---

## References

- `docs/LAW/PHI_ACCESS_AND_RETENTION_LAW.md`
- PHI Phase 2 Blast Radius Map
- `requirePhiAccess()` middleware
- `phi_access_audit_log` schema
