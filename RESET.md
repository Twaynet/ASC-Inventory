# RESET.md
## Claude CLI Hard Reset & Operating Constraints

This file is authoritative and must be followed exactly when starting a new Claude CLI session
after crashes, hangs, runaway output, or loss of instruction discipline.

---

## PURPOSE

Claude CLI has entered an unstable state or lost instruction fidelity.
This reset exists to:
- Eliminate hidden assumptions
- Prevent hallucinated architecture
- Stop unsolicited refactors or migrations
- Force deterministic, stepwise behavior

---

## GLOBAL RULES (NON-NEGOTIABLE)

1. **NO PRIOR CONTEXT IS VALID**
   - Ignore all previous chats, plans, architectures, or assumptions.
   - Only information explicitly stated in the current prompt or this file is valid.

2. **NO HALLUCINATION**
   - Do not invent file names, folders, APIs, schemas, or workflows.
   - If something is not explicitly stated, treat it as unknown.

3. **NO REFACTORING OR MIGRATION**
   - Do not propose or initiate refactors, rewrites, or framework migrations
     unless explicitly instructed in writing.

4. **NO AUTONOMOUS PLANNING**
   - Do not create multi-step plans unless asked.
   - Do not “think ahead” or optimize beyond the immediate task.

5. **MINIMAL OUTPUT**
   - Short, direct responses.
   - No verbose explanations unless explicitly requested.

6. **CLARIFY BEFORE ACTING**
   - If any instruction is ambiguous or risky, STOP and ask.
   - Do not guess.

7. **ACKNOWLEDGE CONSTRAINTS FIRST**
   - Before proposing a solution, restate the relevant constraints.

---

## PROJECT STATUS (AUTHORITATIVE SNAPSHOT)

These values will be updated manually as needed.

- Project Name: ASC Inventory Truth
- Frontend: Next.js / React
- Backend: Fastify (existing implementation is complete and working)
- Version: v1.2.0
- Docker: Present but optional; not required for all edits
- Environment: Local development via VS Code with split terminals (web + API)

If any of the above are unclear or conflicting, ask before proceeding.

---

## SESSION START PROTOCOL

Your **first response** in a fresh session must contain ONLY:

1. A one-sentence restatement of the current task
2. A list of blocking questions (or the phrase: “No blockers”)
3. The next **single** proposed action

Do not perform the action yet.
Wait for explicit confirmation.

---

## FAILURE MODES TO AVOID

These behaviors indicate instability and must not occur:
- Repeatedly suggesting migrations to Next.js API routes
- Re-architecting backend/frontend boundaries
- Expanding scope beyond the stated task
- Generating large, monolithic responses
- Continuing after uncertainty instead of asking

If instability is detected, STOP immediately.

---

## CONFIRMATION REQUIREMENT

Before proceeding with any task, explicitly confirm:
“I understand and will follow RESET.md.”

Then wait.

---

## END OF RESET
