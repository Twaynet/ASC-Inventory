# Comprehensive Routing Snapshot - ASC Inventory Next.js Application

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Recent Changes:** Added System Dashboard, Case Requests, General Settings hub with sub-pages

---

## Overview
This is a surgical inventory management system built with Next.js 13+ (App Router). The application is organized into four main route categories: authentication, core user routes, case management workflows, and administrative routes.

---

## Application Routes (Page Components)

### Root & Authentication
```
/
├── page.tsx
│   - Route: GET /
│   - Purpose: Root redirect handler
│   - Behavior: Unauthenticated users → /login, Authenticated users → /dashboard
│   - Client Component: Yes ('use client')
│
├── login/
│   └── page.tsx
│       - Route: GET /login
│       - Purpose: User authentication interface
│       - Behavior: Login form with facility key, username, password, password toggle
│       - Post-Login Redirect: /dashboard
│       - Client Component: Yes ('use client')
```

### Dashboard & Core Navigation
```
/dashboard
└── page.tsx
    - Route: GET /dashboard
    - Purpose: System Dashboard - primary landing page after login
    - Behavior: Feature-based navigation with role-based access control
    - Features:
      * Dynamic feature cards organized by group (Core, Case Workflows, Admin)
      * Badge counts for pending items (case requests, unassigned cases, pending reviews)
      * Debug panel for role/capability inspection
      * Access control integration
    - Client Component: Yes ('use client')

/calendar
└── page.tsx
    - Route: GET /calendar
    - Purpose: Case Calendar - surgical schedule view
    - Behavior: Calendar view (Month/Week/Day modes)
    - Features:
      * URL-based state (view mode, date, openCase)
      * Month view → Week view → Day view drill-down
      * Case Dashboard modal integration
      * Surgeon color coding
      * Case deletion (ADMIN/SCHEDULER)
    - Components: CalendarNav, MonthView, WeekView, RoomBasedDayView, CaseDashboardModal
    - Client Component: Yes ('use client')
    - Special: Suspense boundary wrapper
```

### Case Requests & Management
```
/cases
└── page.tsx
    - Route: GET /cases
    - Purpose: "My Case Requests" - user's case request management
    - Features:
      * Create new case requests (surgeon, procedure, date, time, notes)
      * View pending and historical case requests
      * ADMIN/SCHEDULER: Approve & schedule or reject requests
      * Search and sort functionality
    - Access: All authenticated users
    - Client Component: Yes ('use client')

/unassigned-cases
└── page.tsx
    - Route: GET /unassigned-cases
    - Purpose: View scheduled cases not assigned to an operating room
    - Behavior: Grouped by date, click navigates to calendar day view
    - Access: ADMIN, SCHEDULER only
    - Client Component: Yes ('use client')
```

### Case Management Routes (Dynamic)
```
/case/[caseId]/
├── page.tsx
│   - Route: GET /case/:caseId
│   - Purpose: Case Dashboard (standalone page)
│   - Behavior: Dynamic route parameter (caseId)
│   - Features:
│     * Renders CaseDashboardModal at full page
│     * Back navigation support
│   - Client Component: Yes ('use client')
│   - Special: Suspense boundary wrapper
│
└── verify/
    └── page.tsx
        - Route: GET /case/:caseId/verify
        - Purpose: Readiness verification scanning workflow
        - Behavior: Dynamic route parameter (caseId)
        - Features:
          * Barcode scanner integration
          * Verification requirements checklist
          * Return-to-calendar with modal support
        - Client Component: Yes ('use client')
        - Special: Suspense boundary wrapper
```

### Surgeon Preference Cards (SPCs)
```
/preference-cards
└── page.tsx
    - Route: GET /preference-cards
    - Purpose: Surgeon Preference Card (SPC) management interface
    - Previous Route: /case-cards (renamed per LAW_NOMENCLATURE.md)
    - Features:
      * CRUD operations via PreferenceCardDialog component
      * Clone functionality
      * Edit log/history modal
      * Feedback submission and review workflow
      * Print functionality (grid list + edit form)
      * Status management (DRAFT, ACTIVE, DEPRECATED)
      * Filtering by surgeon, status, and search term
      * Summary statistics
    - Client Component: Yes ('use client')
    - Access: All authenticated users

/case-cards
└── page.tsx
    - Route: GET /case-cards
    - Purpose: Legacy redirect (backward compatibility)
    - Behavior: Redirects to /preference-cards
    - Client Component: Yes ('use client')
    - Note: Maintained for existing bookmarks/links
```

### Surgeon-Specific Routes
```
/surgeon/
└── my-checklists/
    └── page.tsx
        - Route: GET /surgeon/my-checklists
        - Purpose: Surgeon's completed checklists with feedback capability
        - Features:
          * View completed TIMEOUT and DEBRIEF checklists
          * Add/edit notes for each checklist
          * Flag items for admin review
          * View admin resolutions on resolved flags
          * Filter by type (TIMEOUT/DEBRIEF) and search
        - Access: SURGEON role only
        - Client Component: Yes ('use client')
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
        - Purpose: Surgical timeout checklist workflow
        - Behavior: Dynamic route parameter (caseId)
        - Client Component: Yes ('use client')
```

### User-Facing Pending Reviews
```
/pending-reviews
└── page.tsx
    - Route: GET /pending-reviews
    - Purpose: User's own pending review queue
    - Features:
      * View async review requests
      * Submit reviews with optional notes
    - Access: SCRUB, SURGEON roles
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
├── general-settings/
│   ├── page.tsx
│   │   - Route: GET /admin/general-settings
│   │   - Purpose: General Settings hub (replaces /admin/settings)
│   │   - Features: Card-based navigation to sub-settings
│   │   - Sub-pages: Operating Rooms, Surgeon Settings, Case Dashboard Settings
│   │   - Client Component: Yes ('use client')
│   │
│   ├── operating-rooms/
│   │   └── page.tsx
│   │       - Route: GET /admin/general-settings/operating-rooms
│   │       - Purpose: Operating room CRUD and ordering
│   │       - Features:
│   │         * Create/edit/deactivate rooms
│   │         * Drag-and-drop reordering
│   │         * Show/hide inactive toggle
│   │       - Client Component: Yes ('use client')
│   │
│   ├── surgeons/
│   │   └── page.tsx
│   │       - Route: GET /admin/general-settings/surgeons
│   │       - Purpose: Surgeon display color configuration
│   │       - Features:
│   │         * Assign display colors to surgeons (20 colors)
│   │         * Visual identification in calendar views
│   │       - Client Component: Yes ('use client')
│   │
│   └── case-dashboard/
│       └── page.tsx
│           - Route: GET /admin/general-settings/case-dashboard
│           - Purpose: Case Dashboard configuration options
│           - Features:
│             * Patient-Specific Flags (non-PHI)
│             * Anesthesia Plan Modalities
│             * Time Out & Debrief feature toggle
│             * Checklist template editor (items, signatures)
│             * Drag-and-drop reordering
│           - Client Component: Yes ('use client')
│
├── pending-reviews/
│   └── page.tsx
│       - Route: GET /admin/pending-reviews
│       - Purpose: Administrative review queue
│       - Features:
│         * View pending debrief reviews
│         * View/resolve flagged reviews (staff + surgeon)
│         * View resolved review history
│         * Checklist modal viewing
│       - Client Component: Yes ('use client')
│
├── reports/
│   └── page.tsx
│       - Route: GET /admin/reports
│       - Purpose: Operational reports with CSV export
│       - Client Component: Yes ('use client')
│
└── users/
    └── page.tsx
        - Route: GET /admin/users
        - Purpose: User account management
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
- Metadata: Title ("ASC Inventory Truth System"), description
- Children: All page content
```

---

## Dynamic Route Parameters

| Route Pattern | Parameter | Type | Purpose |
|---|---|---|---|
| `/case/[caseId]` | caseId | string | Case identifier for dashboard |
| `/case/[caseId]/verify` | caseId | string | Case verification workflow |
| `/or/debrief/[caseId]` | caseId | string | Post-operative debrief |
| `/or/timeout/[caseId]` | caseId | string | Surgical timeout |

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
- `/admin/general-settings` - General Settings
- `/admin/pending-reviews` - Pending Reviews

### Dashboard Feature Cards
Located at: `apps/web/src/lib/access-control.ts`

Core Features (all authenticated):
- Calendar → `/calendar`
- Case Requests → `/cases`
- Surgeon Preference Cards → `/preference-cards`
- My Pending Reviews → `/pending-reviews`
- My Checklists → `/surgeon/my-checklists` (SURGEON only)
- Unassigned Cases → `/unassigned-cases` (ADMIN/SCHEDULER only)

Case Workflows (contextual - require caseId):
- Case Dashboard (from Calendar)
- Readiness Verification (from Case Dashboard)
- OR Debrief (from Case Dashboard)
- OR Timeout (from Case Dashboard)

Admin Features:
- Admin Cases → `/admin/cases`
- Pending Reviews → `/admin/pending-reviews`

---

## Recent Changes Log

### 2026-01-24: System Dashboard & General Settings Reorganization
**Changes:**
- Added `/dashboard` as the new primary landing page after login
- Root `/` now redirects to `/dashboard` instead of `/calendar`
- Login page redirects to `/dashboard` after successful authentication
- Added `/cases` route for "My Case Requests" functionality
- Added `/unassigned-cases` route for ADMIN/SCHEDULER
- Added `/surgeon/my-checklists` route for SURGEON role
- Replaced `/admin/settings` with `/admin/general-settings` hub
- Added `/admin/general-settings/operating-rooms` - OR management
- Added `/admin/general-settings/surgeons` - Surgeon color configuration
- Added `/admin/general-settings/case-dashboard` - Case config options
- **Total Routes:** Increased from 20 to 26

### 2026-01-18: LAW-Compliant Route Rename
**Change:** Renamed `/case-cards` → `/preference-cards` per LAW_NOMENCLATURE.md
- Created: `apps/web/src/app/preference-cards/page.tsx` (canonical SPC route)
- Updated: `apps/web/src/app/case-cards/page.tsx` (now redirects to /preference-cards)
- Updated: AdminNav component navigation link
- **Status:** Complete

### 2026-01-18: Print Functionality Added
**Change:** Added print buttons to Case Dashboard and Preference Cards
- **Affected Routes:** `/preference-cards`, `/case/[caseId]`
- **Implementation:** Print modal with full preference card details, print-specific CSS
- **Status:** Complete

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
├── page.tsx (root redirect → /dashboard)
├── login/page.tsx
├── dashboard/page.tsx ← NEW: Primary landing page
├── calendar/page.tsx
├── cases/page.tsx ← NEW: Case requests
├── unassigned-cases/page.tsx ← NEW: Unassigned cases (ADMIN/SCHEDULER)
├── preference-cards/page.tsx (canonical SPC route)
├── case-cards/page.tsx (legacy redirect → /preference-cards)
├── pending-reviews/page.tsx
├── surgeon/
│   └── my-checklists/page.tsx ← NEW: Surgeon checklists
├── case/
│   └── [caseId]/
│       ├── page.tsx (Case Dashboard)
│       └── verify/page.tsx
├── or/
│   ├── debrief/[caseId]/page.tsx
│   └── timeout/[caseId]/page.tsx
├── admin/
│   ├── cases/page.tsx
│   ├── catalog/page.tsx
│   ├── inventory/
│   │   ├── page.tsx
│   │   └── check-in/page.tsx
│   ├── locations/page.tsx
│   ├── general-settings/ ← NEW: Settings hub
│   │   ├── page.tsx (hub)
│   │   ├── operating-rooms/page.tsx
│   │   ├── surgeons/page.tsx
│   │   └── case-dashboard/page.tsx
│   ├── pending-reviews/page.tsx
│   ├── reports/page.tsx
│   └── users/page.tsx
└── components/
    └── AdminNav.tsx (updated)
```

---

## Summary Statistics

- **Total Page Routes:** 26
- **Dynamic Routes:** 4 (all in `/case` and `/or` segments)
- **Layout Files:** 1 (root)
- **Admin Routes:** 12 (including general-settings sub-pages)
- **Client Components:** 26/26 (100%)
- **API Routes:** 0 (backend service pattern via `@/lib/api`)
- **Route Groups:** 4 (admin, or, case, surgeon)
- **New Routes (Latest Update):** 6
  - `/dashboard`
  - `/cases`
  - `/unassigned-cases`
  - `/surgeon/my-checklists`
  - `/admin/general-settings/operating-rooms`
  - `/admin/general-settings/surgeons`
  - `/admin/general-settings/case-dashboard`
