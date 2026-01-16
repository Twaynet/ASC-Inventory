# ASC Inventory Truth System v1.1

A clinically honest, future-proof inventory system for Ambulatory Surgery Centers (ASCs).

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

---

## Explicitly NOT Implemented (Scope Control)

The following items are **intentionally excluded** from v1.1 to maintain scope discipline:

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

### Simplified in v1.1
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
