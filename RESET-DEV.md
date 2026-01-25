# RESET-DEV.md
**Repo:** ASC Inventory Truth
**Scope:** Local development only (hot reload)
**Audience:** Humans + Claude CLI
**Intent:** Deterministic recovery from broken dev states without unnecessary teardown

---

## Core Contracts (Do Not Drift)

This repo runs **three long-lived services** during development:

1. **WEB (Next.js)**
   - Location: `apps/web`
   - Port: **3000**
   - Must NEVER auto-hop ports

2. **API (Node / Fastify / etc.)**
   - Location: `apps/api`
   - Port: **3001**

3. **Postgres (Docker container)**
   - Runs continuously during dev
   - Should NOT be reset unless there is a DB-specific failure

If the web server is running on **3001**, the system is in a **broken state**.

---

## IMPORTANT: Shell Matters

This repo is commonly run on **Windows**, but with different shells:

- **PowerShell**
- **Git Bash**
- **WSL**

Commands are **shell-specific**.
Running PowerShell commands in Git Bash (or vice versa) will silently fail.

### How to tell which shell you are in
- **PowerShell:** prompt starts with `PS>`
- **Git Bash:** `user@machine` style prompt (MINGW64)
- **WSL:** Linux-style prompt, supports `pkill`, `lsof`, `rm`

Always use the commands that match your shell.

---

## CRITICAL: Git Bash Process Management is Unreliable

**`pkill` and `kill` commands in Git Bash on Windows often fail silently.**

They may return success (exit code 0) but the process continues running. This leads to:
- Port hopping (web moves to 3001)
- Ghost processes holding ports
- Repeated "fix" attempts that don't work

**On Git Bash/Windows, always use Windows-native commands:**
```bash
# Find PIDs holding ports
netstat -ano | findstr ":3000 :3001" | findstr LISTENING

# Kill by PID (use actual PID from netstat output)
taskkill //F //PID 12345
```

**WSL is different** — it runs a real Linux kernel, so `pkill` works correctly there.

---

## Reset Philosophy (Read Once)

- **Do NOT reset Docker unless the database is the problem**
- **Do NOT kill all Node processes unless ports are wrong**
- **Do NOT allow Next.js to auto-select ports**
- **ALWAYS verify ports are free before restarting servers**
- Prefer **targeted resets**, escalate only when necessary

Resets are tiered below.

---

## Tier -1 — Sanity Check (Do This First)

- Confirm shell: **PowerShell (PS>)** or **Git Bash (MINGW64)**
- Many failures (hot reload, crashes, port hopping) are shell-related
- If using Git Bash, remember: `pkill` is unreliable — use `taskkill`

---

## Tier 0 — Normal Dev Loop (No Reset)
- Postgres container stays running
- Hot reload is expected
- Restart only the server you are actively editing if needed

---

## Tier 1 — Port Conflict / Ghost Node Processes (Most Common)

### Symptoms
- Web "helpfully" moves from 3000 → 3001
- API requests fail but UI loads
- `EADDRINUSE`, `ECONNREFUSED`, silent API failures
- Browser console shows 404 for `.js` or `.css` chunks

### Action
**Reset Node only. Do NOT touch Docker.**

**Critical: Follow all 3 steps — Kill, Verify, Restart**

---

### Step 1: Kill Processes

#### Git Bash (Windows) — Use taskkill
```bash
# Find PIDs on ports 3000 and 3001
netstat -ano | findstr ":3000 :3001" | findstr LISTENING

# Kill each PID (replace with actual PIDs from output above)
taskkill //F //PID <pid-on-3000>
taskkill //F //PID <pid-on-3001>
```

#### PowerShell
```powershell
# Kill all node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

#### WSL (Real Linux)
```bash
# Kill all node processes
pkill -9 node 2>/dev/null || true
```

---

### Step 2: Verify Ports Are Free

**Do NOT skip this step.** Restarting without verification causes port hopping.

```bash
# All shells — should return nothing if ports are free
netstat -ano | findstr ":3000 :3001" | findstr LISTENING
```

If ports still show LISTENING, repeat Step 1 with the correct PIDs.

---

### Step 3: Clear Cache and Restart

#### Git Bash
```bash
# Clear Next build cache
rm -rf apps/web/.next 2>/dev/null || true

# Restart dev servers (in separate terminals)
cd apps/web && npm run dev
# New terminal:
cd apps/api && npm run dev
```

#### PowerShell
```powershell
# Clear Next build cache
Remove-Item -Recurse -Force apps\web\.next -ErrorAction SilentlyContinue

# Restart dev servers
cd apps\web; npm run dev
# Open a new terminal tab/window for API:
cd apps\api; npm run dev
```

---

### Step 4: Verify Correct State

```bash
# Check ports
netstat -ano | findstr ":3000 :3001" | findstr LISTENING

# Test responses
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000  # Should be 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health  # Should be 200
```

**Expected state:**
- Web on **3000**
- API on **3001**
- Both responding with HTTP 200

---

## Tier 2 — Database Issues / Schema Drift

### Symptoms
- Migration errors
- "relation does not exist"
- Schema out of sync with codebase
- Data corruption in dev

### Action
**Reset the database. Do NOT kill Node unless also having port issues.**

### Commands (All Shells)
```bash
# Stop and remove Postgres container
docker compose down postgres

# Remove volumes (destructive)
docker volume prune -f

# Restart Postgres
docker compose up -d postgres

# Run migrations
npm run db:migrate

# Seed dev data (if applicable)
npm run db:seed
```

---

## Tier 3 — Full Nuclear Reset (Last Resort)

### When to Use
- Multiple simultaneous failures
- Unknown state after long break from dev
- Onboarding new dev machine
- Truly "nothing works"

### Action

#### Step 1: Kill All Node Processes

**Git Bash (Windows):**
```bash
# Find and kill all node PIDs
netstat -ano | findstr ":3000 :3001" | findstr LISTENING
# For each PID:
taskkill //F //PID <pid>
```

**PowerShell:**
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**WSL:**
```bash
pkill -9 node 2>/dev/null || true
```

#### Step 2: Verify Ports Free
```bash
netstat -ano | findstr ":3000 :3001" | findstr LISTENING
# Should return nothing
```

#### Step 3: Reset Everything
```bash
# Stop all containers
docker compose down

# Remove volumes
docker volume prune -f

# Clear all build artifacts
rm -rf apps/web/.next apps/api/dist node_modules/.cache 2>/dev/null || true
# PowerShell: Remove-Item -Recurse -Force apps\web\.next, apps\api\dist, node_modules\.cache -ErrorAction SilentlyContinue

# Reinstall dependencies (if package.json changed)
npm install

# Restart everything
docker compose up -d
```

#### Step 4: Start Dev Servers (in separate terminals)
```bash
cd apps/web && npm run dev
cd apps/api && npm run dev
```

#### Step 5: Verify
```bash
netstat -ano | findstr ":3000 :3001" | findstr LISTENING
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health
```

---

## Common Issues & Quick Fixes

### "Web is on 3001 instead of 3000"
→ **Tier 1 reset** (ghost process on 3000)
→ Use `taskkill` on Git Bash, not `pkill`

### "Cannot connect to database"
→ Check `docker ps` — is Postgres running?
→ If not: `docker compose up -d postgres`

### "API returns 404 for all routes"
→ API likely not running. Check port 3001.
→ Restart API: `cd apps/api && npm run dev`

### "Hot reload not working"
→ Clear Next cache: `rm -rf apps/web/.next`
→ Restart web server

### "Cannot find module './XXX.js'" or "Failed to load resource: 404"
→ Stale webpack chunks — see **Deep Dive** section below
→ **Must kill process, verify port free, then restart**

### "missing required error components, refreshing..."
→ Next.js App Router requires `error.tsx` and `global-error.tsx` in `apps/web/src/app/`
→ If missing, create them:
```tsx
// apps/web/src/app/error.tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```
→ Also create `global-error.tsx` with same pattern (must include `<html>` and `<body>` tags)

### "ECONNREFUSED on localhost:3001"
→ API is not running or crashed
→ Check API logs, restart API server

---

## Pre-Flight Checklist (Before Starting Dev)

Run these commands to verify clean state:

```bash
# 1. Check Docker
docker ps

# 2. Check ports (all shells on Windows)
netstat -ano | findstr ":3000 :3001" | findstr LISTENING

# 3. Check ports (WSL only)
lsof -i :3000 :3001

# 4. Verify no ghost node processes
# Git Bash/PowerShell:
tasklist | findstr node
# WSL:
ps aux | grep node
```

**Expected:**
- Postgres container running
- Ports 3000 and 3001 free OR occupied by correct services
- No orphaned node processes

---

## For Claude CLI

When asked to "reset dev" or fix broken dev state:

1. **Detect shell** from command output (don't rely on user knowing)
2. **Diagnose first**: Check ports and process state before acting
3. **Use taskkill on Git Bash** — `pkill` is unreliable on Windows
4. **Always verify ports are free** before restarting servers
5. **Start with lowest tier** that matches symptoms
6. **Never reset Docker** unless explicitly database-related
7. **Verify post-reset**: Confirm services are on correct ports with curl

---

## Deep Dive: Stale Webpack Chunks — Full Fix

### Symptoms
- Browser console: `Failed to load resource: 404` for `.js` or `.css` files
- Error: `Cannot find module './819.js'` (or similar numbered chunk)
- App stuck on "Loading..."
- After clearing `.next`: All routes return **404**

### Why This Happens
- Next.js dev server holds webpack chunks in memory
- Deleting `.next` while server runs creates a mismatch
- Server tries to serve from deleted/rebuilt chunks → 404
- Only a full restart loads the new build

### The Fix (3 Steps — Do Not Skip Any)

**Clearing the cache alone is NOT sufficient.** You must:
1. Kill the process
2. Verify the port is free
3. Then restart

#### Git Bash (Windows) — Full Workflow
```bash
# 1. Find and kill the web server process
netstat -ano | findstr ":3000" | findstr LISTENING
# Note the PID (last column), then:
taskkill //F //PID <pid>

# 2. Verify port 3000 is free
netstat -ano | findstr ":3000" | findstr LISTENING
# Should return nothing. If still occupied, repeat step 1.

# 3. Clear cache and restart
rm -rf apps/web/.next
cd apps/web && npm run dev
```

#### PowerShell — Full Workflow
```powershell
# 1. Kill node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Verify port is free
netstat -ano | findstr ":3000" | findstr LISTENING
# Should return nothing

# 3. Clear cache and restart
Remove-Item -Recurse -Force apps\web\.next -ErrorAction SilentlyContinue
cd apps\web; npm run dev
```

#### WSL — Full Workflow
```bash
# 1. Kill web server
pkill -f "next dev" 2>/dev/null || true

# 2. Verify port is free
lsof -i :3000
# Should return nothing

# 3. Clear cache and restart
rm -rf apps/web/.next
cd apps/web && npm run dev
```

### Key Rules

1. **Never clear `.next` without also restarting the web server**
2. **Always verify the port is free before restarting**
3. **If you see 404 after clearing cache**, the server is still running stale code — kill and restart it
4. **On Git Bash, use `taskkill`** — `pkill` will appear to succeed but won't kill the process

### Common Mistake: The "Ghost Fix"

```bash
# THIS DOES NOT WORK ON GIT BASH:
pkill -f "next dev"; rm -rf apps/web/.next; npm run dev
```

This appears to work (no errors), but:
- `pkill` silently fails on Windows
- Next.js starts on port 3001 because 3000 is still occupied
- You're now in a broken state

**Always verify the port is free before restarting.**

---

## Maintenance Notes

- This file should be updated when port assignments change
- Add new tiers if new services are added
- Keep shell-specific commands in sync
- Document any new gotchas as they are discovered
- **Tested on**: Windows 11 + Git Bash (MINGW64), PowerShell 7
