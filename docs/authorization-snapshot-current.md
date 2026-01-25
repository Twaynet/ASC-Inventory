# Comprehensive Authorization Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## 1. Where Authentication is Established

### Auth Provider (Client-Side)
**File:** `apps/web/src/lib/auth.tsx`

```
AuthProvider (React Context)
├── State: user, token, isLoading
├── Persistence: localStorage ('asc_token')
├── Login: POST /api/auth/login → sets user + token
├── Session Check: GET /api/auth/me on mount (validates stored token)
├── Logout: Clears state + localStorage
└── Exports: useAuth() hook, useAccessControl() hook
```

**Key Characteristics:**
- 100% client-side authentication (no server-side middleware)
- Token stored in `localStorage` under key `asc_token`
- Session validation on app mount via `/api/auth/me` endpoint
- No automatic token refresh mechanism observed

### Root Layout Integration
**File:** `apps/web/src/app/layout.tsx`

```tsx
<AuthProvider>
  <div className="app-container">
    <main>{children}</main>
    <Footer />
  </div>
</AuthProvider>
```

- AuthProvider wraps entire application
- All pages have access to auth context
- Server Component layout, but auth is client-side only

### API Client
**File:** `apps/web/src/lib/api.ts`

- Token passed via `Authorization: Bearer {token}` header
- All authenticated API calls require token parameter
- API base URL configurable via `NEXT_PUBLIC_API_URL` env var

---

## 2. Session/User Model Shape

### LoginResponse Interface
**File:** `apps/web/src/lib/api.ts:42-54`

```typescript
interface LoginResponse {
  token: string;
  user: {
    id: string;           // User UUID
    username: string;     // Login username
    email: string | null; // Optional email
    name: string;         // Display name
    role: string;         // Primary role (backward compat)
    roles: string[];      // All assigned roles (multi-role support)
    facilityId: string;   // Facility UUID
    facilityName: string; // Facility display name
  };
}
```

### Source of Truth
- **Server:** Backend API (`/api/auth/login`, `/api/auth/me`)
- **Client:** AuthContext state (populated from API response)
- **Persistence:** localStorage token only (user data re-fetched on mount)

### Multi-Role Support
- `user.roles` is the array of all assigned roles
- `user.role` is the primary/first role (backward compatibility)
- Access control uses UNION of capabilities from all roles

---

## 3. Roles and Capabilities

### Role Definitions
**File:** `apps/web/src/lib/access-control.ts:24-31`

| Role | Description |
|------|-------------|
| `SCRUB` | Surgical scrub technician |
| `CIRCULATOR` | OR circulating nurse |
| `INVENTORY_TECH` | Inventory management technician |
| `ADMIN` | System administrator |
| `SURGEON` | Surgeon |
| `SCHEDULER` | Case scheduler |

### Capability Definitions
**File:** `apps/web/src/lib/access-control.ts:8-22`

| Capability | Description |
|------------|-------------|
| `CASE_VIEW` | View case details and calendar |
| `VERIFY_SCAN` | Scan/verify case readiness |
| `CHECKLIST_ATTEST` | Sign checklists (timeout/debrief) |
| `OR_DEBRIEF` | Access debrief workflow |
| `OR_TIMEOUT` | Access timeout workflow |
| `INVENTORY_READ` | View inventory data |
| `INVENTORY_CHECKIN` | Check in inventory items |
| `INVENTORY_MANAGE` | Full inventory CRUD |
| `USER_MANAGE` | Manage user accounts |
| `LOCATION_MANAGE` | Manage locations/rooms |
| `CATALOG_MANAGE` | Manage catalog items |
| `REPORTS_VIEW` | View operational reports |
| `SETTINGS_MANAGE` | Manage facility settings |

### Role → Capability Mapping
**File:** `apps/web/src/lib/access-control.ts:34-49`

```typescript
ROLE_CAPABILITIES = {
  SCRUB: ['CASE_VIEW', 'VERIFY_SCAN', 'CHECKLIST_ATTEST'],
  CIRCULATOR: ['CASE_VIEW', 'CHECKLIST_ATTEST', 'OR_DEBRIEF', 'OR_TIMEOUT'],
  INVENTORY_TECH: ['INVENTORY_READ', 'INVENTORY_CHECKIN'],
  ADMIN: [
    'USER_MANAGE', 'LOCATION_MANAGE', 'CATALOG_MANAGE',
    'INVENTORY_MANAGE', 'REPORTS_VIEW', 'SETTINGS_MANAGE', 'CASE_VIEW'
  ],
  SURGEON: ['CASE_VIEW', 'CHECKLIST_ATTEST'],
  SCHEDULER: ['CASE_VIEW'],
}
```

### Capability Derivation Logic
**File:** `apps/web/src/lib/access-control.ts:273-282`

```typescript
function deriveCapabilities(roles: Role[]): Capability[] {
  const capabilitySet = new Set<Capability>();
  for (const role of roles) {
    const caps = ROLE_CAPABILITIES[role] || [];
    for (const cap of caps) {
      capabilitySet.add(cap);
    }
  }
  return Array.from(capabilitySet);
}
```

- Multi-role users get UNION of all capabilities
- Capabilities are deduped via Set

---

## 4. Enforcement Points

### A. Page-Level Authentication Redirects
**Pattern:** Most pages use this pattern in their component:

```typescript
const { user, token, isLoading } = useAuth();
const router = useRouter();

useEffect(() => {
  if (!isLoading && !user) {
    router.push('/login');
  }
}, [user, isLoading, router]);
```

**Files implementing this pattern (27 pages):**
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/cases/page.tsx`
- `apps/web/src/app/preference-cards/page.tsx`
- `apps/web/src/app/pending-reviews/page.tsx`
- `apps/web/src/app/unassigned-cases/page.tsx`
- `apps/web/src/app/surgeon/my-checklists/page.tsx`
- `apps/web/src/app/case/[caseId]/page.tsx`
- `apps/web/src/app/case/[caseId]/verify/page.tsx`
- `apps/web/src/app/or/debrief/[caseId]/page.tsx`
- `apps/web/src/app/or/timeout/[caseId]/page.tsx`
- All `/admin/*` pages

### B. Role-Based Access Checks

#### Pattern 1: Direct role check (single role)
```typescript
if (user.role !== 'ADMIN') {
  return <AccessDenied />;
}
```

**Files using this pattern:**
| File | Check |
|------|-------|
| `admin/inventory/page.tsx:189` | `user.role !== 'ADMIN'` |
| `admin/pending-reviews/page.tsx:124` | `user.role !== 'ADMIN'` |
| `admin/cases/page.tsx:248` | `user.role !== 'ADMIN' && user.role !== 'SCHEDULER'` |
| `pending-reviews/page.tsx:86` | `user.role !== 'SCRUB' && user.role !== 'SURGEON'` |
| `admin/inventory/check-in/page.tsx:140` | `user.role === 'ADMIN' \|\| user.role === 'INVENTORY_TECH'` |

#### Pattern 2: Multi-role check (roles array)
```typescript
const userRoles = user.roles || [user.role];
const isAdmin = userRoles.includes('ADMIN');
if (!isAdmin) {
  return <AccessDenied />;
}
```

**Files using this pattern:**
| File | Roles Checked |
|------|---------------|
| `admin/general-settings/page.tsx:51-58` | `ADMIN` |
| `admin/general-settings/surgeons/page.tsx:93-100` | `ADMIN` |
| `admin/general-settings/operating-rooms/page.tsx:155-162` | `ADMIN` |
| `admin/general-settings/case-dashboard/page.tsx:355-362` | `ADMIN` |
| `unassigned-cases/page.tsx:87-88` | `ADMIN` or `SCHEDULER` |
| `calendar/components/RoomBasedDayView.tsx:95-96` | `ADMIN` or `SCHEDULER` |

#### Pattern 3: useAccessControl hook
```typescript
const { hasRole } = useAccessControl();
if (!hasRole('SURGEON')) {
  return <AccessDenied />;
}
```

**Files using this pattern:**
| File | Check |
|------|-------|
| `surgeon/my-checklists/page.tsx:16,112` | `hasRole('SURGEON')` |

### C. Component-Level Access Checks

#### AdminNav Component
**File:** `apps/web/src/app/components/AdminNav.tsx:44-46`

```typescript
if (userRole !== 'ADMIN') {
  return null;
}
```
- Only renders Admin dropdown for ADMIN role
- Receives `userRole` from Header component (single role only)

#### Header Component
**File:** `apps/web/src/app/components/Header.tsx:59`

```typescript
<AdminNav userRole={user?.role || ''} />
```
- Passes primary `user.role` to AdminNav
- Does not use multi-role array

#### CaseDashboardContent (Conditional UI)
**File:** `apps/web/src/components/CaseDashboardModal/CaseDashboardContent.tsx:550`

```typescript
{(user.role === 'ADMIN' || user.role === 'SCHEDULER') && (
  <ScheduleEditor ... />
)}
```

#### DayView Component
**File:** `apps/web/src/app/calendar/components/DayView.tsx:661`

```typescript
{(user.role === 'SCRUB' || user.role === 'SURGEON') && timeoutDebriefEnabled && (
  <PendingReviewsSection ... />
)}
```

### D. Feature-Based Access Control (Dashboard)
**File:** `apps/web/src/lib/access-control.ts:66-248`

Features are defined with optional access requirements:
```typescript
{
  id: 'admin-users',
  requiredRoles: ['ADMIN'],
  requiredCapabilities: ['USER_MANAGE'],
}
```

Access decision logic:
1. No requirements = authenticated-only (allowed for all)
2. requiredRoles = OR logic (any matching role grants access)
3. requiredCapabilities = OR logic (any matching capability grants access)

---

## 5. Debug/Trace Tooling

### Dashboard Debug Panel
**File:** `apps/web/src/app/dashboard/page.tsx:127-174`

Features:
- Collapsible panel on System Dashboard
- Shows current user's roles (as tags)
- Shows derived capabilities (as tags)
- Shows feature-by-feature access decisions with reasons
- Copy to clipboard functionality

### Debug Info Generation
**File:** `apps/web/src/lib/access-control.ts:369-388`

```typescript
interface DebugInfo {
  roles: Role[];
  capabilities: Capability[];
  featureDecisions: {
    featureId: string;
    featureTitle: string;
    allowed: boolean;
    reason: string;  // e.g., "User has required role: ADMIN"
  }[];
}
```

### Access Decision Reasons
Possible reason strings:
- `"Authenticated-only feature (no role/capability requirements)"`
- `"User has required role: {ROLE}"`
- `"User has required capability: {CAPABILITY}"`
- `"Missing required roles: X OR Y OR capabilities: Z OR W"`

---

## 6. Inconsistencies and Observations

### Inconsistency 1: Single Role vs Multi-Role Checks

**Mixed patterns observed:**

| Pattern | Files Using |
|---------|-------------|
| `user.role !== 'X'` (single) | 8 files |
| `userRoles.includes('X')` (multi) | 10 files |
| `hasRole('X')` (hook) | 1 file |

**Specific examples:**
- `AdminNav.tsx` receives only `user.role` (single), not roles array
- `Header.tsx:60` displays only `user.role` in UI
- Admin pages use mixed patterns (some single, some multi)

### Inconsistency 2: Access Denied UI Handling

**Different approaches:**
1. Return `<AccessDenied />` message component
2. Return `null` (silent hide)
3. Redirect to login (conflates auth vs authz)

**Examples:**
- `admin/general-settings/page.tsx`: Returns "Access denied" alert
- `AdminNav.tsx`: Returns `null` (hidden)
- Some pages redirect to `/login` for role failures

### Inconsistency 3: SCHEDULER Role Access

| Page | SCHEDULER Access |
|------|------------------|
| `/admin/cases` | Yes (explicit check) |
| `/unassigned-cases` | Yes (explicit check) |
| `/admin/users` | No (ADMIN only) |
| `/admin/general-settings` | No (ADMIN only) |

SCHEDULER has `CASE_VIEW` capability but no admin capabilities.

### Inconsistency 4: Capability-Based vs Role-Based Checks

**Feature definitions use capabilities:**
```typescript
// access-control.ts
{ id: 'admin-inventory', requiredCapabilities: ['INVENTORY_MANAGE'] }
```

**But pages check roles directly:**
```typescript
// admin/inventory/page.tsx
if (user.role !== 'ADMIN') { ... }
```

The capability system is defined but not consistently enforced in pages.

### Observation: No Server-Side Authorization

- No Next.js middleware for auth/authz
- All enforcement is client-side
- API presumably has its own authorization (not analyzed)
- Token validation happens server-side via `/api/auth/me`

---

## Summary Tables

### Route Access Matrix

| Route | Roles Allowed | Check Type |
|-------|---------------|------------|
| `/dashboard` | All authenticated | Auth only |
| `/calendar` | All authenticated | Auth only |
| `/cases` | All authenticated | Auth only |
| `/preference-cards` | All authenticated | Auth only |
| `/pending-reviews` | SCRUB, SURGEON | Role check |
| `/unassigned-cases` | ADMIN, SCHEDULER | Role check |
| `/surgeon/my-checklists` | SURGEON | hasRole() hook |
| `/case/[caseId]` | All authenticated | Auth only |
| `/case/[caseId]/verify` | All authenticated | Auth only |
| `/or/debrief/[caseId]` | All authenticated | Auth only |
| `/or/timeout/[caseId]` | All authenticated | Auth only |
| `/admin/cases` | ADMIN, SCHEDULER | Role check |
| `/admin/users` | ADMIN | Role check |
| `/admin/locations` | ADMIN | Role check (implied) |
| `/admin/catalog` | ADMIN | Role check (implied) |
| `/admin/inventory` | ADMIN | Role check |
| `/admin/inventory/check-in` | ADMIN, INVENTORY_TECH | Role check |
| `/admin/reports` | ADMIN | Role check (implied) |
| `/admin/general-settings` | ADMIN | Role check |
| `/admin/general-settings/*` | ADMIN | Role check |
| `/admin/pending-reviews` | ADMIN | Role check |

### File Reference Index

| Component | File Path |
|-----------|-----------|
| AuthProvider | `apps/web/src/lib/auth.tsx` |
| useAuth hook | `apps/web/src/lib/auth.tsx:72-78` |
| useAccessControl hook | `apps/web/src/lib/auth.tsx:84-114` |
| Access control system | `apps/web/src/lib/access-control.ts` |
| API client | `apps/web/src/lib/api.ts` |
| Root layout | `apps/web/src/app/layout.tsx` |
| AdminNav | `apps/web/src/app/components/AdminNav.tsx` |
| Header | `apps/web/src/app/components/Header.tsx` |
| Debug panel | `apps/web/src/app/dashboard/page.tsx:127-174` |
