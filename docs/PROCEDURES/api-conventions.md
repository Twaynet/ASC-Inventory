# API Conventions

Standard rules for all API endpoints. New endpoints MUST follow these rules.
Existing endpoints are migrated in waves (see "Migration Status" below).

## HTTP Method Semantics

| Method | Semantics | Idempotent | Body |
|--------|-----------|------------|------|
| GET | Read | Yes | No |
| POST | Create / action | No | Yes |
| PATCH | Partial update (default for edits) | Yes | Yes (partial fields) |
| PUT | Full replace (rare, explicit only) | Yes | Yes (full entity) |
| DELETE | Remove | Yes | No |

Use PATCH unless the operation replaces the entire resource representation.

### Command endpoints (state transitions)

State transitions use `POST /resource/:id/<command>`, not PATCH with a status field.

```
POST /cases/:id/activate    ← command endpoint
POST /cases/:id/approve
POST /cases/:id/reject
POST /cases/:id/cancel
POST /cases/:id/deactivate
```

Each command has its own capability, enabling fine-grained authorization.

## Response Envelopes

### Success

All success responses use:

```json
{ "data": <payload> }
```

Status codes:
- `200` — default
- `201` — resource created (POST)

Use the `ok(reply, data, statusCode?)` helper from `utils/reply.ts`.

### Errors

All error responses use:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

Status codes:
- `400` — validation error, invalid state
- `401` — not authenticated
- `403` — not authorized
- `404` — resource not found
- `409` — conflict (e.g., lock contention)

Use the `fail(reply, code, message, statusCode?, details?)` helper.

Standard error codes:
- `VALIDATION_ERROR` — request body/params failed validation
- `NOT_FOUND` — resource does not exist
- `FORBIDDEN` — authenticated but lacks permission
- `INVALID_STATE` — operation not allowed in current state
- `DUPLICATE` — unique constraint violation

### Validation

Use the `validated(reply, schema, data)` helper for Zod parsing:

```ts
const body = validated(reply, MySchema, request.body);
if (!body) return; // 400 already sent
```

## Authorization Enforcement

### Prefer capabilities over roles

```ts
// GOOD: capability-based
preHandler: [requireCapabilities('INVENTORY_MANAGE')]

// AVOID: role-based (unless there is a specific reason)
preHandler: [requireAdmin]
```

Role checks are allowed only with a comment explaining why:

```ts
// Role-based exception: ADMIN-only because this changes facility configuration
preHandler: [requireAdmin]
```

### Roles are bundles

Roles map to capabilities via `ROLE_CAPABILITIES` in `@asc/domain` (`packages/domain/src/types.ts`).
Authorization code checks capabilities, not role names directly.

**Single source of truth**: The `Capability` type, `ROLE_CAPABILITIES` mapping, and `deriveCapabilities()` function are defined in exactly one file: `packages/domain/src/types.ts`. Other packages may re-export or wrap but must not redefine. The CI guardrail `npm run validate:capabilities` enforces this.

### Case capability mapping

| Endpoint | Capability | Roles |
|----------|-----------|-------|
| `GET /cases`, `GET /cases/:id` | `CASE_VIEW` (via authenticate) | ADMIN, SCHEDULER, SURGEON, CIRCULATOR, SCRUB, INVENTORY_TECH, ANESTHESIA |
| `POST /cases` | `CASE_CREATE` | ADMIN, SURGEON, SCHEDULER |
| `PATCH /cases/:id` | `CASE_UPDATE` | ADMIN, SURGEON, SCHEDULER |
| `POST /cases/:id/approve` | `CASE_APPROVE` | ADMIN, SCHEDULER |
| `POST /cases/:id/reject` | `CASE_REJECT` | ADMIN, SCHEDULER |
| `PATCH /cases/:id/assign-room` | `CASE_ASSIGN_ROOM` | ADMIN, SCHEDULER |
| `POST /cases/:id/activate` | `CASE_ACTIVATE` | ADMIN, SCHEDULER |
| `POST /cases/:id/deactivate` | `CASE_ACTIVATE` | ADMIN, SCHEDULER |
| `POST /cases/:id/cancel` | `CASE_CANCEL` | ADMIN, SURGEON, SCHEDULER |
| `POST /cases/:id/preference-card` | `CASE_PREFERENCE_CARD_LINK` | ADMIN, SURGEON |
| `DELETE /cases/:id` | `CASE_DELETE` | ADMIN only |
| `PUT /cases/:id/requirements` | `CASE_VIEW` + business logic | Assigned surgeon or admin |

**CASE_VIEW policy**: Granted to all current internal roles (see table above). New roles get NO `CASE_VIEW` by default — it must be explicitly added to `ROLE_CAPABILITIES` after review.

### Role → capability summary

| Role | Capabilities |
|------|-------------|
| ADMIN | All capabilities |
| SCHEDULER | CASE_VIEW, CASE_CREATE, CASE_UPDATE, CASE_APPROVE, CASE_REJECT, CASE_ASSIGN_ROOM, CASE_ACTIVATE, CASE_CANCEL |
| SURGEON | CASE_VIEW, CASE_CREATE, CASE_UPDATE, CASE_CANCEL, CASE_PREFERENCE_CARD_LINK, CHECKLIST_ATTEST |
| CIRCULATOR | CASE_VIEW, CHECKLIST_ATTEST, OR_DEBRIEF, OR_TIMEOUT |
| SCRUB | CASE_VIEW, VERIFY_SCAN, CHECKLIST_ATTEST |
| INVENTORY_TECH | CASE_VIEW, INVENTORY_READ, INVENTORY_CHECKIN |
| ANESTHESIA | CASE_VIEW, CHECKLIST_ATTEST |

### Persona does not affect auth

The `X-Active-Persona` header is UX metadata only.
It is NEVER checked in authorization decisions.

## Migration Status

### Wave 1 (v1 — current)

| Endpoint | Envelope | Auth |
|----------|----------|------|
| `PATCH /users/:id` | `ok()`/`fail()` | role (requireAdmin) |
| `POST /users/:id/activate` | `ok()`/`fail()` | role (requireAdmin) |
| `POST /users/:id/deactivate` | `ok()`/`fail()` | role (requireAdmin) |
| `DELETE /cases/:id` | `ok()`/`fail()` | role (requireScheduler) |
| `PUT /cases/:id/requirements` | `ok()`/`fail()` | capability (CASE_VIEW + business logic) |

### Wave 2

All `cases.routes.ts`, `inventory.routes.ts`, and `catalog.routes.ts` endpoints migrated to `ok()`/`fail()`/`validated()` envelopes. Auth converted to capability-based where matching capabilities exist:

| Capability | Replaces | Used by |
|------------|----------|---------|
| `INVENTORY_CHECKIN` / `INVENTORY_MANAGE` | `requireInventoryTech` | inventory events |
| `INVENTORY_MANAGE` | `requireAdmin` | inventory items CRUD |
| `CATALOG_MANAGE` | `requireAdmin` | catalog CRUD |

### Wave 3

Case-specific capabilities introduced (Option B — precise granularity). All `cases.routes.ts` endpoints now use capability-based auth. Added `CASE_VIEW` to INVENTORY_TECH.

| Capability | Endpoints |
|------------|-----------|
| `CASE_CREATE` | `POST /cases` |
| `CASE_UPDATE` | `PATCH /cases/:id` |
| `CASE_APPROVE` | `POST /cases/:id/approve`, inline direct-schedule |
| `CASE_REJECT` | `POST /cases/:id/reject` |
| `CASE_ASSIGN_ROOM` | `PATCH /cases/:id/assign-room`, inline active-case schedule change |
| `CASE_ACTIVATE` | `POST /cases/:id/activate`, `POST /cases/:id/deactivate` |
| `CASE_CANCEL` | `POST /cases/:id/cancel` |
| `CASE_DELETE` | `DELETE /cases/:id` (ADMIN only — hard delete of inactive cases) |
| `CASE_PREFERENCE_CARD_LINK` | `POST /cases/:id/preference-card` |

### Wave 3.1 (Lockdown)

CI guardrail `npm run validate:capabilities` enforces:
1. **Single source of truth** — `Capability` type, `ROLE_CAPABILITIES`, and `deriveCapabilities()` in `packages/domain/src/types.ts` only. Renamed duplicates detected.
2. **No role-middleware regression** — `requireAdmin`/`requireScheduler`/etc. blocked in route files unless allowlisted with structured metadata (`reason`, `targetCapability`, `removeBy`).
3. **Allowlist linking** — every allowlisted file must contain `// capability-guardrail-allowlist: <reason>`.
4. **No `as Capability` casts** in route files (prevents type-system bypass).
5. **CASE_DELETE** introduced (ADMIN-only) — `DELETE /cases/:id` no longer shares `CASE_APPROVE`.
6. **CASE_VIEW policy** — explicitly granted to all 7 current roles. New roles get none by default.

### Wave 6B.2 — Contract-authoritative endpoints

12 high-risk endpoints are now registered via `registerContractRoute()` from `apps/api/src/lib/contract-route.ts`. The adapter enforces:

- **Request validation**: params, query, and body are validated against Zod schemas from `@asc/contract` before the handler runs. Invalid input returns 400 with `INVALID_REQUEST` or `VALIDATION_ERROR`.
- **Response validation**: success responses (status < 400) with `{ data }` payloads are validated against the contract response schema after the handler returns. Mismatches produce 500 `SERVER_RESPONSE_INVALID`.
- **Auth independence**: `preHandler` hooks (auth, capabilities) run before contract validation. The adapter does not bypass or replace auth.

Contract-authoritative endpoints:

| # | Route | File |
|---|-------|------|
| 1 | `GET /cases` | `cases.routes.ts` |
| 2 | `GET /cases/:caseId` | `cases.routes.ts` |
| 3 | `PATCH /cases/:caseId` | `cases.routes.ts` |
| 4 | `POST /cases/:caseId/approve` | `cases.routes.ts` |
| 5 | `POST /cases/:caseId/reject` | `cases.routes.ts` |
| 6 | `PATCH /cases/:caseId/assign-room` | `cases.routes.ts` |
| 7 | `POST /inventory/events` | `inventory.routes.ts` |
| 8 | `POST /inventory/events/bulk` | `inventory.routes.ts` |
| 9 | `GET /catalog` | `catalog.routes.ts` |
| 10 | `POST /catalog/:catalogId/identifiers` | `catalog.routes.ts` |
| 11 | `DELETE /catalog/:catalogId/identifiers/:identifierId` | `catalog.routes.ts` |
| 12 | `DELETE /catalog/:catalogId/images/:imageId` | `catalog-images.routes.ts` |

All other endpoints remain legacy (manual validation via `validated()` helper). To migrate additional endpoints, define a contract in `packages/contract/src/routes/` and call `registerContractRoute()` in the route file.

### Remaining (planned)

- `preference-cards.routes.ts` — all endpoints
- `case-cards.routes.ts` — all endpoints
- `case-dashboard.routes.ts` — all endpoints
- `readiness.routes.ts` — all endpoints
- `locations.routes.ts` — all endpoints
- `general-settings.routes.ts` — partially migrated
- `reports.routes.ts` — all endpoints
