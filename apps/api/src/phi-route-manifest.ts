/**
 * PHI Route Manifest — Canonical Registry of PHI-Guarded Routes
 *
 * Phase 4D: Governance Guardrails
 *
 * Every route that calls `requirePhiAccess(...)` MUST be declared here.
 * The governance validation (phi-governance.ts) cross-references this
 * manifest against the actual Fastify route table at startup to detect:
 *   - UNDECLARED_PHI_ROUTE:    route has guard but is not in manifest
 *   - MISSING_MANIFEST_ENTRY:  manifest entry has no matching route
 *
 * Additions to PHI-guarded routes MUST be reflected here.
 * Removals of PHI-guarded routes MUST be reflected here.
 *
 * This file is the single source of truth for "which routes touch PHI."
 */

export interface PhiRouteEntry {
  method: string;
  url: string;
  classification: 'PHI_CLINICAL' | 'PHI_BILLING' | 'PHI_AUDIT';
  hasExport?: boolean;  // true for routes that support ?format=csv with enforceExportPurpose
}

export const PHI_ROUTE_MANIFEST: PhiRouteEntry[] = [
  // ============================================================================
  // CASES (/api/cases)
  // ============================================================================

  // [CONTRACT] GET /cases — List cases
  { method: 'GET',    url: '/api/cases',                           classification: 'PHI_CLINICAL' },
  // [CONTRACT] GET /cases/:caseId — Get case details
  { method: 'GET',    url: '/api/cases/:caseId',                   classification: 'PHI_CLINICAL' },
  // [CONTRACT] PATCH /cases/:caseId — Update case
  { method: 'PATCH',  url: '/api/cases/:caseId',                   classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/approve — Approve case
  { method: 'POST',   url: '/api/cases/:caseId/approve',           classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/reject — Reject case
  { method: 'POST',   url: '/api/cases/:caseId/reject',            classification: 'PHI_CLINICAL' },
  // [CONTRACT] PATCH /cases/:caseId/assign-room — Assign room
  { method: 'PATCH',  url: '/api/cases/:caseId/assign-room',       classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases — Create case
  { method: 'POST',   url: '/api/cases',                           classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/activate — Activate case
  { method: 'POST',   url: '/api/cases/:caseId/activate',          classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/deactivate — Deactivate case
  { method: 'POST',   url: '/api/cases/:caseId/deactivate',        classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/cancel — Cancel case
  { method: 'POST',   url: '/api/cases/:caseId/cancel',            classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /cases/:caseId/check-in-preop — Check in to PreOp
  { method: 'POST',   url: '/api/cases/:caseId/check-in-preop',    classification: 'PHI_CLINICAL' },
  // [CONTRACT] GET /cases/:caseId/status-events — Status events
  { method: 'GET',    url: '/api/cases/:caseId/status-events',     classification: 'PHI_CLINICAL' },
  // POST /cases/:id/preference-card — Select preference card (legacy)
  { method: 'POST',   url: '/api/cases/:id/preference-card',       classification: 'PHI_CLINICAL' },
  // PUT /cases/:id/requirements — Set case requirements (legacy)
  { method: 'PUT',    url: '/api/cases/:id/requirements',          classification: 'PHI_CLINICAL' },
  // DELETE /cases/:id — Delete case (legacy)
  { method: 'DELETE', url: '/api/cases/:id',                       classification: 'PHI_CLINICAL' },

  // ============================================================================
  // INVENTORY (/api/inventory)
  // ============================================================================

  // [CONTRACT] POST /inventory/events — Record single event
  { method: 'POST',   url: '/api/inventory/events',                classification: 'PHI_CLINICAL' },
  // [CONTRACT] POST /inventory/events/bulk — Bulk events
  { method: 'POST',   url: '/api/inventory/events/bulk',           classification: 'PHI_CLINICAL' },
  // POST /inventory/events/financial — Financial attribution event
  { method: 'POST',   url: '/api/inventory/events/financial',      classification: 'PHI_CLINICAL' },

  // ============================================================================
  // READINESS (/api/readiness)
  // ============================================================================

  // GET /readiness/day-before — Day-before readiness
  { method: 'GET',    url: '/api/readiness/day-before',            classification: 'PHI_CLINICAL' },
  // GET /readiness/cases/:id — Single case readiness
  { method: 'GET',    url: '/api/readiness/cases/:id',             classification: 'PHI_CLINICAL' },
  // POST /readiness/attestations — Create attestation
  { method: 'POST',   url: '/api/readiness/attestations',          classification: 'PHI_CLINICAL' },
  // GET /readiness/cases/:id/attestations — Get attestations for case
  { method: 'GET',    url: '/api/readiness/cases/:id/attestations', classification: 'PHI_CLINICAL' },
  // GET /readiness/cases/:id/verification — Verification status for case
  { method: 'GET',    url: '/api/readiness/cases/:id/verification', classification: 'PHI_CLINICAL' },

  // ============================================================================
  // CHECKLISTS (/api — bare prefix)
  // ============================================================================

  // GET /cases/:id/checklists — Get checklists for case
  { method: 'GET',    url: '/api/cases/:id/checklists',                     classification: 'PHI_CLINICAL' },
  // POST /cases/:id/checklists/start — Start a checklist
  { method: 'POST',   url: '/api/cases/:id/checklists/start',              classification: 'PHI_CLINICAL' },
  // POST /cases/:id/checklists/:type/respond — Record response
  { method: 'POST',   url: '/api/cases/:id/checklists/:type/respond',      classification: 'PHI_CLINICAL' },
  // POST /cases/:id/checklists/:type/sign — Add signature
  { method: 'POST',   url: '/api/cases/:id/checklists/:type/sign',         classification: 'PHI_CLINICAL' },
  // POST /cases/:id/checklists/:type/complete — Complete checklist
  { method: 'POST',   url: '/api/cases/:id/checklists/:type/complete',     classification: 'PHI_CLINICAL' },
  // POST /cases/:id/checklists/debrief/async-review — Async review
  { method: 'POST',   url: '/api/cases/:id/checklists/debrief/async-review', classification: 'PHI_CLINICAL' },

  // ============================================================================
  // CASE DASHBOARD (/api/case-dashboard)
  // ============================================================================

  // GET /case-dashboard/:caseId — Dashboard data
  { method: 'GET',    url: '/api/case-dashboard/:caseId',                         classification: 'PHI_CLINICAL' },
  // POST /case-dashboard/:caseId/attest — Attest readiness
  { method: 'POST',   url: '/api/case-dashboard/:caseId/attest',                  classification: 'PHI_CLINICAL' },
  // POST /case-dashboard/:caseId/void — Void attestation
  { method: 'POST',   url: '/api/case-dashboard/:caseId/void',                    classification: 'PHI_CLINICAL' },
  // PUT /case-dashboard/:caseId/anesthesia — Update anesthesia plan
  { method: 'PUT',    url: '/api/case-dashboard/:caseId/anesthesia',              classification: 'PHI_CLINICAL' },
  // PUT /case-dashboard/:caseId/link-case-card — Link case card
  { method: 'PUT',    url: '/api/case-dashboard/:caseId/link-case-card',          classification: 'PHI_CLINICAL' },
  // POST /case-dashboard/:caseId/case-card-unlink — Unlink case card
  { method: 'POST',   url: '/api/case-dashboard/:caseId/case-card-unlink',        classification: 'PHI_CLINICAL' },
  // GET /case-dashboard/:caseId/case-card-link — Link status + history
  { method: 'GET',    url: '/api/case-dashboard/:caseId/case-card-link',          classification: 'PHI_CLINICAL' },
  // POST /case-dashboard/:caseId/overrides — Add override
  { method: 'POST',   url: '/api/case-dashboard/:caseId/overrides',               classification: 'PHI_CLINICAL' },
  // PUT /case-dashboard/:caseId/overrides/:overrideId — Modify override
  { method: 'PUT',    url: '/api/case-dashboard/:caseId/overrides/:overrideId',   classification: 'PHI_CLINICAL' },
  // DELETE /case-dashboard/:caseId/overrides/:overrideId — Revert override
  { method: 'DELETE', url: '/api/case-dashboard/:caseId/overrides/:overrideId',   classification: 'PHI_CLINICAL' },
  // GET /case-dashboard/:caseId/event-log — Event log
  { method: 'GET',    url: '/api/case-dashboard/:caseId/event-log',               classification: 'PHI_CLINICAL' },
  // PUT /case-dashboard/:caseId/case-summary — Update case summary
  { method: 'PUT',    url: '/api/case-dashboard/:caseId/case-summary',            classification: 'PHI_CLINICAL' },
  // PUT /case-dashboard/:caseId/scheduling — Update scheduling
  { method: 'PUT',    url: '/api/case-dashboard/:caseId/scheduling',              classification: 'PHI_CLINICAL' },

  // ============================================================================
  // REPORTS (/api/reports)
  // ============================================================================

  // GET /reports/checklist-compliance — Checklist compliance report
  { method: 'GET',    url: '/api/reports/checklist-compliance',    classification: 'PHI_CLINICAL', hasExport: true },
  // GET /reports/case-summary — Case summary report
  { method: 'GET',    url: '/api/reports/case-summary',            classification: 'PHI_CLINICAL', hasExport: true },
  // GET /reports/vendor-concessions — Vendor concessions report
  { method: 'GET',    url: '/api/reports/vendor-concessions',      classification: 'PHI_BILLING',  hasExport: true },
  // GET /reports/inventory-valuation — Inventory valuation report
  { method: 'GET',    url: '/api/reports/inventory-valuation',     classification: 'PHI_BILLING',  hasExport: true },
  // GET /reports/loaner-exposure — Loaner exposure report
  { method: 'GET',    url: '/api/reports/loaner-exposure',         classification: 'PHI_BILLING',  hasExport: true },
  // GET /reports/cancelled-cases — Cancelled cases report
  { method: 'GET',    url: '/api/reports/cancelled-cases',         classification: 'PHI_CLINICAL', hasExport: true },
  // GET /reports/case-timelines — Case timelines report
  { method: 'GET',    url: '/api/reports/case-timelines',          classification: 'PHI_CLINICAL', hasExport: true },
  // GET /reports/debrief-summary — Debrief summary report
  { method: 'GET',    url: '/api/reports/debrief-summary',         classification: 'PHI_CLINICAL', hasExport: true },
  // GET /reports/case-event-log — Case event log report
  { method: 'GET',    url: '/api/reports/case-event-log',          classification: 'PHI_CLINICAL', hasExport: true },

  // ============================================================================
  // SCHEDULE (/api/schedule)
  // ============================================================================

  // GET /schedule/day — Day schedule
  { method: 'GET',    url: '/api/schedule/day',                    classification: 'PHI_CLINICAL' },
  // GET /schedule/unassigned — Unassigned cases
  { method: 'GET',    url: '/api/schedule/unassigned',             classification: 'PHI_CLINICAL' },

  // ============================================================================
  // AI (/api/ai)
  // ============================================================================

  // POST /ai/explain-readiness — AI readiness explanation
  { method: 'POST',   url: '/api/ai/explain-readiness',           classification: 'PHI_CLINICAL' },

  // ============================================================================
  // PHI AUDIT (/api/phi-audit) — Phase 3 + Phase 4
  // ============================================================================

  // GET /phi-audit — List audit entries
  { method: 'GET',    url: '/api/phi-audit',                       classification: 'PHI_AUDIT' },
  // GET /phi-audit/stats — Audit statistics
  { method: 'GET',    url: '/api/phi-audit/stats',                 classification: 'PHI_AUDIT' },
  // GET /phi-audit/:id — Single audit entry
  { method: 'GET',    url: '/api/phi-audit/:id',                   classification: 'PHI_AUDIT' },
  // Phase 4: Audit analytics
  // GET /phi-audit/sessions — Session-grouped audit entries
  { method: 'GET',    url: '/api/phi-audit/sessions',              classification: 'PHI_AUDIT' },
  // GET /phi-audit/excessive-denials — Excessive denial detection
  { method: 'GET',    url: '/api/phi-audit/excessive-denials',     classification: 'PHI_AUDIT' },
  // GET /phi-audit/analytics — Combined analytics summary
  { method: 'GET',    url: '/api/phi-audit/analytics',             classification: 'PHI_AUDIT' },
  // Phase 4: Retention
  // GET /phi-audit/retention — Paginated retention status
  { method: 'GET',    url: '/api/phi-audit/retention',             classification: 'PHI_AUDIT' },
  // GET /phi-audit/retention/:entityId — Single entity retention
  { method: 'GET',    url: '/api/phi-audit/retention/:entityId',   classification: 'PHI_AUDIT' },
];
