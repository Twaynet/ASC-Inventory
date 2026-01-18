You are working in the ASC Inventory Truth repo.

Authoritative vocabulary is defined in: docs/nomenclature.md (or nomenclature.md at repo root if present).
You MUST follow it exactly and treat it as normative.

Canonical terms:
- Case = a single scheduled surgical event (one-time occurrence)
- Case Card = a versioned, reusable procedural template
- Surgical Card = DEPRECATED / forbidden term (do not use in UI, code, docs, variable names, comments, or strings)
- Case Dashboard = execution workspace for a specific Case
- Attestation of Readiness = time-stamped declaration tied to a Case

Hard rules:
1) Never use the phrase “Surgical Card” anywhere.
2) If user asks for “surgical card,” interpret as “Case Card” and correct wording in outputs.
3) UI labels, route names, component names, DB fields, and API schemas must use canonical terms only.
4) If existing code uses old terms, propose a migration plan (aliasing, redirects, and data migration) rather than silently mixing terms.

Before making changes, quickly check for existing naming patterns and keep internal consistency.
