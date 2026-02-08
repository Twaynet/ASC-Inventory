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
docs/scripts/SNAPSHOTS/snapshot_result_CONFIGURATION.txt

If the directory does not exist:
- Do NOT create it
- Abort and report the missing directory

If file writes are not supported in this environment:
- Output the full contents to STDOUT instead
- Prefix with: FILE_CONTENTS_BEGIN
- Suffix with: FILE_CONTENTS_END

Task:
Produce a SNAPSHOT of runtime configuration and environment requirements.

Scope:
- Based solely on implemented code and committed configuration files
- No inferred or conceptual behavior
- No external standards unless explicitly implemented
- No operational recommendations

Output requirements:
1) All environment variables referenced in code:
   - Variable name
   - Purpose
   - Defining or consuming file path(s)
2) Development and production scripts:
   - Command
   - Associated service (web, api, worker, etc.)
   - Port bindings if applicable
3) Feature flags:
   - Flag name
   - Storage mechanism (env, DB, config file)
   - What the flag gates
4) Container and Docker-related configuration if present:
   - docker-compose files
   - Dockerfiles
   - Named volumes
   - Port mappings
5) Hard-coded URLs, ports, or hostnames discovered in code:
   - Value
   - File path(s)
   (Factual only)

Verification rules:
- No speculation
- If any required detail cannot be proven from code or config, write:
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
