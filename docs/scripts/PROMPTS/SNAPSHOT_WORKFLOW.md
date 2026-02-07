You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Map the operational workflows end-to-end as implemented.

Output (separate sections):
A) Case lifecycle (create → schedule → dashboard → verify → timeout/debrief → complete)
B) Inventory lifecycle (catalog → check-in → location assignment → use → reconciliation if any)
C) Case Cards lifecycle (create/edit/version/status → link to case → print → feedback/review)

For each step:
- route(s) involved
- key components involved
- data reads/writes (API calls, DB operations)
- gating/role restrictions
No speculation; only what is implemented in code.
