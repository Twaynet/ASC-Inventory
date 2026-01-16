# ASC Inventory Truth System v1.2.1

A clinically honest, future-proof inventory system for Ambulatory Surgery Centers (ASCs).

## What's New in v1.2.1

### OR Time Out & Post-op Debrief Checklists

- **Feature Flag:** Enable/disable via admin toggle on dashboard (default: off)
- **Time Out Checklist:** Required before case can start (status → IN_PROGRESS)
  - Patient identity, procedure, site/laterality confirmation
  - Consent verification, antibiotics status
  - Inventory readiness display
  - Required signatures: Circulator, Surgeon
- **Post-op Debrief Checklist:** Required before case can complete (status → COMPLETED)
  - Counts status, specimens, implants confirmation
  - Equipment issues, improvement notes
  - Required signature: Circulator
- **Gate Enforcement:** Blocks case status transitions until checklists are complete
- **Dashboard Integration:** Time Out / Debrief buttons on each procedure card
- **New Pages:** `/or/timeout/[caseId]` and `/or/debrief/[caseId]`

## What's New in v1.2.0

### Day-Before Dashboard Improvements

- **Terminology Update:** Renamed "Case" to "Procedure" throughout the UI for clinical accuracy
- **Status Indicators:** Colored left borders on procedure cards (green/orange/red) for instant visual status
- **Filter Buttons:** Filter procedures by Ready (green), Pending (orange), or Missing (red)
- **Sort Options:** Sort by Time, Status (critical first), Surgeon, or Procedure Name
- **Progress Bar:** Visual progress indicator showing items verified vs. total required
- **Clickable Summary Cards:** Click summary totals to quickly filter by status
- **Sticky Header:** Header stays visible while scrolling through procedure list
- **Collapsible Cards:** Click to expand/collapse procedure details with smooth animations
- **Expand/Collapse All:** Buttons to expand or collapse all procedure cards at once
- **Mobile Responsive:** Optimized layouts for tablet (768px) and mobile (480px) screens

## North Star

> **"All required items verified and locatable."**

At the day-before cutoff, the system must truthfully make this statement for each case — or fail loudly before anesthesia induction.

## Architecture

```
┌────────────────────────────┐
│      UI / Clients          │  ← Next.js (React, TypeScript)
└────────────▲───────────────┘
             │ API
┌────────────┴───────────────┐
│    Application Layer       │  ← Case workflow, readiness logic
└────────────▲───────────────┘
             │ Domain API
┌────────────┴───────────────┐
│  Inventory Truth Engine    │  ← Pure domain (NO devices)
└────────────▲───────────────┘
             │ Events
┌────────────┴───────────────┐
│  Device Integration Adapter│  ← Pluggable, optional
└────────────▲───────────────┘
             │
       Physical Devices
```

**Key Rule:** The Inventory Truth Engine (`@asc/domain`) never depends on device APIs.

## Project Structure

```
asc-inventory/
├── packages/
│   └── domain/              # Pure domain types & readiness logic
│       ├── src/
│       │   ├── types.ts     # All domain entities (Zod schemas)
│       │   ├── readiness.ts # Readiness evaluation logic
│       │   └── index.ts
│       └── package.json
├── apps/
│   ├── api/                 # Fastify + Zod backend
│   │   ├── src/
│   │   │   ├── db/          # Database connection
│   │   │   ├── plugins/     # Auth, etc.
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── schemas/     # Request/response validation
│   │   │   ├── services/    # Business logic
│   │   │   └── index.ts
│   │   ├── db/
│   │   │   ├── migrations/  # SQL migrations
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   └── package.json
│   └── web/                 # Next.js frontend
│       ├── src/
│       │   ├── app/         # App Router pages
│       │   └── lib/         # API client, auth
│       └── package.json
├── docker-compose.yml
├── turbo.json
└── package.json
```

## Quick Start (Docker)

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development without Docker)

### 1. Start with Docker Compose

```bash
# Clone and enter directory
cd ASC-Inventory

# Start all services
docker-compose up -d

# Wait for services to be healthy, then seed the database
docker-compose exec api npm run db:seed
```

### 2. Access the Application

- **Web UI:** http://localhost:3000
- **API:** http://localhost:3001

### 3. Test Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@demo.com | password123 | Admin |
| tech@demo.com | password123 | Inventory Tech |
| circulator@demo.com | password123 | Circulator |
| drsmith@demo.com | password123 | Surgeon |
| drjones@demo.com | password123 | Surgeon |

## Quick Start (Local Development)

### 1. Start PostgreSQL

```bash
# Using Docker for just the database
docker run -d \
  --name asc-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=asc_inventory \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. Setup Environment

```bash
# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed
```

### 3. Start Development Servers

```bash
# Start all services (uses Turbo)
npm run dev
```

Or start individually:

```bash
# Terminal 1: API
cd apps/api && npm run dev

# Terminal 2: Web
cd apps/web && npm run dev
```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Login, returns JWT | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Cases

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/cases` | List cases | Yes |
| POST | `/api/cases` | Create case | Scheduler |
| GET | `/api/cases/:id` | Get case details | Yes |
| PATCH | `/api/cases/:id` | Update case | Scheduler |
| POST | `/api/cases/:id/preference-card` | Select preference card | Scheduler |
| PUT | `/api/cases/:id/requirements` | Surgeon override | Surgeon |

### Inventory Events

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/inventory/events` | Record inventory event | Inventory Tech |
| POST | `/api/inventory/events/bulk` | Bulk events | Inventory Tech |
| POST | `/api/inventory/device-events` | Device adapter input | Yes |
| GET | `/api/inventory/items` | List inventory items | Yes |

### Readiness & Attestation

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/readiness/day-before` | Day-before case list | Yes |
| GET | `/api/readiness/cases/:id` | Single case readiness | Yes |
| POST | `/api/readiness/attestations` | Create attestation | Role-gated |
| GET | `/api/readiness/cases/:id/attestations` | Case attestations | Yes |
| POST | `/api/readiness/refresh` | Force cache refresh | Yes |

### Checklists (Time Out / Debrief)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/facility/settings` | Get facility settings | Yes |
| PATCH | `/api/facility/settings` | Update settings (enable feature) | Admin |
| GET | `/api/cases/:id/checklists` | Get checklists for case | Yes |
| POST | `/api/cases/:id/checklists/start` | Start checklist | Yes |
| POST | `/api/cases/:id/checklists/:type/respond` | Record response | Yes |
| POST | `/api/cases/:id/checklists/:type/sign` | Add signature | Role-gated |
| POST | `/api/cases/:id/checklists/:type/complete` | Complete checklist | Yes |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | asc_inventory |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | postgres |
| `PORT` | API server port | 3001 |
| `JWT_SECRET` | JWT signing secret | (dev default) |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:3000 |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | http://localhost:3001/api |

## Deployment

### Docker Images

Pre-built Docker images are available from GitHub Container Registry:

```bash
# Pull the latest images
docker pull ghcr.io/twaynet/asc-inventory-api:latest
docker pull ghcr.io/twaynet/asc-inventory-web:latest

# Or pull a specific version
docker pull ghcr.io/twaynet/asc-inventory-api:1.2.1
docker pull ghcr.io/twaynet/asc-inventory-web:1.2.1
```

### Production Docker Compose

Create a `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    image: ghcr.io/twaynet/asc-inventory-api:1.2.1
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN}
      NODE_ENV: production
    depends_on:
      - postgres
    restart: unless-stopped

  web:
    image: ghcr.io/twaynet/asc-inventory-web:1.2.1
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    depends_on:
      - api
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  postgres_data:
```

### Production Environment Variables

Create a `.env.prod` file:

```bash
# Database
DB_NAME=asc_inventory
DB_USER=asc_admin
DB_PASSWORD=<strong-password-here>

# API
JWT_SECRET=<generate-with-openssl-rand-base64-32>
CORS_ORIGIN=https://your-domain.com

# Web
API_URL=https://api.your-domain.com/api
```

### Deploy Steps

```bash
# 1. Set environment variables
export $(cat .env.prod | xargs)

# 2. Start services
docker-compose -f docker-compose.prod.yml up -d

# 3. Run database migrations
docker-compose -f docker-compose.prod.yml exec api npm run db:migrate

# 4. (Optional) Seed initial data
docker-compose -f docker-compose.prod.yml exec api npm run db:seed
```

### CI/CD

This repository includes GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`): Runs on every push and PR
  - Lint (ESLint)
  - Build (TypeScript)
  - Test (Vitest)
  - Docker build validation

- **CD** (`.github/workflows/cd.yml`): Runs on releases
  - Builds and pushes Docker images to GitHub Container Registry
  - Tags images with semantic versions (e.g., `1.2.0`, `latest`)

To trigger a deployment:

```bash
# Create a new release
gh release create v1.2.0 --title "v1.2.0" --notes "Release notes here"
```

---

## Explicitly NOT Implemented (Scope Control)

The following items are **intentionally excluded** from v1.2 to maintain scope discipline:

### Out of Scope - Infrastructure
- [ ] ERP integrations (SAP, Oracle, etc.)
- [ ] External scheduling system sync
- [ ] SSO / SAML authentication
- [ ] Multi-region deployment
- [ ] Backup/restore automation
- [ ] Audit log export

### Out of Scope - Features
- [ ] Low-cost consumables tracking
- [ ] Analytics dashboards
- [ ] Reporting/export functionality
- [ ] Hospital (non-ASC) workflows
- [ ] Patient information beyond MRN
- [ ] Case costing / financial tracking
- [ ] Vendor portal / loaner requests
- [ ] Email/SMS notifications
- [ ] Mobile app (web-only)

### Out of Scope - Device Integration
- [ ] RFID assumptions/requirements
- [ ] Specific hardware vendor integrations
- [ ] WebHID/WebSerial implementations (v1 uses keyboard wedge)
- [ ] Local Device Bridge agent
- [ ] Automatic inventory reconciliation

### Out of Scope - Advanced Domain Logic
- [ ] Item substitution suggestions
- [ ] Automatic case scheduling optimization
- [ ] Predictive inventory management
- [ ] Par level management
- [ ] Expiration date alerts/workflows
- [ ] Consignment inventory tracking

### Simplified in v1.2
- **Auth:** Basic JWT, no refresh tokens, no password reset
- **Timezone:** Simplified handling (full IANA support deferred)
- **Caching:** Application-level table, not Redis
- **Search:** Basic filtering, no full-text search
- **Audit:** Append-only tables, no log viewer UI

---

## Security Notes

- JWT tokens expire in 24 hours
- Passwords are hashed with bcrypt (cost factor 10)
- `InventoryEvent`, `Attestation`, and `DeviceEvent` tables are append-only (protected by database triggers)
- All endpoints require authentication except `/api/auth/login` and `/health`
- Role-based access control enforced at endpoint level

## License

Proprietary - All rights reserved.
