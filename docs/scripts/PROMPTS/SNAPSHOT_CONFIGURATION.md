You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Snapshot runtime configuration and environment requirements.

Output:
1) All env vars referenced in code (name, where used, purpose)
2) Dev/prod scripts and port bindings for web + api
3) Any feature flags and what they gate
4) Docker-related config (compose, containers, volumes) if present
5) Hard-coded URLs/ports discovered (factual only)

Include file paths for every item.
