You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Your task is to REVIEW the CURRENT STATE of this repository and produce a COMPREHENSIVE TREE OUTLINE of the application's routing and navigation structure.

### Output Requirements
Produce a clean, readable tree that includes:

1. All application routes
   - Page routes
   - API routes
   - Dynamic routes and parameters
2. The file or folder that defines each route
3. Route grouping or layout boundaries (if applicable)
4. Any naming collisions, ambiguities, or inconsistencies you observe
5. Notes on inferred intent ONLY if it can be deduced from naming (no speculation)

### Formatting
- Use a tree-style outline (like `tree` or Markdown nested lists)
- Group by:
  - App routes
  - API routes
  - Shared layouts / wrappers
- Keep the output deterministic and factual

### Explicit Constraints
- This is an INVENTORY, not a redesign
- Do not suggest improvements
- Do not assume future features
- Do not change terminology used in the codebase

Begin with a top-level summary, then present the full tree.
