# PLATFORM CONTROL PLANE LAW
Version: 1.1
Scope: ASC Inventory Truth multi-facility platform
Status: LAW (non-negotiable invariants)

1. Purpose
The Platform Control Plane governs cross-tenant operation of the platform so that onboarding, configuration changes, rollouts, and support can occur safely without routine off-hours code changes. It exists to reduce operational risk, limit blast radius, and provide auditability.

2. Separation of Planes
2.1 The Tenant Plane is the facility-scoped application used for daily clinical and operational work.
2.2 The Control Plane is the platform-scoped application used to operate, configure, and support tenants.
2.3 Separation is mandatory at routing, API, authorization, repository, and UI layers.
2.4 Tenant users must never access Control Plane routes or endpoints.
2.5 Control Plane logic must never infer tenant scope implicitly.

3. Platform Identity Model
3.1 PLATFORM_ADMIN is a non-tenant identity.
3.2 PLATFORM_ADMIN users have no implicit facility context.
3.3 Any Control Plane action affecting a tenant must explicitly declare targetFacilityId.
3.4 Tenant Plane endpoints remain facility-scoped and must not become cross-tenant by virtue of platform role.
3.5 Cross-tenant effects are permitted only through Control Plane endpoints.

4. Authorization and Capabilities
4.1 Authorization is capability-based with centrally defined capabilities.
4.2 Platform capabilities are distinct from tenant capabilities.
4.3 High-risk actions require additional controls such as reason codes and notes.
4.4 Break-glass actions must be time-limited and audited.

5. Configuration Governance
5.1 Operational system variables must be database-governed configuration, not environment variables, except for bootstrapping secrets.
5.2 Configuration is defined in a typed registry with validation rules.
5.3 Configuration scopes include at minimum PLATFORM and FACILITY.
5.4 Effective configuration is resolved deterministically: Facility override, then Platform default, then Code fallback.
5.5 Code fallback is permitted only for safety and bootstrapping.
5.6 All configuration changes are versioned and audited.

6. Versioning, Diff, and Rollback
6.1 Every configuration change produces an immutable version.
6.2 The system must support viewing effective config, diffing versions, and rollback.
6.3 Rollback must not require redeployment.
6.4 High-risk changes require explicit justification.

7. Rollouts and Kill Switches
7.1 Any feature that can disrupt operations must have a kill switch.
7.2 Rollouts must support staged enablement.
7.3 Scheduled activation windows must be supported.
7.4 Rollout execution must be auditable.

8. Tenant Onboarding
8.1 Facilities are created and activated only via Control Plane.
8.2 Onboarding is template-driven and repeatable.
8.3 Activation requires validation or audited override.

9. Data Access Rules
9.1 Tenant queries enforce facility scoping by default.
9.2 Control Plane queries require explicit tenant targeting.
9.3 Cross-tenant reporting is Control Plane only and auditable.

10. Support Access
10.1 Support access is time-limited and reasoned.
10.2 All support actions are auditable.
10.3 PHI exposure must be minimized.

11. Audit and Evidence
11.1 All Control Plane mutations emit immutable audit events.
11.2 Audit logs must support incident reconstruction.

12. Observability and Safety
12.1 Control Plane must expose sufficient signals to manage rollouts safely.
12.2 Every high-risk change must have a defined revert path.

13. Enforcement
13.1 Explicit target facility enforcement is mandatory.
13.2 High-risk controls must be enforced server-side.
13.3 Control Plane access must be test-verified.

14. Migration Principles
14.1 Operational toggles migrate from env vars to registry.
14.2 Secrets remain external.
14.3 Migration must preserve existing behavior.

15. Definitions
Facility: a tenant entity.
Control Plane: platform operator surface.
Registry Key: typed configuration definition.
Effective Config: resolved configuration for a facility.
High-risk Key: configuration affecting safety, integrity, or uptime.
Support Session: time-limited privileged access context.

