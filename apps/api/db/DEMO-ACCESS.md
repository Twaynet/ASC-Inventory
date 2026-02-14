# Demo Access System

Instant-access playground gate for prospects. Users provide an email and get
14-day demo access immediately — no manual approval required.

## Quick Start

```bash
# 1. Run migration 063
# 2. Mark a facility as demo:
UPDATE facility_settings SET is_demo = true WHERE facility_id = '<facility-id>';

# 3. Set env var for default demo facility key
DEMO_DEFAULT_FACILITY_KEY=RIVERBEND_DEMO

# 4. Test:
curl -X POST http://localhost:3001/api/demo/request-access \
  -H 'Content-Type: application/json' \
  -d '{"email": "prospect@example.com"}'
```

## Endpoints

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/demo/request-access` | Request instant demo access |

**Request body:**
```json
{ "email": "user@example.com" }
```

**Success response (200):**
```json
{
  "data": {
    "token": "<jwt>",
    "expiresAt": "2026-03-01T00:00:00.000Z",
    "demo": true,
    "facility": { "id": "...", "name": "Riverbend Demo" }
  }
}
```

### Platform Admin (PLATFORM_ADMIN role required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/platform/demo/block-email` | Block email from demo access |
| POST | `/api/platform/demo/unblock-email` | Remove email from blocklist |
| POST | `/api/platform/demo/block-ip` | Block IP from demo access |
| POST | `/api/platform/demo/unblock-ip` | Remove IP from blocklist |
| GET | `/api/platform/demo/requests` | List recent access requests |
| GET | `/api/platform/demo/accounts` | List active demo accounts |
| GET | `/api/platform/demo/blocklists` | View email and IP blocklists |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEMO_DEFAULT_FACILITY_KEY` | Yes | — | `facility_key` of the default demo facility |
| `OWNER_NOTIFICATION_EMAIL` | No | — | Email to notify on demo grants/denials |
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | noreply@orthowise.dev | Sender address |
| `DEMO_RATE_LIMIT_IP_PER_DAY` | No | 10 | Max requests per IP per 24h |
| `DEMO_RATE_LIMIT_EMAIL_PER_DAY` | No | 3 | Max requests per email per 24h |

## How to Mark a Facility as Demo

```sql
-- Find the facility
SELECT id, name, facility_key FROM facility WHERE facility_key = 'RIVERBEND_DEMO';

-- Mark it as demo
UPDATE facility_settings SET is_demo = true WHERE facility_id = '<id>';

-- Verify
SELECT f.facility_key, fs.is_demo
FROM facility f
JOIN facility_settings fs ON fs.facility_id = f.id
WHERE fs.is_demo = true;
```

## TTL Behavior

- Demo access is fixed at **14 days** from first grant
- If a user requests access again within those 14 days, they get a fresh JWT
  but the original `expires_at` is **not extended** (fixed expiry)
- After expiry, any authenticated request returns `403 DEMO_ACCESS_EXPIRED`
- Expired users requesting access again get a new 14-day window (new account)

## Blocking / Unblocking

**Block an email:**
```bash
curl -X POST /api/platform/demo/block-email \
  -H 'Authorization: Bearer <platform-admin-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"email": "abuser@example.com", "reason": "Spam"}'
```

Blocking an email also immediately blocks any active demo account with that email.

**Block an IP:**
```bash
curl -X POST /api/platform/demo/block-ip \
  -H 'Authorization: Bearer <platform-admin-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"ipAddress": "1.2.3.4", "reason": "Abuse"}'
```

## Database Tables

| Table | Type | Purpose |
|-------|------|---------|
| `demo_access_request` | Append-only | Audit log of every grant/denial |
| `demo_account` | Mutable | Lifecycle record per demo user |
| `demo_blocked_email` | Mutable | Email blocklist |
| `demo_blocked_ip` | Mutable | IP blocklist |

**Added columns:**
- `app_user.is_demo` — flags demo accounts
- `facility_settings.is_demo` — flags demo-eligible facilities

## Auth Enforcement

When a JWT with `isDemo: true` is used on any authenticated endpoint:

1. `demo_account.expires_at` is checked — returns `403 DEMO_ACCESS_EXPIRED` if past
2. `demo_account.is_blocked` is checked — returns `403 DEMO_ACCESS_BLOCKED` if true
3. `facility_settings.is_demo` is verified for the user's facility — returns `403 DEMO_FACILITY_INVALID` if not a demo facility

This enforcement runs in the `authenticate` decorator, so it applies to all protected routes without any per-route changes.

## Running Tests

```bash
# Unit tests (no DB required)
cd apps/api && npx vitest run test/demo-access.test.ts

# With DB integration tests
DB_HOST=localhost DB_NAME=asc_inventory npx vitest run test/demo-access.test.ts
```
