# API Contract Conventions

> Single source of truth for ASC Inventory API response shapes, verbs, and error handling.

## HTTP Verbs

| Verb   | Semantics                          | When to use                         |
|--------|------------------------------------|-------------------------------------|
| GET    | Read (safe, idempotent)            | All reads                           |
| POST   | Create resource or trigger action  | Create, activate, deactivate, clone |
| PATCH  | Partial update (default for edits) | Update one or more fields           |
| PUT    | Full replace (rare)                | Only when client sends full resource|
| DELETE | Remove resource                    | Permanent deletes (rare in ASC)     |

**Legacy note:** Some older PUT endpoints behave as partial updates. These have a PATCH alias that calls the same handler. Prefer PATCH for new code.

## Response Envelope

### Success

```json
{
  "data": { ... }
}
```

- HTTP 200 for reads and updates
- HTTP 201 for resource creation

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": { ... }
  }
}
```

### Standard HTTP Status Codes

| Code | Meaning            | When                                 |
|------|--------------------|--------------------------------------|
| 200  | OK                 | Successful read or update            |
| 201  | Created            | Successful resource creation         |
| 400  | Bad Request        | Validation failure, invalid state    |
| 401  | Unauthorized       | Missing or invalid JWT               |
| 403  | Forbidden          | Valid JWT but insufficient role/caps  |
| 404  | Not Found          | Resource does not exist              |
| 409  | Conflict           | Concurrent edit / lock conflict      |
| 500  | Internal Error     | Unexpected server failure            |

### Standard Error Codes

| Code                  | Used for                            |
|-----------------------|-------------------------------------|
| `VALIDATION_ERROR`    | Zod/schema validation failures      |
| `NOT_FOUND`           | Resource lookup failed               |
| `FORBIDDEN`           | Role/capability check failed         |
| `UNAUTHORIZED`        | JWT missing or expired               |
| `CONFLICT`            | Lock or concurrency conflict         |
| `INVALID_STATE`       | Action not allowed in current state  |
| `DUPLICATE`           | Unique constraint violation          |
| `INTERNAL_ERROR`      | Unexpected server error              |

## Server Helpers

```typescript
import { ok, fail } from '../utils/reply.js';

// Success
return ok(reply, { items: [...] });          // 200
return ok(reply, { item: newItem }, 201);    // 201

// Error
return fail(reply, 'VALIDATION_ERROR', 'Name is required', 400, zodErrors);
return fail(reply, 'NOT_FOUND', 'Case card not found', 404);
return fail(reply, 'FORBIDDEN', 'Admin role required', 403);
```

## Web Client

The `api()` wrapper in `apps/web/src/lib/api.ts` auto-unwraps the envelope:

```typescript
// api<T>() returns T (the contents of `data`), not the envelope
const { items } = await api<{ items: Item[] }>('/catalog', { token });
```

Errors are thrown as `ApiError` with `code`, `message`, and optional `details`.

## Settings Canonical Routes

Each settings domain has a canonical read endpoint:

| Domain             | Canonical Route                              | Purpose                        |
|--------------------|----------------------------------------------|--------------------------------|
| **Aggregated**     | `GET  /api/admin/settings`                   | All settings in one response   |
| **Facility**       | `GET  /api/facility/settings`                | Facility-level feature flags   |
| **Rooms**          | `GET  /api/settings/rooms`                   | Operating room configuration   |
| **Surgeons**       | `GET  /api/settings/surgeons`                | Surgeon display settings       |
| **Config Items**   | `GET  /api/general-settings/config-items`    | Patient flags, anesthesia mods |

The aggregator endpoint (`/api/admin/settings`) fetches all 4 domains in parallel for admin dashboard use.

## Migration Strategy

Endpoints are converted in passes:
- **Pass 1:** Reply helpers + high-traffic endpoints + settings canonical + client wrapper
- **Pass 2+:** Remaining endpoints (mechanical conversion)

New endpoints MUST use `ok()`/`fail()` from day one.
