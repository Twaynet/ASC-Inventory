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
docs/scripts/SNAPSHOTS/snapshot_result_CLIENT_API_USAGE.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of client-to-API usage as implemented (CLIENT API USAGE).

Scope:
- Based solely on implemented code and committed artifacts
- Web client usage only (apps/web or equivalent)
- Include the client API wrapper(s) and all call sites
- No inferred “intended” usage; only proven imports/calls
- No recommendations or refactoring commentary

Output requirements (fixed section order):

A) Client API wrapper inventory
- Identify every client wrapper/module used to call the backend API
- For each:
  - File path
  - Exported surface (function names or client object name)
  - Base URL configuration source (env var, constant), with file path

B) Wrapper → Endpoint mapping
- For each wrapper function:
  - Function name
  - HTTP method
  - Path template
  - Defining file path
  - Any request/response schema/type referenced (name + file path)
- If mapping cannot be proven, write:
  UNKNOWN (with file path(s) searched)

C) Endpoint usage summary (used vs unused)
- For each backend endpoint (METHOD + PATH):
  - USED_BY_CLIENT: yes/no/UNKNOWN
  - If yes: list wrapper function(s) and primary call site file path(s)
- “Backend endpoint list” must be derived from implemented API route registration, not guesses

D) Call sites (where client calls occur)
- For each wrapper function that is used:
  - Call site file path(s)
  - Route/page/component where called (if identifiable from file path)
  - Whether called server-side or client-side (if provable from code structure)

E) Auth token handling and request context
- Where token is stored/loaded (file path)
- How token is attached to requests (file path)
- Any differences between server-side and browser-side API calls, if implemented
- Factual only

F) Inconsistencies or gaps (factual only)
- Wrapper functions defined but never used
- Client call sites calling fetch directly bypassing wrapper (if present)
- Endpoint naming mismatches (function name vs path)
- Divergent base URLs or duplicated configuration locations

Verification rules:
- No speculation
- If any required detail cannot be proven from code, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

Formatting must be deterministic.

Formatting rules:
- Fixed section order (A through F)
- Fixed headings (exact text, case-sensitive)
- One item per line
- No bullets unless explicitly specified above
- No nested lists
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
