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
docs/scripts/SNAPSHOTS/snapshot_result_EVENTS.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of the event and audit logging model as implemented (EVENTS).

Scope:
- Based solely on implemented code and committed artifacts
- Events and audit logs only (append-only tables, event emitters, event consumers)
- Include both DB-level “event tables” and application-level event types/enums
- No inferred event semantics beyond what the code stores/emits
- No recommendations or refactoring commentary

Output requirements (fixed section order):

A) Event sources and definitions
- List each file that defines event types/enums or event schemas
- For each: file path + what it defines

B) Event persistence tables (DB)
- List each append-only or event-like table (inventory_event, case_event_log, surgical_case_status_event, attestation, device_event, catalog_event, checklist response/signature tables, etc.)
- For each table:
  - Table name
  - Defining migration/schema file path
  - Key columns (id, foreign keys, actor fields, timestamps, type fields)
  - “Append-only enforcement” if present (triggers/constraints), with file path

C) Event types/enums
- List each event enum/type used in code (InventoryEventType, CaseEventType, AttestationType, checklist event-like types, etc.)
- For each:
  - Name
  - Values
  - Defining file path
  - Where consumed (file paths)

D) Emission points (who writes events)
- For each event table and/or event type:
  - Emitting API route(s): METHOD + PATH + defining file
  - Emitting service/repository function(s) if applicable (name + file path)
  - Required auth/roles/capabilities at the emission point (file path)

E) Read/consumption points (who reads events)
- For each event table:
  - API endpoints that query/return events (METHOD + PATH + file)
  - Web pages/components that display events (route/component + file path)
  - Any aggregation/materialization logic (e.g., caches) that consumes events, with file path

F) Event-to-state effects (factual only)
- List cases where emitting an event also updates a “current state” record:
  - Which base table is updated (e.g., inventory_item.last_verified_at, readiness cache refresh, case status changes)
  - Where implemented (file path)
- Do not infer business meaning; only describe writes that occur

G) Traceability fields
- For each event/audit table:
  - Actor attribution fields (userId, role, deviceId, performed_by, etc.)
  - Correlation fields (caseId, inventoryItemId, overrideId, etc.)
  - Timestamp fields (created_at/occurred_at)
  - File path(s) where these are written

H) Inconsistencies or gaps (factual only)
- Duplicated event concepts across tables
- Mixed timestamp conventions (created_at vs occurred_at)
- Missing attribution fields in some event tables
- Event enums defined but not used, or used without persistence, if provable

Verification rules:
- No speculation
- If any required detail cannot be proven from code or database artifacts, write:
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
