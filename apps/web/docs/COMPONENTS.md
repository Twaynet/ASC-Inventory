# Shared Components & Hooks

This document describes the shared components and hooks available for building pages in the ASC Inventory web app.

## Directory Structure

```
apps/web/src/
├── app/
│   └── components/           # Shared UI components
│       ├── Header.tsx        # Page header with navigation
│       ├── Footer.tsx        # Page footer
│       ├── AdminNav.tsx      # Admin navigation dropdown
│       ├── Alert.tsx         # Alert/notification components
│       └── StatusBadge.tsx   # Status badge components
└── lib/
    ├── hooks/                # Shared React hooks
    │   └── usePageData.ts    # Page data loading hook
    ├── api.ts                # API client functions
    ├── auth.tsx              # Authentication context
    └── access-control.ts     # Role-based access control
```

## Hooks

### `usePageData<T>`

Consolidates auth redirect, loading states, error handling, and data fetching for page components.

**Location:** `lib/hooks/usePageData.ts`

**Usage:**
```tsx
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';

const { data, isLoading, isLoadingData, error, successMessage, setError, setSuccessMessage, refetch, token, accessDenied } = usePageData({
  fetchFn: async (token) => {
    const result = await getItems(token);
    return result.items;
  },
  requiredRoles: ['ADMIN'],  // Optional: restrict to specific roles
  deps: [filterValue],       // Optional: dependencies that trigger refetch
});
```

**Returns:**
- `data` - The fetched data (or null)
- `isLoading` - Initial auth loading state
- `isLoadingData` - Data fetching loading state
- `error` / `successMessage` - Message strings
- `setError` / `setSuccessMessage` - Message setters
- `clearError` / `clearSuccess` - Message clearers
- `refetch` - Function to manually refetch data
- `user` / `token` - Auth context values
- `accessDenied` - True if user lacks required roles

### `withErrorHandling`

Wraps async operations with standardized error handling.

**Usage:**
```tsx
const handleCreate = async (e: React.FormEvent) => {
  e.preventDefault();
  await withErrorHandling(
    () => createItem(token, data),
    setError,
    () => {
      setSuccessMessage('Item created');
      refetch();
    }
  );
};
```

---

## Components

### `Alert` / `PageAlerts`

Displays dismissible alerts for error, success, info, and warning messages.

**Location:** `app/components/Alert.tsx`

**Usage:**
```tsx
import { Alert, PageAlerts } from '@/app/components/Alert';

// Single alert
<Alert message={error} variant="error" onDismiss={clearError} />

// Combined alerts (most common)
<PageAlerts
  error={error}
  success={successMessage}
  onDismissError={clearError}
  onDismissSuccess={clearSuccess}
  successAutoDismiss={3000}  // Auto-dismiss success after 3s
/>
```

**Variants:** `error` | `success` | `info` | `warning`

### `StatusBadge` / `ReadinessBadge`

Type-safe status badges with consistent styling.

**Location:** `app/components/StatusBadge.tsx`

**Usage:**
```tsx
import { StatusBadge, ReadinessBadge } from '@/app/components/StatusBadge';

// Case/workflow status
<StatusBadge status="SCHEDULED" />
<StatusBadge status="IN_PROGRESS" size="sm" />
<StatusBadge status={item.active ? 'ACTIVE' : 'INACTIVE'} />

// Readiness status (green/orange/red)
<ReadinessBadge status="green" />
<ReadinessBadge status="orange" label="Missing Items" />
```

**Status values:**
- Case workflow: `REQUESTED`, `SCHEDULED`, `READY`, `IN_PROGRESS`, `COMPLETED`, `REJECTED`, `CANCELLED`
- Approval: `PENDING`, `APPROVED`
- Active state: `ACTIVE`, `INACTIVE`

---

## Naming Conventions

1. **Hooks** start with `use` and live in `lib/hooks/`
2. **Components** are PascalCase and live in `app/components/`
3. **Domain-specific components** include the domain in the name (e.g., `CaseStatusBadge` if it were case-specific)
4. **Avoid overly generic names** like `GenericModal` - prefer domain-oriented names

## When to Extract

Extract to shared components/hooks when:
- The same pattern appears in 3+ pages
- The logic is non-trivial (>10 lines)
- The abstraction has clear, stable boundaries

Do NOT extract when:
- The pattern is page-specific
- The code is still evolving rapidly
- Extraction would require complex configuration to handle all cases

## Existing Global Styles

Many UI patterns are already handled by global CSS in `app/globals.css`:
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`
- `.form-group`, `.form-row`, `.form-actions`
- `.alert`, `.alert-error`, `.alert-success`, `.alert-info`
- `.data-table`, `.modal-overlay`, `.modal-content`
- `.summary-card`, `.summary-grid`

Use these class names directly rather than creating new component wrappers.
