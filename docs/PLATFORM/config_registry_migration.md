# CONFIG REGISTRY MIGRATION
Purpose: migrate operational environment variables to the Control Plane configuration registry without changing behavior or increasing risk.

1. Inventory
Identify all environment variables. Classify into bootstrapping secrets, operational toggles, and tuning parameters.

2. Registry Definition
For each operational variable, define a registry key with type, default, scope, risk class, and validation rules.

3. Dual-Read Phase
Update code paths to read from registry first and env var second. Emit metrics when env fallback is used.

4. Baseline Seeding
Seed platform defaults to match current env behavior. Validate effective config matches pre-migration behavior.

5. Verification
Monitor metrics and logs to ensure registry values are applied and env fallback usage drops to zero.

6. Cutover
Remove env reads once stable. Keep rollback capability via registry versions.

7. Documentation
Document each migrated key, its intent, risk class, and rollback procedure.

8. Enforcement
New operational toggles may not be introduced as env vars. Registry usage is mandatory going forward.

