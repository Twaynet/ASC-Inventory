You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Produce a FULL API CONTRACT snapshot for the backend used by the web app.

Output:
1) List every endpoint: METHOD + PATH + defining file
2) For each: auth required?, input shape, output shape, error shape
3) Identify shared types/schemas (zod/io-ts/typescript interfaces), with file paths
4) Identify client wrapper(s) used by the web app and how they map to endpoints
5) Call out inconsistencies in naming/versioning/error handling (factual only)

Deterministic formatting required.
