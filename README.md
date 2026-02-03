# ASC Inventory Truth System v1.3.0

A clinically honest, future-proof inventory system for Ambulatory Surgery Centers (ASCs).

## What's New in v1.3.0

### Username-Based Authentication
- **Login with Username:** All users now login with username instead of email
- **User Management:** ADMIN can onboard/offboard users via `/admin/users` page
- **Email Optional:** Email is now optional for non-ADMIN users
- **Username Validation:** 3-100 characters, alphanumeric with `_.-` allowed

### Case Active/Inactive Workflow
- **Pending Approval:** New cases start as inactive (pending admin approval)
- **Admin Activation:** Only ADMIN can activate cases and set scheduled date/time
- **Checklist Gates:** Only active cases can have Time Out/Debrief checklists
- **Case Cancellation:** Any user can cancel a case at any stage
- **Case Management:** New `/admin/cases` page for activation management
- **Visual Indicators:** Inactive cases show "PENDING APPROVAL" banner, cancelled cases show "CANCELLED" with red styling

### New API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | List all users in facility | ADMIN |
| POST | `/api/users` | Create new user (onboard) | ADMIN |
| PATCH | `/api/users/:id` | Update user | ADMIN |
| POST | `/api/users/:id/deactivate` | Deactivate user (offboard) | ADMIN |
| POST | `/api/users/:id/activate` | Reactivate user | ADMIN |
| POST | `/api/cases/:id/activate` | Activate case with date/time | ADMIN |
| POST | `/api/cases/:id/deactivate` | Deactivate case | ADMIN |
| POST | `/api/cases/:id/cancel` | Cancel case | Any |

### Database Migrations
- **007_username_auth.sql:** Adds username column, makes email optional
- **008_case_active_status.sql:** Adds is_active, is_cancelled tracking fields

## What's New in v1.2.3

### UX Improvements
- **Prominent Signature Button:** Sign buttons now use a purple gradient with pulsing animation to draw user attention when it's their turn to sign
- **Visual Icon:** Added ✍️ icon to signature buttons for quick recognition

### Bug Fixes
- **Database Roles:** Added SCRUB and ANESTHESIA roles to database enum (migration 006)
- **Template Creation:** Fixed checklist templates not being created for new facilities

### Seed Data Improvements
- **SCRUB Test User:** Added scrub@demo.com test account for testing SCRUB workflows
- **Additional Test Cases:** Added 15 extra surgical cases across multiple days for repeated debrief testing

## What's New in v1.2.2

### Conditional Debrief Signatures

- **Role-Based Signature Requirements:** Debrief signatures are now conditionally required based on responses:
  - **CIRCULATOR:** Always required, signs synchronously at end of case
  - **SCRUB:** Required only when counts_status=exception OR equipment_issues=yes
  - **SURGEON:** Required only when counts_status=exception OR equipment_issues=yes OR specimens=yes OR improvement_notes filled
- **Async Review Workflow:** SCRUB and SURGEON can complete their reviews after the Circulator completes the debrief
- **Role-Restricted Notes:** Private notes fields for SCRUB and SURGEON (scrub_notes, surgeon_notes)
- **Active Selection:** No default values for Circulator inputs - explicit selection required
- **Pending Reviews Dashboard:** `/pending-reviews` page for SCRUB/SURGEON to see and complete their pending reviews
- **Admin Accountability View:** `/admin/pending-reviews` page showing all pending reviews with aging indicators
- **Dashboard Integration:** Quick links to pending reviews on day-before dashboard

### New API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/cases/:id/checklists/debrief/async-review` | Submit async SCRUB/SURGEON review | SCRUB/SURGEON |
| GET | `/api/pending-reviews` | Get all pending reviews (admin) | Admin |
| GET | `/api/my-pending-reviews` | Get current user's pending reviews | SCRUB/SURGEON |

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

| Username | Password | Role |
|----------|----------|------|
| admin | password123 | Admin |
| tech | password123 | Inventory Tech |
| circulator | password123 | Circulator |
| scrub | password123 | Scrub Tech |
| drsmith | password123 | Surgeon |
| drjones | password123 | Surgeon |

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
| POST | `/api/auth/login` | Login with username | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Users (ADMIN only)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | List all users in facility | ADMIN |
| GET | `/api/users/:id` | Get user details | ADMIN |
| POST | `/api/users` | Create user (onboard) | ADMIN |
| PATCH | `/api/users/:id` | Update user | ADMIN |
| POST | `/api/users/:id/deactivate` | Deactivate user | ADMIN |
| POST | `/api/users/:id/activate` | Reactivate user | ADMIN |

### Cases

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/cases` | List cases | Yes |
| POST | `/api/cases` | Create case (starts inactive) | Yes |
| GET | `/api/cases/:id` | Get case details | Yes |
| PATCH | `/api/cases/:id` | Update case | Yes |
| POST | `/api/cases/:id/activate` | Activate case with date/time | ADMIN |
| POST | `/api/cases/:id/deactivate` | Deactivate case | ADMIN |
| POST | `/api/cases/:id/cancel` | Cancel case | Yes |
| POST | `/api/cases/:id/preference-card` | Select preference card | Yes |
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
docker pull ghcr.io/twaynet/asc-inventory-api:1.3.0
docker pull ghcr.io/twaynet/asc-inventory-web:1.3.0
```

### Production Architecture

Production deployments use Caddy as a reverse proxy with Cloudflare in front.

```
Internet → Cloudflare (proxy) → Caddy (:443) → web/api (internal)
```

See `CLAUDE.md` for full architecture diagram and infrastructure guardrails.

**Key points:**
- Only ports 22, 80, 443 exposed publicly
- Web and API are internal-only (not exposed to host)
- Caddy terminates TLS using Cloudflare Origin Certificate
- Secrets stored in `.env` (gitignored)

### Production Files

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production compose (committed) |
| `caddy/Caddyfile` | Reverse proxy config (committed) |
| `caddy/certs/` | TLS certificates (gitignored) |
| `.env` | Secrets (gitignored) |

### Production Environment Variables

Create a `.env` file on the server:

```bash
# Database
POSTGRES_PASSWORD=<strong-password-here>

# API
JWT_SECRET=<generate-with-openssl-rand-base64-32>

# Networking
DROPLET_IP=<your-server-ip-or-domain>
```

### Deploy Steps

```bash
# 1. SSH to server
ssh user@your-server

# 2. Pull latest images
docker compose -f docker-compose.prod.yml pull

# 3. Start/restart services
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
curl -I https://your-domain.com
```

### First-Time Setup

1. Create `.env` with secrets
2. Place Cloudflare Origin Certificate in `caddy/certs/`
3. Configure Cloudflare DNS (A record, Proxy ON)
4. Set Cloudflare SSL mode to "Full (Strict)"
5. Run migrations: `docker compose -f docker-compose.prod.yml exec api npm run db:migrate`
6. Seed data: `docker compose -f docker-compose.prod.yml exec api npm run db:seed`

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

### Simplified in v1.3
- **Auth:** Username/password JWT, no refresh tokens, no password reset, no SSO
- **User Management:** ADMIN-only onboarding/offboarding, no self-service
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
