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
docs/scripts/SNAPSHOTS/snapshot_result_DATABASE.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of the CURRENT data model and persistence layer.

Scope:
- Based solely on implemented code and committed database artifacts
- No inferred or conceptual data models
- No future-state discussion
- No optimization or refactoring commentary

Output requirements:
1) Database technology in use:
   - Engine/vendor
   - Client/driver or ORM (if any)
   - Where configured (file paths)
2) Schema definitions:
   - Tables or models
   - Fields and types
   - Primary keys
   - Foreign keys and key relationships
3) Enums and status fields that drive application or UI behavior:
   - Enum name
   - Possible values
   - Where defined
   - Where consumed
4) Migrations:
   - Ordered list
   - File name
   - What each migration changes (factual only)
5) Seed data or fixtures:
   - What data exists
   - Where it is defined
   - When or how it is loaded
6) Factual inconsistencies or duplications:
   - Duplicated models
   - Conflicting names
   - Multiple sources of truth
   (Factual only; no recommendations)

Verification rules:
- No speculation
- If any required detail cannot be proven from code or database artifacts, write:
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
