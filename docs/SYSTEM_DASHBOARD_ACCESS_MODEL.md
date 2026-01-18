# System Dashboard – Access Model for Cross-Trained ASC Staff (v1)

## Summary

This document defines the access-control and UI visibility rules for the **System Dashboard** (the first page after login).

ASCs are cross-trained environments:
- A scrub tech may also do inventory duties
- An admin may also circulate
- A user may rotate responsibilities by day/shift

Therefore:
- **Single-role assumptions are invalid**
- Users must support **multiple roles simultaneously**
- The System Dashboard must show **only what the user is allowed to access**
- The dashboard must also function as a **debugging tool** to reduce misunderstandings

---

## Goals

1. Provide a post-login landing page that exposes all available features/routes a user can access.
2. Reflect real ASC cross-training with **multi-role access**.
3. Avoid “role explosion” by using **capabilities/permissions** as the primary gating mechanism.
4. Make authorization decisions **transparent** via an on-page Debug Panel.
5. Prevent regressions (re-introducing single-role logic) with guardrails.

---

## Definitions

### Role
A **human job label** (SCRUB_TECH, INVENTORY_TECH, CIRCULATOR, ADMIN, SURGEON, etc).

- Users can have **multiple roles simultaneously**
- Roles may vary by shift, but the system treats roles as a stable assignment unless you implement shift-based switching

### Capability (Permission)
A **specific action/privilege** that controls access (VERIFY_SCAN, INVENTORY_CHECKIN, REPORTS_VIEW, etc).

- Capabilities are the preferred authorization mechanism
- Roles map to capabilities (role bundles)

### Effective Access
A user’s **effective access** is the **union** of all capabilities granted by all assigned roles.

> EffectiveCapabilities = UNION( RoleCapabilities[role] for each role in user.roles )

---

## Required Data Model

### User session object must include:
- `roles: Role[]` (array, not a single string)
- optionally `capabilities: Capability[]` (either stored or derived at runtime)
- optional `facilityKey` / `locationId` if facility scoping exists

Example:
```ts
type Role = string;
type Capability = string;

type SessionUser = {
  id: string;
  username: string;
  roles: Role[];                 // REQUIRED: multi-role
  facilityKey?: string;          // optional
  // capabilities?: Capability[]; // optional if computed
};
