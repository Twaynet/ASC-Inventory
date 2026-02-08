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
docs/scripts/SNAPSHOTS/snapshot_result_STATE_MACHINES.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of all state machines implemented in the system.

Scope:
- Based solely on implemented code and committed artifacts
- State machines only (explicit or implicit via enums + transitions)
- No inferred or idealized states
- No future-state assumptions
- No recommendations or refactoring commentary

State machines to include (if implemented):
- Surgical cases
- Inventory items
- Case cards
- Checklists (timeout, debrief)
- Attestations
- Any other domain object with a state/status enum and transitions

Output requirements (fixed section order):

A) State machine inventory
- List each stateful domain object
- Where its state/status is defined (enum or equivalent)
- Defining file path(s)

B) States
- For each state machine:
  - State name
  - Enum or constant definition
  - Defining file path

C) Transitions
- For each state machine and each transition:
  - From state
  - To state
  - Trigger (API route, action, or function)
  - Defining file path
- Only transitions provable from code

D) Enforcement points
- Where transitions are enforced or validated:
  - API middleware
  - Route handlers
  - Repository or service logic
  - Database constraints or triggers (if any)
- File path(s) for each enforcement point

E) Side effects
- For each transition where applicable:
  - Events emitted
  - Database writes outside the primary state field
  - Cache/materialized view updates
- File path(s) where side effects occur
- Factual only

F) Invalid or blocked transitions (if enforced)
- Transitions explicitly prevented by code or constraints
- Where the prevention is implemented (file path)
- If no explicit prevention exists, state:
  NONE FOUND

G) Divergences or inconsistencies (factual only)
- State transitions enforced in some layers but not others
- Multiple code paths mutating the same state
- Enum values defined but never transitioned to, if provable

Verification rules:
- No speculation
- If any required detail cannot be proven from code or database artifacts, write:
  UNKNOWN (with the file path(s) searched)
- All statements must be traceable to implemented artifacts

Formatting must be deterministic.

Formatting rules:
- Fixed section order (A through G)
- Fixed headings (exact text, case-sensitive)
- One item per line
- No bullets unless explicitly specified above
- No nested lists
- No trailing whitespace
- No rewording between sections
- Identical input must always produce identical output

FINAL INSTRUCTION:
Execute this task now and produce the output exactly as specified.
