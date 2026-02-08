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
docs/scripts/SNAPSHOTS/snapshot_result_ERROR_MODEL.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of error handling and error models as implemented (ERROR MODEL).

Scope:
- Based solely on implemented code and committed artifacts
- Error shapes and propagation only (API → client wrapper → UI)
- Include HTTP status usage and error envelopes
- No inferred “intended” behavior
- No recommendations or refactoring commentary

Output requirements (fixed section order):

A) Error definitions and helpers
- List files that define error helpers, error types, error schemas, or error envelope builders
- For each: file path + what it defines

B) API error envelope shape(s)
- Identify all error response shapes used by the API
- For each shape:
  - JSON shape (field names only)
  - Where constructed (file path)
  - Where documented (if any, file path)
- If multiple envelopes exist, list all and where each is used

C) HTTP status code usage
- List status codes explicitly returned by the API
- For each:
  - Status code
  - Condition (as implemented)
  - Endpoint(s) or shared handler(s) where used
  - Defining file path(s)

D) Validation error behavior
- How request validation errors are produced (Zod/Fastify/etc.)
- Error shape for validation failures
- Where implemented (file path)
- Which endpoints rely on this behavior (if provable)

E) Auth-related errors
- 401 behavior (unauthenticated)
- 403 behavior (forbidden)
- Response shape(s)
- Where implemented (file path)
- Any message patterns or required-role listings (factual only)

F) Client wrapper error handling
- How the client wrapper detects errors (status code, envelope parsing)
- Whether it throws, returns error objects, or normalizes
- Where implemented (file path)

G) UI error display / handling
- Where UI reads, displays, or suppresses API errors
- Any global error boundaries, toasts, alerts, or form error renderers
- File paths

H) Inconsistencies or gaps (factual only)
- Mixed error envelopes
- Mixed status codes for similar conditions
- Client assumptions that do not match API behavior
- Any endpoints that return non-envelope errors (if present)
- Any “string error” legacy fallbacks, if present

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
