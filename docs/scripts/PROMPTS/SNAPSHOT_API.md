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
docs/scripts/SNAPSHOTS/snapshot_result_API.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a FULL API CONTRACT snapshot for the backend used by the web app, based solely on implemented code.

Scope:
- Backend API only
- Include only what is provably implemented
- No speculation

Output requirements:
1) List every endpoint: METHOD + PATH + defining file
2) For each endpoint, include:
   - Auth required? (yes/no + mechanism)
   - Input shape (schema/type name + file path)
   - Output shape (schema/type name + file path)
   - Error shape (if defined; otherwise UNKNOWN)
3) Identify all shared types/schemas (Zod, io-ts, TypeScript interfaces, etc.):
   - Name
   - Purpose
   - Defining file path
4) Identify client wrapper(s) used by the web app:
   - File path(s)
   - How functions map to API endpoints
5) Call out factual inconsistencies only:
   - Naming
   - Versioning
   - Error handling
   - Envelope shapes
   - Auth enforcement
   (No opinions, no recommendations)

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- For every endpoint and every schema/type reference, include:
  - Defining file path
  - Nearest function/const name, or line range if identifiable

Formatting must be deterministic.

Formatting rules:
- Fixed section order
- Fixed headings (exact text, case-sensitive)
- No bullets unless explicitly specified above
- One item per line
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
