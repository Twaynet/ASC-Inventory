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
docs/scripts/SNAPSHOTS/snapshot_result_WORKFLOW.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of operational workflows end-to-end as implemented.

Scope:
- Based solely on implemented code and committed artifacts
- Operational workflows only (not intended or idealized processes)
- No inferred steps
- No future-state assumptions
- No recommendations or refactoring commentary

Output requirements (separate sections, in this exact order):
A) Case lifecycle:
   create → schedule → dashboard → verify → timeout/debrief → complete
B) Inventory lifecycle:
   catalog → check-in → location assignment → use → reconciliation (if any)
C) Case Cards lifecycle:
   create → edit → version → status → link to case → print → feedback → review

For each lifecycle and for each step, include:
- Route(s) involved (web and/or API)
- Key components involved (pages, handlers, services)
- Data reads and writes:
  - API calls
  - Database tables or repositories touched
- Gating and role restrictions:
  - Role
  - Capability
  - Enforcement location (middleware, guard, component, route)

Verification rules:
- No speculation
- If any step, transition, or detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

Formatting must be deterministic.

Formatting rules:
- Fixed section order
- Fixed headings (exact text, case-sensitive)
- Lifecycle sections must appear exactly in the order specified above
- One step per line
- No bullets unless explicitly specified above
- No nested lists
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
