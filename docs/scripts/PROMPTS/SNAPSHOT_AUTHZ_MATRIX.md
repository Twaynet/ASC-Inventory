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
docs/scripts/SNAPSHOTS/snapshot_result_AUTHZ_MATRIX.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of the effective authorization model as implemented (AUTHZ MATRIX).

Scope:
- Based solely on implemented code and committed artifacts
- Authorization only (roles, capabilities, feature gating, route enforcement)
- Include both API-side enforcement and web/UI gating
- No inferred or conceptual policy
- No recommendations or refactoring commentary

Output requirements (fixed section order):

A) Source of truth locations
- List every file where roles, capabilities, or feature access rules are defined
- For each: file path + what it defines

B) Roles
- Full list of roles
- Where defined (file paths)

C) Capabilities
- Full list of capabilities
- Where defined (file paths)

D) Role → Capability mapping
- For each role: list derived capabilities
- Include defining file path(s)
- If there are multiple mappings (duplicated logic), list each location and note duplication (factual only)

E) API enforcement matrix (route-level)
- For each API route: METHOD + PATH + defining file
- Enforcement mechanism: requireAdmin / requireScheduler / requireRoles / requireCapabilities / other
- Required roles and/or capabilities (as implemented)
- Notes on mismatches or inconsistencies across routes (factual only)

F) Web/UI enforcement matrix (route/page/component-level)
- For each web route/page: route + defining file
- Any layout guards (AuthGuard, middleware) affecting access
- Any AccessGuard / feature gating rules applied (required role/capability)
- If a page is reachable by URL but hidden by navigation, note it (factual only)

G) Effective access summary (matrix by role)
- For each role:
  - Web pages/features accessible
  - API routes accessible
- Only include access that is provable from code

H) Divergences between client and server enforcement (factual only)
- Cases where UI allows but API forbids
- Cases where UI forbids but API allows
- Cases where capability model exists but is unused or partially applied

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

Formatting must be deterministic.

Formatting rules:
- Fixed section order (A through H)
- Fixed headings (exact text, case-sensitive)
- One item per line
- No bullets unless explicitly specified above
- No nested lists
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
