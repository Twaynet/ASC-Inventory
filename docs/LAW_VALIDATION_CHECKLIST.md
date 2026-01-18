# LAW Validation Checklist
Version: 1.0
Project: ASC Inventory Truth

---

## Purpose

This checklist provides a repeatable validation process to ensure any new or modified specification document complies with **LAW_NOMENCLATURE.md**.

Use this before implementing any feature or accepting any spec document.

---

## Required Terms and Definitions

When discussing preference entities, documents MUST use:

| Correct Term | Abbreviation | Usage |
|--------------|--------------|-------|
| Surgeon Preference Card | SPC | Surgeon-specific defaults/intent for a procedure |
| SPCID | - | Unique identifier for an SPC |
| SPC Version | - | Specific version of an SPC |
| Owner Surgeon | - | Surgeon whose preferences the SPC represents |

When discussing execution artifacts, documents MUST use:

| Correct Term | Abbreviation | Usage |
|--------------|--------------|-------|
| Case Card | CC | Execution artifact tied to exactly one case instance |
| CaseInstanceCard | - | Alternative name for Case Card |
| Case Instance | - | A scheduled surgery (date/time/facility) |

When discussing relationships, documents MUST use:

| Correct Term | Context |
|--------------|---------|
| "pins an SPC version" | Case Instance referencing an SPC |
| "pinned version" | The locked SPC version for a case |
| "explicit update action" | When changing a pinned version |
| "derived from" | CC relationship to SPC |

---

## Forbidden Terms and Usages

### Terminology Violations (HARD ERRORS)

| Forbidden | Why | Correct Alternative |
|-----------|-----|---------------------|
| "Case Card" when referring to preferences | Conflates execution with intent | "Surgeon Preference Card" or "SPC" |
| "Case Card (Template)" | Templates don't exist; SPCs are the source | "Surgeon Preference Card" or "SPC" |
| "Template" for preference entities | Misleading; SPCs are living documents | "Surgeon Preference Card" or "SPC" |
| "Card" (ambiguous) | Unclear which entity | Use "SPC" or "Case Card" explicitly |
| "ProcedureCard" | Non-canonical name | "Surgeon Preference Card" or "SPC" |
| "Preference Card" (without Surgeon) | Incomplete term | "Surgeon Preference Card" or "SPC" |

### Relationship Violations (HARD ERRORS)

| Forbidden Statement | Why | Correct Statement |
|--------------------|-----|-------------------|
| "SPC is tied to a scheduled case" | SPC is intent, not execution | "SPC may be selected for a case" |
| "Case Card is reusable across cases" | CC is per-case artifact | "SPC is reusable; CC is per-case" |
| "CC auto-updates when SPC changes" | Version pinning required | "CC remains stable; SPC version is pinned" |
| "latest updated version" (implicit) | Must be explicit | "pinned version" or "explicit update" |

### Governance Violations (HARD ERRORS)

| Forbidden Statement | Why | Correct Statement |
|--------------------|-----|-------------------|
| "admin-exclusive" for SPC | SPCs are not admin-locked | "Any permitted role may edit" |
| "only admins can create SPCs" | Multiple roles can create | "ADMIN, INVENTORY_TECH, CIRCULATOR, SCRUB, SURGEON" |
| "surgeons are the only editors" | Staff roles can also edit | "Permitted staff roles with audit logging" |
| "approval required" for SPC edits | No approval workflow | "Audit logged, no approval required" |

---

## Allowed/Forbidden Relationship Mapping

### Allowed Relationships

```
SPC ──[viewed by]──> Any permitted user
SPC ──[edited by]──> Permitted roles (with audit)
SPC ──[cloned to]──> New SPC (new ID, new owner)
SPC ──[selected by]──> Case Instance (by ID + version)

Case Instance ──[pins]──> SPC Version (immutable unless explicit update)
Case Instance ──[derives]──> Case Card (execution artifact)
Case Instance ──[stores]──> Readiness attestation
Case Instance ──[stores]──> Case-specific overrides

Case Card ──[references]──> Exactly one SPC ID + Version
Case Card ──[contains]──> Case-specific overrides
Case Card ──[is used for]──> Exactly one Case Instance
```

### Forbidden Relationships

```
SPC ──[is a]──> Case Card                    # FORBIDDEN: Different entities
Case Card ──[is reused for]──> Multiple cases # FORBIDDEN: CC is per-case
Case Card ──[auto-updates from]──> SPC       # FORBIDDEN: Must be explicit
SPC ──[is tied to]──> Scheduled case         # FORBIDDEN: SPC is intent only
SPC ──[owned exclusively by]──> Admin        # FORBIDDEN: Not admin-exclusive
```

---

## Common Drift Patterns

### 1. Template Confusion

**Symptom**: Document refers to SPC as a "template" or "Case Card (Template)"

**Why it's wrong**: SPCs are not templates. Templates imply static documents that spawn copies. SPCs are living documents that represent intent and are versioned.

**Detection**: Search for "template" in SPC context

**Fix**: Replace with "Surgeon Preference Card" or "SPC"

---

### 2. Wrong-Version Linking

**Symptom**: Document implies Case Instance uses "latest" SPC version automatically

**Why it's wrong**: Case Instances must pin a specific SPC version. Silent updates break historical integrity.

**Detection**: Search for "latest version", "auto-update", "current version" without explicit pinning language

**Fix**: Use "pinned version" and require "explicit update action" for version changes

---

### 3. Entity Conflation

**Symptom**: Document uses "Case Card" when describing surgeon preferences or defaults

**Why it's wrong**: Case Cards are execution artifacts. Preferences are SPCs.

**Detection**: Search for "Case Card" near "preference", "default", "intent", "surgeon-specific"

**Fix**: Separate the concepts. If discussing preferences, use SPC. If discussing execution for a specific case, use CC.

---

### 4. Admin Gatekeeping

**Symptom**: Document claims only admins can create/edit SPCs

**Why it's wrong**: SPCs are not admin-exclusive. Multiple roles (ADMIN, INVENTORY_TECH, CIRCULATOR, SCRUB, SURGEON) can create and edit.

**Detection**: Search for "admin only", "admin-exclusive", "administrator required"

**Fix**: List all permitted roles, emphasize audit logging over permission restrictions

---

### 5. Implicit Version Selection

**Symptom**: Document doesn't mention version pinning when discussing case-SPC linkage

**Why it's wrong**: Without explicit versioning, the system will drift to "latest version" behavior

**Detection**: Search for case-SPC relationship statements without "version", "pin", or "explicit"

**Fix**: Add explicit version pinning language: "Case Instance pins SPC version at selection time"

---

### 6. Filename/Content Mismatch

**Symptom**: Filename contains "case-card" but content is about SPCs (or vice versa)

**Why it's wrong**: Creates confusion about what entity the document governs

**Detection**: Compare filename against document title and scope declaration

**Fix**: Rename file to match content (e.g., `spc-governance-workflow.md`)

---

## How to Validate a New Spec

### Step 1: Check Scope Declaration

Every spec document MUST have a clear scope declaration stating which entities it governs.

**Required**: A section near the top stating:
- What entity/entities this document governs
- What entity/entities this document does NOT govern

**Example**:
```markdown
## Scope Declaration
This document governs **Surgeon Preference Cards (SPCs)** only.
It does NOT govern Case Cards, Case Instances, or Case Dashboards.
```

---

### Step 2: Scan for Forbidden Terms

Run automated scan for:

1. **"Case Card" in SPC context**
   - Pattern: `case card` near `preference|default|intent|surgeon-specific`

2. **"Template" for SPC**
   - Pattern: `template` in SPC context
   - Pattern: `case card (template)` or `case card template`

3. **Ambiguous "Card"**
   - Pattern: standalone `card` without `SPC`, `Case Card`, or `Surgeon Preference`

4. **Implicit versioning**
   - Pattern: `latest version|auto-update|current version` without explicit pinning

5. **Admin exclusivity**
   - Pattern: `admin only|admin-exclusive|administrator required` for SPC

---

### Step 3: Verify Relationship Statements

For each relationship mentioned in the document:

1. **SPC relationships**
   - [ ] Does NOT claim SPC is tied to a specific case
   - [ ] Does NOT claim SPC auto-updates cases
   - [ ] Does claim SPC is viewable by permitted users
   - [ ] Does claim SPC edits are audit logged

2. **Case Instance relationships**
   - [ ] Does claim version pinning if mentioning SPC selection
   - [ ] Does require explicit action for version updates
   - [ ] Does NOT claim auto-update from SPC

3. **Case Card relationships**
   - [ ] Does claim CC is per-case (exactly one case instance)
   - [ ] Does NOT claim CC is reusable
   - [ ] Does claim CC references SPC ID + Version

---

### Step 4: Verify Naming Conventions

Check that code references (if any) use canonical names:

- [ ] `SurgeonPreferenceCard` or `SPC` for preference entities
- [ ] `CaseCard` or `CaseInstanceCard` for execution artifacts
- [ ] Routes reflect entity served (e.g., `/spc/...` not `/cards/...`)

---

### Step 5: Cross-Reference with LAW

Read LAW_NOMENCLATURE.md and verify:

- [ ] No contradictions with Core Law
- [ ] No contradictions with Entity Definitions
- [ ] No contradictions with Relationship Rules
- [ ] No contradictions with Forbidden Relationships
- [ ] No contradictions with Versioning Rules
- [ ] No contradictions with Access and Governance Summary

---

### Step 6: Document Decision

After validation, add a note to the spec:

```markdown
## LAW Compliance
Validated against LAW_NOMENCLATURE.md v1.0 on [DATE]
Validator: [NAME or SYSTEM]
Result: PASS / FAIL (with issues listed)
```

---

## Automated Validation

Run the validator script:

```bash
# Validate a single file
pnpm validate:doc docs/new-spec.md

# Validate all spec files
pnpm validate:docs
```

The script will:
1. Scan for forbidden terms
2. Check relationship statements
3. Flag versioning drift
4. Report violations with file, line, rule, and snippet

Exit codes:
- `0` = PASS (no violations)
- `1` = FAIL (violations found)

---

## Escalation

If a spec cannot be made compliant:

1. Document the conflict
2. Propose amendment to LAW_NOMENCLATURE.md
3. Get explicit approval before proceeding
4. Update LAW version number if amended

Do NOT implement non-compliant specs. The LAW exists to prevent drift.

---

End of Document
