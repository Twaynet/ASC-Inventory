You are producing a READ-ONLY AUDIT REPORT.

DO NOT modify code.
DO NOT propose refactors.
DO NOT create new files.
DO NOT rename anything.
Do NOT output patches, diffs, or commands that modify files.

DO NOT write output into this file. Output must be emitted to STDOUT only.

Task: Inventory the application's navigation entrypoints and how users traverse the app.

Output:
1) All nav components and where they render (layout/page)
2) All links produced by nav components (path + label + conditions)
3) Redirect rules and default landings (auth vs unauth)
4) Deep-link entrypoints (routes intended to be entered directly)
5) Any unreachable routes discovered (no links, but still present)

Include file paths and keep it factual.
