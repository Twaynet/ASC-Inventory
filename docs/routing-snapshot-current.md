# Comprehensive Routing Snapshot - ASC Inventory Next.js Application

**Last Updated:** 2026-01-18
**Version:** v1.4.4+
**Recent Changes:** `/admin/case-cards` → `/case-cards`, Print functionality added

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

### Case Cards (Surgical Preference Cards)
```
/case-cards
└── page.tsx
    - Route: GET /case-cards
    - Purpose: Surgical preference card management interface
    - Previous Route: /admin/case-cards (MOVED IN LATEST COMMIT)
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
    - Note: Now at root level instead of admin subdirectory
    - Access: All roles (not admin-only)
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
- `/admin/preference-cards` - Preference Cards
- `/case-cards` - Case Cards (UPDATED - non-admin path)
- `/admin/reports` - Reports
- `/admin/settings` - Settings
- `/admin/pending-reviews` - Pending Reviews

---

## Recent Changes Log

### 2026-01-18: Route Restructuring
**Change:** Moved `/admin/case-cards` → `/case-cards`
- **Files Modified:**
  - Created: `apps/web/src/app/case-cards/page.tsx`
  - Deleted: `apps/web/src/app/admin/case-cards/page.tsx`
  - Updated: `apps/web/src/app/components/AdminNav.tsx` (nav link)
  - Updated: `apps/web/src/app/case/[caseId]/page.tsx` ("View Case Card" button)
- **Reason:** Case Cards should be accessible to all roles, not just admins
- **Status:** Complete

### 2026-01-18: Print Functionality Added
**Change:** Added print buttons to Case Dashboard
- **Affected Routes:**
  - `/case-cards` - Print button in grid list and edit form
  - `/case/[caseId]` - Print button in "Linked Case Card" section
- **Implementation:** Print modal with full case card details, print-specific CSS
- **Status:** Complete

### v1.4.4: Operational Reports
- **Route:** `/admin/reports`
- **Feature:** CSV export functionality added

### v1.4.3: Case Card Feedback
- **Routes:** `/case-cards`, `/or/debrief/[caseId]`
- **Feature:** Feedback submission and review workflow

### v1.4.2: Readiness Verification
- **Route:** `/case/[caseId]/verify`
- **Feature:** Scanning workflow for readiness verification

---

## Naming Observations & Issues

### Route Terminology
**Case Card vs Preference Card:**
- **Canonical Term:** "Case Card" (per `cli-preamble-vocabulary.md`)
- **Deprecated Term:** "Surgical Card" (forbidden)
- **Current Usage:**
  - `/case-cards` - Uses "Case Cards" terminology (correct)
  - `/admin/preference-cards` - Uses "Preference Cards" terminology (different system)

### Potential Confusion
- `/case-cards` - Surgical preference cards with detailed sections (instrumentation, equipment, etc.)
- `/admin/preference-cards` - Inventory-based preference cards (links to catalog items)
- **Note:** These are two different systems serving different purposes

---

## File Structure Summary

```
apps/web/src/app/
├── layout.tsx (root wrapper)
├── page.tsx (root redirect)
├── login/page.tsx
├── calendar/page.tsx
├── case-cards/page.tsx ← MOVED from /admin/case-cards
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
