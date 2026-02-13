# PHASE 7 — BACKEND GAP CLOSURE (READ ENDPOINTS)
## Purpose
Phase 7 UI surfaces require read access to existing append-only audit tables.
We will add **read-only GET endpoints** for:
- device_event (Device Event Explorer)
- catalog_cost_event (Catalog Cost History)
- inventory_event financial slice (Inventory Financial Ledger)

## Hard Constraints
- DO NOT modify existing tables or migrations.
- DO NOT change append-only constraints/triggers.
- DO NOT add new event-writing behaviors.
- DO NOT refactor existing route files.
- Prefer adding small new routes in existing route modules where conceptually correct.
- All endpoints must be facility-tenant safe (facility_id scoping) and auth-protected.
- Pagination is REQUIRED for event tables.

---

# GAP 7.8 — Device Event Explorer: GET device events

## New Endpoint
GET `/api/inventory/device-events`

## Auth
- fastify.authenticate required
- requireCapabilities: `INVENTORY_MANAGE` OR `INVENTORY_CHECKIN` (choose the least permissive that still matches expected users)
  - If you need more coverage for scrub/circulator debugging, explicitly document and justify.

## Query Params
- `deviceId?: string`
- `processed?: boolean`
- `hasError?: boolean`
- `start?: string` (ISO date)
- `end?: string` (ISO date)
- `q?: string` (search raw_value and/or processing_error)
- `limit?: number` (default 50, max 200)
- `cursor?: string` (opaque; can be created from created_at+id)

## Response Shape
```ts
{
  data: {
    items: Array<{
      id: string
      occurredAt: string
      createdAt: string
      deviceId: string
      deviceType: string
      payloadType: string
      rawValue: string
      processed: boolean
      processedItemId: string | null
      processingError: string | null
    }>
    nextCursor: string | null
  }
}
