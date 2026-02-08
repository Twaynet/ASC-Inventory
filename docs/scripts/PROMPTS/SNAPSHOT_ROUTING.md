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
docs/scripts/SNAPSHOTS/snapshot_result_ROUTING.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of the CURRENT routing structure of the application.

Scope:
- Based solely on implemented code
- Routing structure only (not business logic or UX intent)
- No inferred behavior beyond what can be deduced from naming
- No future-state assumptions
- No recommendations or refactoring commentary

Output requirements:
1) Top-level summary:
   - Framework(s) used for routing
   - High-level separation (web app vs API)
2) Application routes:
   - Static routes
   - Dynamic routes and parameters
   - Defining file or folder
3) API routes:
   - HTTP method(s)
   - Path
   - Defining file
4) Route grouping and layout boundaries:
   - Route groups
   - Shared layouts or wrappers
   - Where boundaries are enforced
5) Naming collisions or ambiguities:
   - Conflicting paths
   - Overloaded route names
   - Ambiguous singular/plural usage
   (Factual only)
6) Notes on inferred intent:
   - Only when deducible directly from naming
   - No speculation

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

Formatting must be deterministic.

Formatting rules:
- Fixed section order
- Fixed headings (exact text, case-sensitive)
- Tree-style outline is REQUIRED for route listings
- Tree formatting must be consistent and deterministic
- No bullets unless explicitly specified above
- One item per line
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
