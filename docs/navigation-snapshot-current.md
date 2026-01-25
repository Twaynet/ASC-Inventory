# Comprehensive Navigation Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## 1. Navigation Components & Render Locations

### Header Component
**File:** `apps/web/src/app/components/Header.tsx`
**Renders in:** Every authenticated page (imported individually by each page)

| Element | Type | Behavior |
|---------|------|----------|
| Home Button | Icon button | Navigates to `/dashboard` (hidden when on dashboard) |
| Title | Static text | Page-specific title passed as prop |
| AdminNav | Dropdown | Admin-only navigation (see below) |
| User Info | Text | Displays `{user.name} ({user.role})` and facility name |
| Sign Out | Button | Calls `logout()` from AuthContext |

### AdminNav Component
**File:** `apps/web/src/app/components/AdminNav.tsx`
**Renders in:** Header component
**Condition:** Only renders when `userRole === 'ADMIN'`

| Path | Label |
|------|-------|
| `/admin/cases` | Cases |
| `/admin/users` | Users |
| `/admin/locations` | Locations |
| `/admin/catalog` | Catalog |
| `/admin/inventory` | Inventory |
| `/preference-cards` | Surgeon Preference Cards |
| `/admin/reports` | Reports |
| `/admin/general-settings` | General Settings |
| `/admin/pending-reviews` | Pending Reviews |

### Footer Component
**File:** `apps/web/src/app/components/Footer.tsx`
**Renders in:** Root layout (`apps/web/src/app/layout.tsx`)
**Content:** Version info, build time (no navigation links)

### Dashboard Feature Cards
**File:** `apps/web/src/lib/access-control.ts` (FEATURES array)
**Renders in:** `/dashboard` page via `FeatureSection` component

---

## 2. All Navigation Links (By Source)

### Dashboard Feature Cards (Core Group)
| Path | Label | Condition | Badge |
|------|-------|-----------|-------|
| `/calendar` | Calendar | All authenticated | - |
| `/cases` | Case Requests | All authenticated | Pending count |
| `/preference-cards` | Surgeon Preference Cards | All authenticated | - |
| `/pending-reviews` | My Pending Reviews | All authenticated | - |
| `/surgeon/my-checklists` | My Checklists | `SURGEON` role only | - |
| `/unassigned-cases` | Unassigned Cases | `ADMIN` or `SCHEDULER` | Count |

### Dashboard Feature Cards (Case Workflows - Contextual)
| Path | Label | Condition | Note |
|------|-------|-----------|------|
| (none) | Case Dashboard | `CASE_VIEW` capability | Opened from Calendar |
| (none) | Readiness Verification | `VERIFY_SCAN` capability | Opened from Case Dashboard |
| (none) | OR Debrief | `OR_DEBRIEF` capability | Opened from Case Dashboard |
| (none) | OR Timeout | `OR_TIMEOUT` capability | Opened from Case Dashboard |

### Dashboard Feature Cards (Admin Group)
| Path | Label | Condition | Badge |
|------|-------|-----------|-------|
| `/admin/cases` | Cases | `ADMIN` or `SCHEDULER` | Admin |
| `/admin/users` | Users | `ADMIN` + `USER_MANAGE` | Admin |
| `/admin/locations` | Locations | `ADMIN` + `LOCATION_MANAGE` | Admin |
| `/admin/catalog` | Catalog | `ADMIN` + `CATALOG_MANAGE` | Admin |
| `/admin/inventory` | Inventory | `ADMIN` + `INVENTORY_MANAGE` | Admin |
| `/admin/inventory/check-in` | Inventory Check-In | `ADMIN` + `INVENTORY_CHECKIN` | Admin |
| `/admin/reports` | Reports | `ADMIN` + `REPORTS_VIEW` | Admin |
| `/admin/general-settings` | General Settings | `ADMIN` + `SETTINGS_MANAGE` | Admin |
| `/admin/pending-reviews` | All Pending Reviews | `ADMIN` | Admin, Count |

### In-Page Navigation Links

#### Calendar Page
**File:** `apps/web/src/app/calendar/page.tsx`, `DayView.tsx`, `RoomBasedDayView.tsx`, `ScheduleCard.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/case/{caseId}` | Click case card/name | All users |
| `/or/timeout/{caseId}` | "Timeout" button | Active, non-cancelled cases |
| `/or/debrief/{caseId}` | "Debrief" button | Active, non-cancelled cases |
| `/pending-reviews` | "View My Reviews" link | `SCRUB` or `SURGEON` role |
| `/admin/general-settings/operating-rooms` | "Manage Operating Rooms" | `ADMIN` or `SCHEDULER` |

#### Case Dashboard
**File:** `apps/web/src/components/CaseDashboardModal/CaseDashboardContent.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/case/{caseId}/verify` | "Scan Verification" button | Always available |

#### Verify Page
**File:** `apps/web/src/app/case/[caseId]/verify/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/case/{caseId}` | "Done" button | No returnTo param |
| `{returnTo}` | "Done" button | With returnTo param |

#### OR Timeout/Debrief Pages
**Files:** `apps/web/src/app/or/timeout/[caseId]/page.tsx`, `apps/web/src/app/or/debrief/[caseId]/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/calendar` | "Return to Calendar" button | Always |

#### Pending Reviews Page
**File:** `apps/web/src/app/pending-reviews/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/or/debrief/{caseId}` | Row click | For debrief items |

#### Admin Pending Reviews Page
**File:** `apps/web/src/app/admin/pending-reviews/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/or/debrief/{caseId}` | "View" button | For debrief items |

#### Unassigned Cases Page
**File:** `apps/web/src/app/unassigned-cases/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/calendar?view=day&date={date}` | Click date group | Always |
| `/dashboard` | Back arrow | Always |

#### Admin Inventory Page
**File:** `apps/web/src/app/admin/inventory/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/admin/inventory/check-in` | "Check In" button | Always |

#### Admin Inventory Check-In Page
**File:** `apps/web/src/app/admin/inventory/check-in/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/admin/inventory` | "View Inventory" link | Always |

#### General Settings Hub
**File:** `apps/web/src/app/admin/general-settings/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/admin/general-settings/operating-rooms` | Card click | Always |
| `/admin/general-settings/surgeons` | Card click | Always |
| `/admin/general-settings/case-dashboard` | Card click | Always |

#### General Settings Sub-Pages
**Files:** `operating-rooms/page.tsx`, `surgeons/page.tsx`, `case-dashboard/page.tsx`
| Target | Trigger | Condition |
|--------|---------|-----------|
| `/admin/general-settings` | Back button | Always |

---

## 3. Redirect Rules & Default Landings

### Root Page (`/`)
**File:** `apps/web/src/app/page.tsx`
```
IF authenticated → /dashboard
ELSE → /login
```

### Login Page (`/login`)
**File:** `apps/web/src/app/login/page.tsx`
```
IF already authenticated → /dashboard
ON successful login → /dashboard
```

### Authentication Redirect Pattern
**Pattern used in:** All authenticated pages
```typescript
useEffect(() => {
  if (!isLoading && !user) {
    router.push('/login');
  }
}, [user, isLoading, router]);
```

**Pages implementing this pattern (27 total):**
- `/dashboard`
- `/calendar`
- `/cases`
- `/preference-cards`
- `/pending-reviews`
- `/unassigned-cases`
- `/surgeon/my-checklists`
- `/case/[caseId]`
- `/case/[caseId]/verify`
- `/or/timeout/[caseId]`
- `/or/debrief/[caseId]`
- `/admin/cases`
- `/admin/users`
- `/admin/locations`
- `/admin/catalog`
- `/admin/inventory`
- `/admin/inventory/check-in`
- `/admin/reports`
- `/admin/general-settings`
- `/admin/general-settings/operating-rooms`
- `/admin/general-settings/surgeons`
- `/admin/general-settings/case-dashboard`
- `/admin/pending-reviews`

### Legacy Redirect
**File:** `apps/web/src/app/case-cards/page.tsx`
```
/case-cards → /preference-cards (router.replace)
```

### Default Landing After Login
**Destination:** `/dashboard`

---

## 4. Deep-Link Entrypoints

Routes designed to be entered directly via URL:

### Public Routes
| Route | Purpose |
|-------|---------|
| `/login` | Authentication entry |

### Authenticated Routes (Direct Entry Supported)
| Route | Purpose | Parameters |
|-------|---------|------------|
| `/dashboard` | Main landing page | - |
| `/calendar` | Surgical schedule | `?view=`, `?date=`, `?openCase=` |
| `/cases` | Case requests list | - |
| `/preference-cards` | SPC management | - |
| `/pending-reviews` | User's pending reviews | - |
| `/unassigned-cases` | Unassigned cases queue | - |
| `/surgeon/my-checklists` | Surgeon checklists | - |
| `/case/{caseId}` | Case dashboard | caseId (UUID) |
| `/case/{caseId}/verify` | Verification scanning | caseId, `?returnTo=` |
| `/or/timeout/{caseId}` | Timeout workflow | caseId |
| `/or/debrief/{caseId}` | Debrief workflow | caseId |

### Admin Routes (Direct Entry Supported)
| Route | Purpose |
|-------|---------|
| `/admin/cases` | Case management |
| `/admin/users` | User management |
| `/admin/locations` | Location management |
| `/admin/catalog` | Catalog management |
| `/admin/inventory` | Inventory management |
| `/admin/inventory/check-in` | Inventory check-in |
| `/admin/reports` | Reports |
| `/admin/general-settings` | Settings hub |
| `/admin/general-settings/operating-rooms` | OR management |
| `/admin/general-settings/surgeons` | Surgeon colors |
| `/admin/general-settings/case-dashboard` | Case config |
| `/admin/pending-reviews` | Admin review queue |

### URL Parameters
| Route | Parameter | Purpose |
|-------|-----------|---------|
| `/calendar` | `view` | View mode: `month`, `week`, `day` |
| `/calendar` | `date` | Selected date (YYYY-MM-DD) |
| `/calendar` | `openCase` | Auto-open case modal |
| `/case/{id}/verify` | `returnTo` | Return destination after verify |

---

## 5. Unreachable Routes (No Direct Links)

Routes that exist but are not linked from any navigation component:

### Legacy/Redirect Route
| Route | Status | Notes |
|-------|--------|-------|
| `/case-cards` | Redirect only | Redirects to `/preference-cards` |

### Routes Only Accessible Via URL
| Route | Reason |
|-------|--------|
| `/admin/locations` | Only in AdminNav dropdown (ADMIN only) |
| `/admin/catalog` | Only in AdminNav dropdown (ADMIN only) |

### Observations
- All admin routes are accessible via AdminNav dropdown (ADMIN role)
- Case workflow routes (`/or/timeout/`, `/or/debrief/`) are contextual (require caseId)
- Dashboard feature cards duplicate some AdminNav links for convenience

---

## 6. Navigation Flow Summary

### Primary User Flows

#### Authentication Flow
```
/login → [login success] → /dashboard
```

#### Case Management Flow
```
/dashboard → /calendar → [click case] → /case/{id}
                                      ↓
                           /case/{id}/verify
                                      ↓
                           /or/timeout/{id}
                                      ↓
                           /or/debrief/{id}
```

#### Case Request Flow
```
/dashboard → /cases → [create request]
             ↓
/admin/cases → [approve] → appears on /calendar
```

#### Admin Settings Flow
```
/dashboard → /admin/general-settings → /admin/general-settings/operating-rooms
                                     → /admin/general-settings/surgeons
                                     → /admin/general-settings/case-dashboard
```

### Navigation Hierarchy
```
/ (redirect)
├── /login (public)
├── /dashboard (landing)
│   ├── /calendar
│   │   └── /case/{id}
│   │       ├── /case/{id}/verify
│   │       ├── /or/timeout/{id}
│   │       └── /or/debrief/{id}
│   ├── /cases
│   ├── /preference-cards
│   ├── /pending-reviews
│   ├── /unassigned-cases (ADMIN/SCHEDULER)
│   └── /surgeon/my-checklists (SURGEON)
└── /admin/* (ADMIN only via AdminNav)
    ├── /admin/cases
    ├── /admin/users
    ├── /admin/locations
    ├── /admin/catalog
    ├── /admin/inventory
    │   └── /admin/inventory/check-in
    ├── /admin/reports
    ├── /admin/general-settings
    │   ├── /admin/general-settings/operating-rooms
    │   ├── /admin/general-settings/surgeons
    │   └── /admin/general-settings/case-dashboard
    └── /admin/pending-reviews
```

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total Routes | 26 |
| Public Routes | 1 (`/login`) |
| Redirect-Only Routes | 2 (`/`, `/case-cards`) |
| Admin Routes | 12 |
| Dynamic Routes | 4 (`[caseId]`) |
| Routes with URL Params | 2 (`/calendar`, `/case/{id}/verify`) |
| Navigation Components | 3 (Header, AdminNav, Footer) |
| AdminNav Links | 9 |
| Dashboard Feature Cards | 19 |
