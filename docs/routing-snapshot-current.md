# Comprehensive Routing Snapshot - ASC Inventory Next.js Application

**Last Updated:** 2026-01-18
**Version:** v1.4.4+
**Recent Changes:** `/case-cards` → `/preference-cards` (canonical route rename per LAW_NOMENCLATURE.md)

---

## Overview
This is a surgical inventory management system built with Next.js 13+ (App Router). The application is organized into three main route categories: administrative routes, case management routes, and operational workflow routes.

---

## Application Routes (Page Components)

### Root & Authentication
```
/
├── page.tsx
│   - Route: GET /
│   - Purpose: Root redirect handler
│   - Behavior: Unauthenticated users → /login, Authenticated users → /calendar
│   - Client Component: Yes ('use client')
│
├── login/
│   └── page.tsx
│       - Route: GET /login
│       - Purpose: User authentication interface
│       - Behavior: Login form with facility key, username, password, password toggle
│       - Client Component: Yes ('use client')
```

### Calendar & Main Navigation
```
/calendar
└── page.tsx
    - Route: GET /calendar
    - Purpose: Primary dashboard showing surgical schedule
    - Behavior: Calendar view (Month/Week/Day modes), facility settings integration
    - Components: CalendarNav, MonthView, WeekView, DayView
    - Client Component: Yes ('use client')
```

### Case Management Routes
```
/case/[caseId]/
├── page.tsx
│   - Route: GET /case/:caseId
│   - Purpose: Case Dashboard with readiness attestation
│   - Behavior: Dynamic route parameter (caseId)
│   - Features:
│     * Readiness attestation panel
│     * Case summary editor
│     * Anesthesia plan configuration
│     * Linked case card management
│     * Case-specific overrides
│     * Event log viewer
│     * Inline scheduling editor
│     * Print functionality for linked case cards (RECENT)
│   - Client Component: Yes ('use client')
│   - Special: Suspense boundary wrapper with fallback
│
└── verify/
    └── page.tsx
        - Route: GET /case/:caseId/verify
        - Purpose: Readiness verification scanning workflow
        - Behavior: Dynamic route parameter (caseId)
        - Client Component: Yes ('use client')
```

### Surgeon Preference Cards (SPCs)
```
/preference-cards
└── page.tsx
    - Route: GET /preference-cards
    - Purpose: Surgeon Preference Card (SPC) management interface
    - Previous Route: /case-cards (renamed per LAW_NOMENCLATURE.md)
    - Behavior: CRUD operations for preference cards
    - Features:
      * Card creation and editing with versioning
      * Edit log/history modal
      * Feedback submission and review workflow
      * Print functionality (grid list + edit form)
      * Status management (DRAFT, ACTIVE, DEPRECATED)
      * Filtering by surgeon, status, and search term
      * Summary statistics
    - Client Component: Yes ('use client')
    - Access: All roles (not admin-only)

/case-cards
└── page.tsx
    - Route: GET /case-cards
    - Purpose: Legacy redirect (backward compatibility)
    - Behavior: Redirects to /preference-cards
    - Client Component: Yes ('use client')
    - Note: Maintained for existing bookmarks/links
```

### Operational Workflow Routes
```
/or/
├── debrief/[caseId]/
│   └── page.tsx
│       - Route: GET /or/debrief/:caseId
│       - Purpose: Post-operative debrief checklist workflow
│       - Behavior: Dynamic route parameter (caseId)
│       - Features:
│         * Readiness checklists (start, respond, sign, complete)
│         * Case card feedback submission
│         * Conditional field visibility based on responses
│         * Role-restricted field access (ADMIN-only sections)
│       - Client Component: Yes ('use client')
│
└── timeout/[caseId]/
    └── page.tsx
        - Route: GET /or/timeout/:caseId
        - Purpose: Case timeout/cancellation workflow
        - Behavior: Dynamic route parameter (caseId)
        - Client Component: Yes ('use client')
```

### Administrative Routes
```
/admin/
├── cases/
│   └── page.tsx
│       - Route: GET /admin/cases
│       - Purpose: Administrative case management
│       - Features: Create, activate, deactivate, cancel cases
│       - Client Component: Yes ('use client')
│
├── catalog/
│   └── page.tsx
│       - Route: GET /admin/catalog
│       - Purpose: Equipment/supply catalog management
│       - Client Component: Yes ('use client')
│
├── inventory/
│   ├── page.tsx
│   │   - Route: GET /admin/inventory
│   │   - Purpose: Main inventory tracking
│   │
│   └── check-in/
│       └── page.tsx
│           - Route: GET /admin/inventory/check-in
│           - Purpose: Inventory check-in workflow
│           - Client Component: Yes ('use client')
│
├── locations/
│   └── page.tsx
│       - Route: GET /admin/locations
│       - Purpose: Facility location/room management
│       - Client Component: Yes ('use client')
│
├── pending-reviews/
│   └── page.tsx
│       - Route: GET /admin/pending-reviews
│       - Purpose: Administrative review queue
│       - Client Component: Yes ('use client')
│
├── preference-cards/
│   └── page.tsx
│       - Route: GET /admin/preference-cards
│       - Purpose: Simpler inventory-based preference cards (catalog items)
│       - Note: Different from /case-cards (surgical preference cards)
│       - Client Component: Yes ('use client')
│
├── reports/
│   └── page.tsx
│       - Route: GET /admin/reports
│       - Purpose: Operational reports with CSV export
│       - Version: v1.4.4
│       - Client Component: Yes ('use client')
│
├── settings/
│   └── page.tsx
│       - Route: GET /admin/settings
│       - Purpose: Facility settings configuration
│       - Client Component: Yes ('use client')
│
└── users/
    └── page.tsx
        - Route: GET /admin/users
        - Purpose: User account management
        - Client Component: Yes ('use client')
```

### User-Facing Routes
```
/pending-reviews
└── page.tsx
    - Route: GET /pending-reviews
    - Purpose: User's own pending reviews queue (non-admin)
    - Client Component: Yes ('use client')
```

---

## Layouts (Shared Wrappers)

```
/app/layout.tsx
- Route: Root layout wrapper
- Type: Server Component (default)
- Provides:
  * HTML structure and metadata
  * AuthProvider context wrapper
  * Footer component
  * Global CSS imports
  * App container structure
- Metadata: Title, description for SEO
- Children: All page content
```

---

## Dynamic Route Parameters

| Route Pattern | Parameter | Type | Purpose |
|---|---|---|---|
| `/case/[caseId]` | caseId | string | Case identifier |
| `/case/[caseId]/verify` | caseId | string | Case verification workflow |
| `/or/debrief/[caseId]` | caseId | string | Post-operative debrief |
| `/or/timeout/[caseId]` | caseId | string | Case timeout handling |

---

## Navigation Structure

### AdminNav Component
Located at: `apps/web/src/app/components/AdminNav.tsx`

Navigation links (displayed for ADMIN role only):
- `/admin/cases` - Cases
- `/admin/users` - Users
- `/admin/locations` - Locations
- `/admin/catalog` - Catalog
- `/admin/inventory` - Inventory
- `/preference-cards` - Surgeon Preference Cards
- `/admin/reports` - Reports
- `/admin/settings` - Settings
- `/admin/pending-reviews` - Pending Reviews

---

## Recent Changes Log

### 2026-01-18: LAW-Compliant Route Rename
**Change:** Renamed `/case-cards` → `/preference-cards` per LAW_NOMENCLATURE.md
- **Files Modified:**
  - Created: `apps/web/src/app/preference-cards/page.tsx` (canonical SPC route)
  - Updated: `apps/web/src/app/case-cards/page.tsx` (now redirects to /preference-cards)
  - Updated: `apps/web/src/app/components/AdminNav.tsx` (nav link)
  - Updated: `apps/web/src/app/case/[caseId]/page.tsx` ("View Preference Card" button)
  - Updated: `apps/web/src/lib/access-control.ts` (feature definition)
  - Updated: `docs/LAW_NOMENCLATURE.md` (canonical route documentation)
- **Reason:** LAW_NOMENCLATURE.md forbids calling SPCs "case cards" in UI
- **Status:** Complete

### 2026-01-18: Print Functionality Added
**Change:** Added print buttons to Case Dashboard
- **Affected Routes:**
  - `/preference-cards` - Print button in grid list and edit form
  - `/case/[caseId]` - Print button in "Linked Preference Card" section
- **Implementation:** Print modal with full preference card details, print-specific CSS
- **Status:** Complete

### v1.4.4: Operational Reports
- **Route:** `/admin/reports`
- **Feature:** CSV export functionality added

### v1.4.3: SPC Feedback
- **Routes:** `/preference-cards`, `/or/debrief/[caseId]`
- **Feature:** Feedback submission and review workflow

### v1.4.2: Readiness Verification
- **Route:** `/case/[caseId]/verify`
- **Feature:** Scanning workflow for readiness verification

---

## Naming Observations & Compliance

### Route Terminology (per LAW_NOMENCLATURE.md)
**Surgeon Preference Card (SPC) vs Case Card (CC):**
- **SPC:** Surgeon-specific defaults/intent (reusable)
- **CC:** Execution artifact tied to one case instance (not reusable)
- **Canonical SPC Route:** `/preference-cards`
- **Legacy Redirect:** `/case-cards` → `/preference-cards`

### Route Compliance Status
- `/preference-cards` - LAW-compliant (correct terminology)
- `/case-cards` - Legacy redirect for backward compatibility
- API routes (`/api/case-cards/*`) - Internal backend paths (not UI-facing)

---

## File Structure Summary

```
apps/web/src/app/
├── layout.tsx (root wrapper)
├── page.tsx (root redirect)
├── login/page.tsx
├── calendar/page.tsx
├── preference-cards/page.tsx ← Canonical SPC route
├── case-cards/page.tsx ← Legacy redirect to /preference-cards
├── case/
│   └── [caseId]/
│       ├── page.tsx (Print button added)
│       └── verify/page.tsx
├── or/
│   ├── debrief/[caseId]/page.tsx
│   └── timeout/[caseId]/page.tsx
├── pending-reviews/page.tsx
├── admin/
│   ├── cases/page.tsx
│   ├── catalog/page.tsx
│   ├── inventory/
│   │   ├── page.tsx
│   │   └── check-in/page.tsx
│   ├── locations/page.tsx
│   ├── pending-reviews/page.tsx
│   ├── preference-cards/page.tsx (inventory-based system)
│   ├── reports/page.tsx
│   ├── settings/page.tsx
│   └── users/page.tsx
└── components/
    └── AdminNav.tsx (updated)
```

---

## Summary Statistics

- **Total Page Routes:** 20
- **Dynamic Routes:** 4 (all in `/case` and `/or` segments)
- **Layout Files:** 1 (root)
- **Admin Routes:** 10
- **Client Components:** 20/20 (100%)
- **API Routes:** 0 (backend service pattern via `@/lib/api`)
- **Route Groups:** 3 (admin, or, case)
- **Routes Modified (Latest Session):** 3
- **Routes Created (Latest Session):** 1
- **Routes Deleted (Latest Session):** 1
