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
- **Git Bash:** `user@machine` style prompt
- **WSL:** Linux-style prompt, supports `pkill`, `lsof`, `rm`

Always use the commands that match your shell.

---

## Reset Philosophy (Read Once)

- **Do NOT reset Docker unless the database is the problem**
- **Do NOT kill all Node processes unless ports are wrong**
- **Do NOT allow Next.js to auto-select ports**
- Prefer **targeted resets**, escalate only when necessary

Resets are tiered below.

---

## Tier -1 — Sanity Check (Do This First)

- Confirm shell: **PowerShell (PS>)**
- If not PowerShell, STOP and switch shells
- Many failures (hot reload, crashes, port hopping) are shell-related

---

## Tier 0 — Normal Dev Loop (No Reset)
- Postgres container stays running
- Hot reload is expected
- Restart only the server you are actively editing if needed

---

## Tier 1 — Port Conflict / Ghost Node Processes (Most Common)

### Symptoms
- Web “helpfully” moves from 3000 → 3001
- API requests fail but UI loads
- `EADDRINUSE`, `ECONNREFUSED`, silent API failures

### Action
**Reset Node only. Do NOT touch Docker.**

---

### Git Bash / WSL
```bash
# Kill all node processes
pkill -9 node 2>/dev/null || true

# Clear Next build cache
rm -rf apps/web/.next 2>/dev/null || true

# Restart dev servers
cd apps/web && npm run dev &
cd apps/api && npm run dev &
```

### PowerShell
```powershell
# Kill all node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Clear Next build cache
Remove-Item -Recurse -Force apps\web\.next -ErrorAction SilentlyContinue

# Restart dev servers
cd apps\web; npm run dev
# Open a new terminal tab/window for API:
cd apps\api; npm run dev
```

### Verification
```bash
# Check ports (Git Bash/WSL)
lsof -i :3000
lsof -i :3001

# Check ports (PowerShell)
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

**Expected state:**
- Web on **3000**
- API on **3001**
- Both responding to requests

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
```bash
# Kill all node processes (shell-specific, see Tier 1)
pkill -9 node 2>/dev/null || true  # Git Bash/WSL
# OR
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force  # PowerShell

# Stop all containers
docker compose down

# Remove volumes
docker volume prune -f

# Clear all build artifacts
rm -rf apps/web/.next apps/api/dist node_modules/.cache 2>/dev/null || true

# Reinstall dependencies (if package.json changed)
npm install

# Restart everything
docker compose up -d
cd apps/web && npm run dev &
cd apps/api && npm run dev &
```

---

## Common Issues & Quick Fixes

### "Web is on 3001 instead of 3000"
→ **Tier 1 reset** (Node processes conflict)

### "Cannot connect to database"
→ Check `docker ps` — is Postgres running?
→ If not: `docker compose up -d postgres`

### "API returns 404 for all routes"
→ API likely not running. Check port 3001.
→ Restart API: `cd apps/api && npm run dev`

### "Hot reload not working"
→ Clear Next cache: `rm -rf apps/web/.next`
→ Restart web server

### "Cannot find module './XXX.js'" or app stuck on "Loading..."
→ Stale webpack chunks in `.next` folder
→ Clear Next cache and restart:
```bash
rm -rf apps/web/.next   # Git Bash/WSL
# OR
Remove-Item -Recurse -Force apps\web\.next   # PowerShell
```
→ Then restart web server

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

# 2. Check ports (Git Bash/WSL)
lsof -i :3000 :3001

# 2. Check ports (PowerShell)
netstat -ano | findstr ":3000 :3001"

# 3. Verify no ghost node processes
ps aux | grep node  # Git Bash/WSL
Get-Process node     # PowerShell
```

**Expected:**
- Postgres container running
- Ports 3000 and 3001 free OR occupied by correct services
- No orphaned node processes

---

## For Claude CLI

When asked to "reset dev" or fix broken dev state:

1. **Ask which shell** the user is running (PowerShell, Git Bash, WSL)
2. **Diagnose first**: Check ports and process state before acting
3. **Start with lowest tier** that matches symptoms
4. **Never reset Docker** unless explicitly database-related
5. **Verify post-reset**: Confirm services are on correct ports

---

## Maintenance Notes

- This file should be updated when port assignments change
- Add new tiers if new services are added
- Keep shell-specific commands in sync
- Document any new gotchas as they are discovered