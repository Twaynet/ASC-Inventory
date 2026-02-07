You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Inventory the CURRENT data model and persistence layer.

Output:
1) DB technology in use (Postgres/ORM/etc.) and where configured
2) All schema definitions (tables/models) with fields + key relationships
3) Enums/status fields that drive UI behavior
4) Migrations (ordered list, what each changes, factual only)
5) Seed data / fixtures (what exists, where loaded)
6) Notes on duplicated or conflicting models/names (factual only)

Include file paths for all definitions.
