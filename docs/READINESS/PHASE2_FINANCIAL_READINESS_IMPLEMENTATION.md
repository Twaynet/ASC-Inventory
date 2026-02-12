# Phase 2: Financial Readiness Implementation

## Overview

Phase 2 adds **observational, admin-only** financial risk tracking to the surgery request lifecycle. It is a separate layer that attaches to existing `surgery_request` records without coupling to Phase 1's state machine. It does NOT block scheduling, convert cases, or interact with payer APIs.

**Dual-track model:**
- **Clinic declarations** — what the referring clinic reports about the patient's financial status
- **ASC verifications** — what the ASC independently confirms

A deterministic cache computes a single `financialRiskState` (UNKNOWN/LOW/MEDIUM/HIGH) for dashboard visibility. Admin overrides take precedence over both tracks.

## Architecture

### Tables

| Table | Type | Purpose |
|-------|------|---------|
| `clinic_financial_declaration` | Append-only | Clinic-side financial declarations (entered by ASC admin on behalf of clinic) |
| `asc_financial_verification` | Append-only | ASC-side independent financial verifications |
| `financial_override` | Append-only | Admin overrides that take precedence over both tracks |
| `financial_readiness_cache` | Mutable | Deterministic snapshot of computed risk state (UPSERT) |

All append-only tables have `prevent_modification` triggers (no UPDATE, no DELETE).

### Enums

| Enum | Values |
|------|--------|
| `clinic_financial_state` | UNKNOWN, DECLARED_CLEARED, DECLARED_AT_RISK |
| `asc_financial_state` | UNKNOWN, VERIFIED_CLEARED, VERIFIED_AT_RISK |
| `override_state` | NONE, OVERRIDE_CLEARED, OVERRIDE_AT_RISK |
| `financial_risk_state` | UNKNOWN, LOW, MEDIUM, HIGH |
| `override_reason_code` | ADMIN_JUDGMENT, URGENT_CASE, CLINIC_CONFIRMED, PATIENT_PAID, OTHER |

### Risk Computation Rules

The `computeFinancialRisk()` function in `@asc/domain` applies these rules in order:

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | Override = OVERRIDE_CLEARED | LOW |
| 2 | Override = OVERRIDE_AT_RISK | HIGH |
| 3 | ASC = VERIFIED_AT_RISK | HIGH |
| 4 | Clinic = DECLARED_AT_RISK | MEDIUM |
| 5 | ASC = VERIFIED_CLEARED AND Clinic = DECLARED_CLEARED | LOW |
| 6 | Everything else (including partial clearance) | UNKNOWN |

Override clearing: Setting override state to `NONE` removes the override, falling back to the dual-track computation.

### Override Constraint

Database CHECK constraint enforces: `reason_code` must be NULL when `state = NONE`, and NOT NULL otherwise. Zod `.refine()` validates the same rule at the API layer.

## API Endpoints

All endpoints are admin-only, scoped to `target_facility_id`.

| Method | Path | Capability | Description |
|--------|------|-----------|-------------|
| GET | `/api/admin/financial-readiness/dashboard` | FINANCIAL_READINESS_VIEW | Paginated list with filters |
| GET | `/api/admin/financial-readiness/:requestId` | FINANCIAL_READINESS_VIEW | Detail with full event history |
| POST | `/api/admin/financial-readiness/:requestId/declare` | FINANCIAL_READINESS_EDIT | Record clinic declaration |
| POST | `/api/admin/financial-readiness/:requestId/verify` | FINANCIAL_READINESS_EDIT | Record ASC verification |
| POST | `/api/admin/financial-readiness/:requestId/override` | FINANCIAL_READINESS_EDIT | Record override (or clear with NONE) |

### Dashboard Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| riskState | UNKNOWN/LOW/MEDIUM/HIGH | Filter by computed risk |
| clinicId | UUID | Filter by source clinic |
| surgeonId | UUID | Filter by surgeon |
| dateFrom | YYYY-MM-DD | Scheduled date range start |
| dateTo | YYYY-MM-DD | Scheduled date range end |
| limit | 1-200 (default 50) | Page size |
| offset | >= 0 (default 0) | Page offset |

### Dashboard Correctness

The dashboard uses `LEFT JOIN financial_readiness_cache` with `COALESCE` defaults. Surgery requests without any financial events show `risk_state = UNKNOWN`, `clinic_state = UNKNOWN`, `asc_state = UNKNOWN`, `override_state = NONE`.

## Capabilities

| Capability | Description | Roles |
|-----------|-------------|-------|
| FINANCIAL_READINESS_VIEW | View dashboard and detail | ADMIN |
| FINANCIAL_READINESS_EDIT | Record declarations, verifications, overrides | ADMIN |

## Reason Codes

### Clinic Declaration Reason Codes
MISSING_AUTH, HIGH_DEDUCTIBLE, COVERAGE_UNCERTAIN, SELF_PAY_UNCONFIRMED, OTHER

### ASC Verification Reason Codes
BENEFIT_UNCONFIRMED, AUTH_PENDING, PATIENT_BALANCE_UNRESOLVED, COVERAGE_DENIED, OTHER

### Override Reason Codes
ADMIN_JUDGMENT, URGENT_CASE, CLINIC_CONFIRMED, PATIENT_PAID, OTHER

All reason codes are validated at the API layer by Zod schemas. Unknown strings are rejected with 400.

## Seed Data

Three surgery requests are seeded with financial data:

| Request | Status | Clinic | ASC | Override | Risk |
|---------|--------|--------|-----|----------|------|
| SR1 | SUBMITTED | CLEARED | Not verified | None | UNKNOWN |
| SR2 | ACCEPTED | CLEARED | CLEARED | None | LOW |
| SR3 | CONVERTED | AT_RISK | AT_RISK | CLEARED | LOW |

SR3 demonstrates override precedence: both tracks report AT_RISK, but the OVERRIDE_CLEARED brings risk to LOW.

## Smoke Test

```bash
# Prerequisites: API running, DB migrated + seeded
node --import tsx db/smoke-test-financial-readiness.ts
```

Tests:
1. Record ASC verification AT_RISK → risk = HIGH
2. Dashboard filter shows HIGH risk
3. Override CLEARED → risk = LOW
4. Dashboard filter shows LOW risk
5. Clear override (NONE) → risk = HIGH
6. Detail timeline shows all events
7. Record clinic declaration → verify computation rules
8. Append-only trigger blocks UPDATE
9. Surgery request status unchanged (no scheduling impact)

## Files

### New Files
- `apps/api/db/migrations/060_financial_readiness.sql`
- `packages/domain/src/financial-readiness.ts`
- `apps/api/src/schemas/financial-readiness.schemas.ts`
- `apps/api/src/services/financial-readiness.service.ts`
- `apps/api/src/routes/financial-readiness.routes.ts`
- `apps/web/src/lib/api/financial-readiness.ts`
- `apps/web/src/app/(app)/admin/financial-readiness/page.tsx`
- `apps/web/src/app/(app)/admin/financial-readiness/[requestId]/page.tsx`
- `apps/api/db/smoke-test-financial-readiness.ts`

### Modified Files
- `packages/domain/src/types.ts` — branded IDs, enums, capabilities
- `packages/domain/src/index.ts` — export financial-readiness module
- `apps/api/src/index.ts` — register routes
- `apps/api/db/seed.ts` — financial readiness seed data
- `apps/api/db/schema-sanity.ts` — new table/column/trigger checks
- `apps/web/src/app/components/AdminNav.tsx` — nav link
