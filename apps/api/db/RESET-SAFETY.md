# Database Reset Safety

## Destructive Operations

The only data-destructive command truncates **all tenant data** (`facility CASCADE`, `clinic CASCADE`) and re-seeds demo data. The platform admin user is preserved (Phase 1 runs first, idempotent).

### How to reset

```powershell
# Option A: dedicated script (recommended)
npm run db:seed:reset

# Option B: env var (works in any shell, including PowerShell)
$env:SEED_RESET = "1"; npm run db:seed; Remove-Item Env:SEED_RESET

# Option C: direct invocation (bypasses schema-sanity chaining)
node --import tsx db/seed.ts --reset
```

> **Note:** `npm run db:seed -- --reset` does NOT work — npm appends `--reset` after the chained `schema-sanity.ts` command, so seed.ts never sees it. Use one of the options above.

## Safety Guards

### Ring 1: Local DB auto-allowed
Reset runs without prompts when `DB_HOST` is `localhost` / `127.0.0.1` and `DB_SSL` is not `true`.

### Ring 2: Non-local DB requires confirmation
If the target is not localhost, you must set `CONFIRM_DB_RESET`:

```powershell
$env:CONFIRM_DB_RESET = "YES"
npm run db:seed:reset
```

### Ring 3: Multi-facility tripwire
If the database has more than 1 facility, an additional confirmation is required:

```powershell
$env:CONFIRM_DB_RESET = "YES"
$env:CONFIRM_DB_RESET_FORCE = "YES_I_UNDERSTAND"
npm run db:seed:reset
```

### Ring 4: Production hard block
`NODE_ENV=production` always blocks reset, even with all confirmation env vars set.

## Safe Commands (no guards needed)

```powershell
# Run migrations (additive only, never destructive)
npm run db:migrate

# Seed without reset (skips if data exists)
npm run db:seed

# Schema sanity check
npm run db:check
```

## Never Do This

```powershell
# DO NOT run reset against beta/staging/production
$env:DB_HOST = "10.x.x.x"; npm run db:seed:reset  # BLOCKED by guard

# NODE_ENV=production always blocks, even with confirmation
$env:NODE_ENV = "production"; npm run db:seed:reset  # ALWAYS BLOCKED
```
