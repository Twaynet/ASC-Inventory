You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Produce a COMPREHENSIVE SNAPSHOT of authentication + authorization.

Output:
1) Where auth is established (providers, middleware, server/client boundaries)
2) Session/user model shape (fields used, types, source of truth)
3) Roles and capabilities (where defined, full list, mapping if any)
4) Enforcement points (middleware, layouts, pages, components, API calls)
5) Any debug/trace tooling that explains allow/deny
6) Call out any inconsistencies or duplicated logic (factual only)

Use a deterministic outline. Include file paths for every item.
