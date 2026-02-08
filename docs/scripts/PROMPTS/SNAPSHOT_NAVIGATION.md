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
docs/scripts/SNAPSHOTS/snapshot_result_NAVIGATION.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of application navigation and routing entrypoints.

Scope:
- Based solely on implemented code
- No inferred or conceptual user journeys
- No UX recommendations or refactoring suggestions
- Navigation and routing only (not business logic)

Output requirements:
1) Navigation components:
   - Component name
   - Where they render (layout, page, conditional wrapper)
   - File path
2) Links produced by navigation components:
   - Path
   - Display label
   - Conditions (role, auth state, feature gate) if any
   - Defining file path
3) Redirect rules and default landings:
   - Source path
   - Destination path
   - Condition (authenticated, unauthenticated, role-based)
   - Mechanism (middleware, layout guard, router logic)
4) Deep-link entrypoints:
   - Routes intended to be accessed directly (not via nav)
   - Required params
   - Access constraints if any
5) Unreachable or orphaned routes:
   - Routes present in code
   - No links or redirects pointing to them
   - Where defined

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

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
