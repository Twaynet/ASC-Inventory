# PLATFORM CONTROL PLANE PROCEDURES
Companion to PLATFORM CONTROL PLANE LAW v1.1

0. Scope
This document defines concrete tables, endpoints, middleware, UI flows, and enforcement mechanisms that implement the LAW.

1. Data Model
Defines registry keys, platform defaults, facility overrides, audit events, facility templates, onboarding runs, and support sessions. All mutation tables are append-only or versioned.

2. Identity and Auth
PLATFORM_ADMIN is a no-tenant identity. Facility context is explicit and never inferred. JWT includes role, capabilities, and optional supportSessionId.

3. Middleware
requirePlatformAdmin enforces role. requireTargetFacilityId enforces explicit tenant targeting. requireCapability enforces least privilege. requireSupportSession validates time-limited support context.

4. Configuration Registry
Configuration keys are typed and validated. Values are stored as platform defaults or facility overrides. Effective config resolution is server-side and deterministic.

5. Versioning and Rollback
Every change creates a new version and audit event. Rollback restores a previous version without redeploy.

6. Rollouts
Supports cohort-based staged rollout, scheduling, abort, and audit. Minimum implementation may use bulk overrides with explicit cohort tracking.

7. Facility Onboarding
Facilities are created via Control Plane, seeded from templates, validated, and activated. Onboarding is atomic and auditable.

8. Support Sessions
Support access is time-limited, scoped, reasoned, and auditable. Optional impersonation is explicitly gated and logged.

9. UI
Control Plane UI lives under /platform with dedicated navigation. Acting-on-facility context is always visible.

10. Validation Rules
High-risk changes require reason and note. Scheduled activation may be mandatory. Template application is atomic.

11. Migration
Env vars migrate to registry via dual-read period and staged cutover.

12. Testing
Auth boundaries, config resolution, rollback, audit emission, onboarding validation, and support session enforcement must be covered by automated tests.

13. Operational Playbooks
Defines emergency disable, facility-specific mitigation, and rollback workflows.

14. Naming Conventions
Feature flags, modes, rate limits, and kill switches follow standardized naming to maintain legibility.

