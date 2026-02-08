EXECUTION MODE: This file is an executable instruction.
When invoked, EXECUTE the task immediately.
Do NOT analyze, summarize, or explain this file.
Follow all instructions exactly.

You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT rename anything.
DO NOT output patches, diffs, or commands that modify files.
DO NOT create new files other than the target file specified below.

Write the output/result into a plain UTF-8 text file.

Target path (relative to repo root):
docs/scripts/SNAPSHOTS/snapshot_result_AUTHORIZATION.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task: Produce a COMPREHENSIVE SNAPSHOT of authentication + authorization.

Scope:
- Based solely on implemented code
- No inferred or conceptual auth behavior
- No external standards unless explicitly implemented

Output requirements:
1) Where auth is established (providers, middleware, server/client boundaries)
2) Session/user model shape (fields used, types, source of truth)
3) Roles and capabilities (where defined, full list, mapping if any)
4) Enforcement points (middleware, layouts, pages, components, API calls)
5) Any debug/trace tooling that explains allow/deny
6) Call out any inconsistencies or duplicated logic (factual only)

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented code

Formatting must be deterministic.

Formatting rules:
- Fixed section order
- Fixed headings (exact text, case-sensitive)
- No bullets unless explicitly specified above
- One item per line
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output
- Section contents must be plain text lines, not nested lists

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.