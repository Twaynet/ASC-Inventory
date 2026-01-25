# PRE-FLIGHT.md
**Repo:** ASC Inventory Truth  
**Audience:** Claude CLI + Humans  
**Scope:** Local development only  
**Purpose:** Mandatory diagnostic checklist BEFORE making changes, restarting services, or proposing resets

---

## Step 0 — LAW Acknowledgment (MANDATORY)

Before proposing, editing, refactoring, or implementing **any behavior**, Claude CLI MUST:

1. Identify which LAW documents apply to the request
2. Load them mentally and treat them as binding
3. Explicitly halt if the request conflicts with any LAW
4. Explain the conflict and propose a compliant alternative

At minimum, the following LAW documents MUST be considered for this repository:

- `docs/LAW/catalog.md`
- `docs/LAW/inventory.md`
- `docs/LAW/physical-devices.md`
- `docs/LAW/device-events.md`
- `docs/LAW/readiness.md`

If the task involves cases, inventory, scanning, verification, readiness, overrides, or workflow gating,  
**failure to account for these LAW documents is a violation.**

If there is uncertainty about which LAW applies → STOP and ask the user.

---

## Absolute Rule
**NO FILE EDITS, RESTARTS, OR RESETS ARE PERMITTED  
UNTIL THIS CHECKLIST IS COMPLETED.**

If uncertain at any step, STOP and ask the user.

---

## Step 1 — Identify Execution Context (MANDATORY)

### 1.1 Operating System
Determine:
- Windows
- macOS
- Linux

### 1.2 Active Shell (CRITICAL)
Determine which shell is being used:
- PowerShell
- Git Bash
- WSL

**Do NOT assume.**
Shell choice determines which commands are valid.

If shell is unknown → STOP and ask.

---

## Step 2 — Confirm Repo Structure

Verify the following paths exist:

- `apps/web`
- `apps/api`
- `RESET-DEV.md`

If any are missing → STOP and report.

---

## Step 3 — Confirm Service Contracts (READ-ONLY)

These are fixed contracts. Do not reinterpret.

| Service | Path | Port |
|------|------|------|
| WEB (Next.js) | `apps/web` | 3000 |
| API | `apps/api` | 3001 |
| Postgres | Docker | internal |

**Next.js must NOT auto-hop ports.**

If the web server is running on 3001 → system is in a broken state.

---

## Step 4 — Check Running Services (NO RESTARTS)

### 4.1 Check Ports
Using shell-appropriate commands, determine:
- Is anything listening on 3000?
- Is anything listening on 3001?

If ports are occupied:
- Identify WHAT is holding them
- Do NOT kill anything yet

---

### 4.2 Check Docker State
Determine:
- Is Docker running?
- Is the Postgres container running?
- Is it healthy?

**Do NOT stop containers yet.**

---

## Step 5 — Classify the Problem (MANDATORY)

Choose ONE category only:

1. **Node Port Conflict**
   - Web/API ports incorrect
   - Ghost node processes
2. **Web App Issue**
   - UI error, build error, hot reload failure
3. **API Issue**
   - Server error, route failure, DB connection error
4. **Database Issue**
   - Postgres not reachable, migration failure
5. **Unknown / Mixed**
   - Multiple symptoms, unclear root cause

If category is unclear → STOP and ask the user.

---

## Step 6 — Select the Correct Action

| Problem Type | Allowed Action |
|------------|---------------|
| Node Port Conflict | Tier 1 or 2 reset from `RESET-DEV.md` |
| Web App Issue | Restart WEB only |
| API Issue | Restart API only |
| Database Issue | Docker reset per `RESET-DEV.md` |
| Unknown | Ask user before acting |

**Never escalate to full resets without justification.**

---

## Step 7 — Confirmation Before Action

Before executing any reset or restart, explicitly state:
- Which tier is being used
- Which services will be affected
- Whether Docker or data will be touched

If the action could delete data → require explicit confirmation.

---

## Step 8 — Post-Action Verification (REQUIRED)

After any action:
- Confirm WEB on `localhost:3000`
- Confirm API on `localhost:3001`
- Confirm DB connectivity
- Report success or remaining symptoms

---

## Prohibited Actions (Hard Rules)

- Do NOT edit files during pre-flight
- Do NOT auto-switch ports
- Do NOT kill all node processes without diagnosis
- Do NOT reset Docker volumes without warning
- Do NOT “optimize” docs that are already compliant

---

## Authority Statement

This document supersedes tool defaults, heuristics, and assumptions.

If a recommendation conflicts with this file,  
**this file wins.**

---

**End of PRE-FLIGHT.md**
