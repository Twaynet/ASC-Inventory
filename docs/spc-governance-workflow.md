# Surgeon Preference Card Governance and Workflow
Version: 1.1  
Project: ASC Inventory Truth

---

## Scope Declaration (Critical)

This document governs **Surgeon Preference Cards (SPCs)** only.

It does NOT govern:
- Case Cards (execution artifacts)
- Case Instances
- Case Dashboards

---

## Purpose

Define how SPCs are created, edited, cloned, locked, deactivated, and soft-deleted while preserving accountability without restricting real-world OR workflows.

---

## Ownership (Attribution)

- Each SPC is attributed to one Owner Surgeon
- Ownership represents whose preferences the SPC reflects
- Ownership does NOT restrict who may edit

---

## Roles with SPC Access

May create, view, edit, and maintain SPCs:
- ADMIN
- INVENTORY_TECH
- CIRCULATOR
- SCRUB
- SURGEON

Excluded:
- SCHEDULER

---

## Editing Rules

- Any permitted role may edit any SPC
- All edits must be audit logged
- Non-owner edits require a reason

---

## Soft-Lock Strategy

- Entering edit mode applies a soft-lock
- Others may view but not save
- Lock shows holder and timestamp
- Lock expires after inactivity or release

---

## Revert Policy (Append-Only)

- Reverts apply a new edit restoring prior state
- No history is deleted
- Reverts are audit logged with reason

---

## Deactivation

- Only Owner Surgeon or ADMIN may deactivate
- Deactivation requires a reason
- Deactivated SPCs are not selectable by default

---

## Soft Delete (Tombstone)

- Only Owner Surgeon may soft-delete
- Requires reason
- SPC becomes read-only and non-selectable
- History is preserved

---

## Seeding (Cloning)

- Any SPC may be cloned to create a new SPC
- New SPC receives:
  - New SPCID
  - New owner
  - Fresh audit log
- No provenance tracking required

---

## Audit Log Requirements

Each entry must capture:
- SPCID
- Timestamp
- User
- Role
- Action Type
- Reason
- Change Summary

---

## Explicit Non-Goals

- No publish/approval workflows
- No surgeon sign-off requirement
- No admin exclusivity
- No automatic case updates

---
End of Document
