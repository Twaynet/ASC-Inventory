# Comprehensive Configuration Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## 1. Environment Variables

### Database Configuration
| Variable | Default | Files | Purpose |
|----------|---------|-------|---------|
| `DB_HOST` | `localhost` | `apps/api/src/db/index.ts:6`, `apps/api/db/seed.ts:12`, `apps/api/db/migrate.ts:16` | PostgreSQL host |
| `DB_PORT` | `5432` | `apps/api/src/db/index.ts:7`, `apps/api/db/seed.ts:13`, `apps/api/db/migrate.ts:17` | PostgreSQL port |
| `DB_NAME` | `asc_inventory` | `apps/api/src/db/index.ts:8`, `apps/api/db/seed.ts:14`, `apps/api/db/migrate.ts:18` | Database name |
| `DB_USER` | `postgres` | `apps/api/src/db/index.ts:9`, `apps/api/db/seed.ts:15`, `apps/api/db/migrate.ts:19` | Database user |
| `DB_PASSWORD` | `postgres` | `apps/api/src/db/index.ts:10`, `apps/api/db/seed.ts:16`, `apps/api/db/migrate.ts:20` | Database password |

### API Server Configuration
| Variable | Default | Files | Purpose |
|----------|---------|-------|---------|
| `PORT` | `3001` | `apps/api/src/index.ts:26` | API server port |
| `HOST` | `0.0.0.0` | `apps/api/src/index.ts:27` | API server bind address |
| `JWT_SECRET` | `dev-secret-change-in-production` | `apps/api/src/index.ts:49`, `apps/api/src/plugins/auth.ts:32` | JWT signing secret |
| `CORS_ORIGIN` | `http://localhost:3000` | `apps/api/src/index.ts:41` | Allowed CORS origin |
| `NODE_ENV` | (none) | `apps/api/src/index.ts:33` | Environment mode (enables pino-pretty in development) |
| `LOG_LEVEL` | `info` | `apps/api/src/index.ts:32` | Pino log level |

### Web Application Configuration
| Variable | Default | Files | Purpose |
|----------|---------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | `apps/web/src/lib/api.ts:5`, `apps/web/src/app/calendar/components/DayView.tsx:537` | Backend API base URL |
| `BUILD_TIME` | `dev` | `apps/web/src/app/components/Footer.tsx:6` | Build timestamp for footer display |

---

## 2. Dev/Prod Scripts & Port Bindings

### Root Package (`package.json`)
**File:** `package.json`
```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:migrate": "cd apps/api && npm run db:migrate",
    "db:seed": "cd apps/api && npm run db:seed",
    "validate:docs": "npx tsx scripts/validate-docs.ts"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### API Package (`apps/api/package.json`)
**File:** `apps/api/package.json`
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "vitest run",
    "db:migrate": "node --import tsx db/migrate.ts",
    "db:seed": "node --import tsx db/seed.ts"
  }
}
```

### Web Package (`apps/web/package.json`)
**File:** `apps/web/package.json`
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### Port Bindings Summary
| Service | Dev Port | Prod Port | Binding |
|---------|----------|-----------|---------|
| Web (Next.js) | 3000 | 3000 | `0.0.0.0:3000` |
| API (Fastify) | 3001 | 3001 | `0.0.0.0:3001` |
| PostgreSQL | 5432 | 5432 | `0.0.0.0:5432` |

---

## 3. Feature Flags

### `enableTimeoutDebrief`
**Purpose:** Gates the OR Time Out and Post-op Debrief checklist workflow

**Storage:**
- Database table: `facility_settings`
- Column: `enable_timeout_debrief` (boolean, default: false)
- Migration file: `apps/api/db/migrations/004_timeout_debrief.sql:16`

**API Endpoints:**
- GET `/api/facility/settings` - Read current value
- PATCH `/api/facility/settings` - Update value (Admin only)

**What It Gates:**
1. **Case Start Gate:** When enabled, cases cannot start until TIMEOUT checklist is completed
2. **Case Complete Gate:** When enabled, cases cannot complete until DEBRIEF checklist is completed
3. **UI Visibility:** Shows/hides checklist buttons and status indicators

**Files Referencing:**
| File | Line | Usage |
|------|------|-------|
| `packages/domain/src/types.ts` | 378 | Schema definition |
| `apps/api/src/schemas/index.ts` | 426, 434 | Zod validation |
| `apps/api/src/services/checklists.service.ts` | 157, 178, 186, 195, 200, 456, 487-488, 1337, 1351 | Business logic |
| `apps/api/src/routes/checklists.routes.ts` | 42, 55 | API handlers |
| `apps/web/src/lib/api.ts` | 782, 791, 807 | Client types |
| `apps/web/src/app/admin/general-settings/case-dashboard/page.tsx` | 140, 144, 420-451 | Admin toggle UI |
| `apps/web/src/app/calendar/components/DayView.tsx` | 124, 133, 377, 837 | Calendar UI |
| `apps/web/src/components/CaseDashboardModal/CaseDashboardContent.tsx` | 647 | Case modal UI |
| `apps/web/src/components/Checklists/TimeoutModal.tsx` | 307, 316 | Timeout UI |
| `apps/web/src/components/Checklists/DebriefModal.tsx` | 425, 434 | Debrief UI |
| `apps/web/src/app/or/timeout/[caseId]/page.tsx` | 250, 259 | Timeout page |
| `apps/web/src/app/or/debrief/[caseId]/page.tsx` | 358, 367 | Debrief page |

---

## 4. Docker Configuration

### Development Compose (`docker-compose.yml`)
**File:** `docker-compose.yml`

**Services:**
| Service | Image | Container Name | Ports |
|---------|-------|----------------|-------|
| postgres | `postgres:16-alpine` | `asc-postgres` | `5432:5432` |
| api | Build from `apps/api/Dockerfile` | `asc-api` | `3001:3001` |
| web | Build from `apps/web/Dockerfile` | `asc-web` | `3000:3000` |

**Volumes:**
| Volume | Type | Mount |
|--------|------|-------|
| `postgres_data` | Named | `/var/lib/postgresql/data` |
| `./apps/api/db/migrations` | Bind (RO) | `/docker-entrypoint-initdb.d` |
| `./packages` | Bind (RO) | `/app/packages` |
| `./apps/api/src` | Bind (RO) | `/app/apps/api/src` |
| `./apps/web/src` | Bind (RO) | `/app/apps/web/src` |

**Environment (API container):**
```yaml
NODE_ENV: development
PORT: 3001
DB_HOST: postgres
DB_PORT: 5432
DB_NAME: asc_inventory
DB_USER: postgres
DB_PASSWORD: postgres
JWT_SECRET: dev-secret-change-in-production-abc123
CORS_ORIGIN: http://localhost:3000
```

**Dependencies:**
- `api` depends on `postgres` (service_healthy)
- `web` depends on `api`

**Health Check (postgres):**
```yaml
test: ["CMD-SHELL", "pg_isready -U postgres"]
interval: 5s
timeout: 5s
retries: 5
```

### Production Compose (`docker-compose.prod.yml`)
**File:** `docker-compose.prod.yml`

**Key Differences from Dev:**
| Aspect | Development | Production |
|--------|-------------|------------|
| API Image | Build from Dockerfile | `ghcr.io/twaynet/asc-inventory-api:1.4.0` |
| Web Image | Build from Dockerfile | `ghcr.io/twaynet/asc-inventory-web:1.4.0` |
| NODE_ENV | `development` | `production` |
| Volume mounts | Yes (source code) | No |
| Init migrations | Yes (via bind mount) | No |

**Container Registry:** `ghcr.io/twaynet/asc-inventory-*`

---

## 5. Hard-coded URLs and Ports

### API Server
| Location | Value | File |
|----------|-------|------|
| Default API port | `3001` | `apps/api/src/index.ts:26` |
| Default bind host | `0.0.0.0` | `apps/api/src/index.ts:27` |
| Default CORS origin | `http://localhost:3000` | `apps/api/src/index.ts:41` |

### Web Client
| Location | Value | File |
|----------|-------|------|
| Default API base URL | `http://localhost:3001/api` | `apps/web/src/lib/api.ts:5` |
| Device fetch URL | `http://localhost:3001/api` (fallback) | `apps/web/src/app/calendar/components/DayView.tsx:537` |

### Database
| Location | Value | File |
|----------|-------|------|
| Default DB host | `localhost` | `apps/api/src/db/index.ts:6` |
| Default DB port | `5432` | `apps/api/src/db/index.ts:7` |
| Default DB name | `asc_inventory` | `apps/api/src/db/index.ts:8` |
| Default DB user | `postgres` | `apps/api/src/db/index.ts:9` |
| Default DB password | `postgres` | `apps/api/src/db/index.ts:10` |

### Docker Compose
| Location | Value | File |
|----------|-------|------|
| Postgres port mapping | `5432:5432` | `docker-compose.yml:12` |
| API port mapping | `3001:3001` | `docker-compose.yml:38` |
| Web port mapping | `3000:3000` | `docker-compose.yml:54` |
| Container registry | `ghcr.io/twaynet/asc-inventory-*` | `docker-compose.prod.yml:22,41` |
| Image version tag | `1.4.0` | `docker-compose.prod.yml:22,41` |

### JWT Configuration
| Location | Value | File |
|----------|-------|------|
| Default secret | `dev-secret-change-in-production` | `apps/api/src/index.ts:49`, `apps/api/src/plugins/auth.ts:32` |
| Token expiry | `24h` | `apps/api/src/index.ts:50`, `apps/api/src/plugins/auth.ts:33` |
| Docker dev secret | `dev-secret-change-in-production-abc123` | `docker-compose.yml:35` |

---

## 6. `.env.example` Template

**File:** `.env.example`
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=asc_inventory
DB_USER=postgres
DB_PASSWORD=postgres

# API
PORT=3001
JWT_SECRET=change-this-in-production-use-long-random-string
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=info

# Web
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## Summary

| Category | Count |
|----------|-------|
| Environment Variables | 13 |
| NPM Scripts (root) | 7 |
| NPM Scripts (api) | 7 |
| NPM Scripts (web) | 4 |
| Docker Services | 3 |
| Docker Volumes | 1 named + 4 bind mounts |
| Feature Flags | 1 (`enableTimeoutDebrief`) |
| Hard-coded Ports | 3 (3000, 3001, 5432) |
| Hard-coded URLs | 2 localhost patterns |
