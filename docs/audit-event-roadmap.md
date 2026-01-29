# Audit Event Roadmap

Checklist of mutable fields that should get append-only event logs.

## Already Covered

- [x] `inventory_event` — inventory item scans, check-in/out (append-only, triggers)
- [x] `device_event` — scanner/device events (append-only, triggers)
- [x] `attestation` — case attestations with void-only update (append-only, triggers)
- [x] `case_card_edit_log` — case card version changes (append-only, triggers)
- [x] `case_checklist_response` / `case_checklist_signature` — checklist completion/attestation
- [x] `case_event_log` — dashboard-level case events (append-only, triggers)
- [x] `surgical_case_status_event` — status transitions (append-only, triggers) **NEW**

## Next Candidates

- [ ] `surgical_case.assigned_*` changes — surgeon reassignment, room reassignment
  - Table: `surgical_case_assignment_event`
  - Fields: case_id, field_name, old_value, new_value, actor, timestamp

- [ ] `inventory_item.location` / `inventory_item.status` changes
  - Table: `inventory_item_event` (or extend `inventory_event`)
  - Track location transfers, status changes, reservations

- [ ] Loaner set check-in/out transitions
  - Table: `loaner_set_event`
  - Track: received, inspected, returned, lost

- [ ] User role/permission changes
  - Table: `user_role_event`
  - Track: role grants, revocations, capability changes

- [ ] Facility settings changes
  - Table: `facility_settings_event`
  - Track: config item create/update/deactivate, room changes

## Principles

1. Mutable tables are projections; event tables are the source of truth.
2. Every event includes: actor (user id), timestamp, and context/reason.
3. Append-only tables use `prevent_modification()` triggers to block UPDATE/DELETE.
4. When deleting parent records, orphan event rows (set FK to NULL) rather than deleting them.
