# Comprehensive Workflow Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## A. Case Lifecycle

### Overview
```
CREATE → REQUEST → APPROVE/SCHEDULE → DASHBOARD → VERIFY → TIMEOUT → DEBRIEF → COMPLETE
```

### Step 1: Create Case Request
**Route:** `/cases`
**Component:** `apps/web/src/app/cases/page.tsx`
**Roles:** All authenticated users

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Create case request | `POST /api/cases` | INSERT `surgical_case` (status=REQUESTED) |
| List user's requests | `GET /api/cases?status=REQUESTED` | SELECT `surgical_case` |

**Data Written:**
- `surgical_case.status` = 'REQUESTED'
- `surgical_case.requested_date`, `requested_time`
- `surgical_case.surgeon_id`, `procedure_name`, `notes`
- `surgical_case.preference_card_version_id` (optional)

**Gating:** None (any authenticated user)

---

### Step 2: Approve & Schedule (Admin/Scheduler)
**Route:** `/admin/cases` or `/cases`
**Component:** `apps/web/src/app/admin/cases/page.tsx`, `apps/web/src/app/cases/page.tsx`
**Roles:** ADMIN, SCHEDULER

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Approve request | `POST /api/cases/:id/approve` | UPDATE `surgical_case` (status→SCHEDULED) |
| Reject request | `POST /api/cases/:id/reject` | UPDATE `surgical_case` (status→REJECTED) |
| Assign room | `PATCH /api/cases/:id/assign-room` | UPDATE `surgical_case.room_id`, `sort_order` |

**Data Written:**
- `surgical_case.status` = 'SCHEDULED'
- `surgical_case.scheduled_date`, `scheduled_time`
- `surgical_case.room_id`, `estimated_duration_minutes`
- OR `surgical_case.status` = 'REJECTED', `rejected_at`, `rejection_reason`

**Gating:** `requireScheduler` (ADMIN or SCHEDULER role)

---

### Step 3: Activate Case
**Route:** `/admin/cases`
**Component:** `apps/web/src/app/admin/cases/page.tsx`
**Roles:** ADMIN only

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Activate case | `POST /api/cases/:id/activate` | UPDATE `surgical_case` (is_active=true) |
| Deactivate case | `POST /api/cases/:id/deactivate` | UPDATE `surgical_case` (is_active=false) |

**Data Written:**
- `surgical_case.is_active` = true
- `surgical_case.activated_at`, `activated_by_user_id`
- `surgical_case.scheduled_date`, `scheduled_time`

**Gating:** `requireAdmin` (ADMIN role only)

---

### Step 4: Case Dashboard
**Routes:** `/case/[caseId]`, `/calendar` (modal)
**Component:** `apps/web/src/components/CaseDashboardModal/CaseDashboardContent.tsx`
**Roles:** All authenticated (view), ADMIN/SCHEDULER (edit scheduling)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Load dashboard | `GET /api/case-dashboard/:id` | SELECT `surgical_case` + joins |
| Update summary | `PUT /api/case-dashboard/:id/case-summary` | UPDATE `surgical_case` fields |
| Update scheduling | `PUT /api/case-dashboard/:id/scheduling` | UPDATE `surgical_case` date/time/room |
| Update anesthesia | `PUT /api/case-dashboard/:id/anesthesia` | UPDATE `surgical_case.anesthesia_modalities` |
| Link case card | `PUT /api/case-dashboard/:id/link-case-card` | UPDATE `surgical_case.preference_card_version_id` |
| Add override | `POST /api/case-dashboard/:id/overrides` | INSERT `case_override` |
| Attest readiness | `POST /api/case-dashboard/:id/attest` | INSERT `attestation` |
| Void attestation | `POST /api/case-dashboard/:id/void` | UPDATE `attestation` (voided) |
| View event log | `GET /api/case-dashboard/:id/event-log` | SELECT events |

**Data Read:**
- `surgical_case`, `case_readiness_cache`, `attestation`
- `case_card`, `case_card_version` (linked)
- `case_checklist_instance` (timeout/debrief status)

**Data Written:**
- `surgical_case.*` (summary, scheduling, anesthesia, flags)
- `attestation` (create/void)
- `case_override` (add/update/remove)

**Gating:**
- View: All authenticated
- Edit scheduling: ADMIN or SCHEDULER
- Attestation: All authenticated

---

### Step 5: Readiness Verification (Scanning)
**Route:** `/case/[caseId]/verify`
**Component:** `apps/web/src/app/case/[caseId]/verify/page.tsx`
**Roles:** All authenticated (VERIFY_SCAN capability)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Load verification | `GET /api/readiness/cases/:id/verification` | SELECT requirements + inventory |
| Scan item | `POST /api/inventory/device-events` | INSERT `device_event` |
| Verify item | `POST /api/inventory/events` | INSERT `inventory_event`, UPDATE `inventory_item` |

**Data Written:**
- `device_event` (raw scan)
- `inventory_event` (VERIFIED type)
- `inventory_item.last_verified_at`, `last_verified_by_user_id`
- `case_readiness_cache` (recomputed)

**Gating:** `VERIFY_SCAN` capability (SCRUB role)

---

### Step 6: OR Time Out
**Route:** `/or/timeout/[caseId]`
**Component:** `apps/web/src/app/or/timeout/[caseId]/page.tsx`
**Roles:** All authenticated (OR_TIMEOUT capability)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Start checklist | `POST /api/cases/:id/checklists/start` | INSERT `case_checklist_instance` (TIMEOUT) |
| Record response | `POST /api/cases/:id/checklists/TIMEOUT/respond` | INSERT `case_checklist_response` |
| Sign checklist | `POST /api/cases/:id/checklists/TIMEOUT/sign` | INSERT `case_checklist_signature` |
| Complete checklist | `POST /api/cases/:id/checklists/TIMEOUT/complete` | UPDATE `case_checklist_instance` (status=COMPLETED) |

**Data Written:**
- `case_checklist_instance` (type=TIMEOUT)
- `case_checklist_response` (per item)
- `case_checklist_signature` (per required role)

**Gating:**
- Feature flag: `enableTimeoutDebrief` must be true
- Capability: `OR_TIMEOUT` (CIRCULATOR role)
- Gate: Case cannot start (`IN_PROGRESS`) until timeout completed

---

### Step 7: Case Start (IN_PROGRESS)
**Route:** `/case/[caseId]` (Case Dashboard)
**Component:** CaseDashboardContent
**Roles:** ADMIN, SCHEDULER

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Start case | `PATCH /api/cases/:id` (status=IN_PROGRESS) | UPDATE `surgical_case.status` |

**Gate Check (Backend):**
```typescript
if (data.status === 'IN_PROGRESS') {
  const canStart = await canStartCase(id, facilityId);
  if (!canStart) {
    return reply.status(400).send({ error: 'TIMEOUT_REQUIRED' });
  }
}
```

---

### Step 8: OR Post-Op Debrief
**Route:** `/or/debrief/[caseId]`
**Component:** `apps/web/src/app/or/debrief/[caseId]/page.tsx`
**Roles:** All authenticated (OR_DEBRIEF capability)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Start checklist | `POST /api/cases/:id/checklists/start` | INSERT `case_checklist_instance` (DEBRIEF) |
| Record response | `POST /api/cases/:id/checklists/DEBRIEF/respond` | INSERT `case_checklist_response` |
| Sign checklist | `POST /api/cases/:id/checklists/DEBRIEF/sign` | INSERT `case_checklist_signature` |
| Flag for review | (in sign) | `case_checklist_signature.flagged_for_review=true` |
| Complete checklist | `POST /api/cases/:id/checklists/DEBRIEF/complete` | UPDATE `case_checklist_instance` |
| Request async review | `POST /api/cases/:id/checklists/debrief/async-review` | (pending review queue) |

**Data Written:**
- `case_checklist_instance` (type=DEBRIEF)
- `case_checklist_response` (per item)
- `case_checklist_signature` (with optional flag)

**Gating:**
- Feature flag: `enableTimeoutDebrief` must be true
- Capability: `OR_DEBRIEF` (CIRCULATOR role)
- Gate: Case cannot complete until debrief completed

---

### Step 9: Case Completion
**Route:** `/case/[caseId]` (Case Dashboard)
**Roles:** ADMIN, SCHEDULER

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Complete case | `PATCH /api/cases/:id` (status=COMPLETED) | UPDATE `surgical_case.status` |

**Gate Check (Backend):**
```typescript
if (data.status === 'COMPLETED') {
  const canComplete = await canCompleteCase(id, facilityId);
  if (!canComplete) {
    return reply.status(400).send({ error: 'DEBRIEF_REQUIRED' });
  }
}
```

---

### Step 10: Cancel Case
**Route:** `/admin/cases`, `/case/[caseId]`
**Roles:** All authenticated (own case), ADMIN/SCHEDULER (any case)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Cancel case | `POST /api/cases/:id/cancel` | UPDATE `surgical_case` (is_cancelled=true) |

**Data Written:**
- `surgical_case.is_cancelled` = true
- `surgical_case.cancelled_at`, `cancelled_by_user_id`

---

## B. Inventory Lifecycle

### Overview
```
CATALOG → CHECK-IN → LOCATION → VERIFY → RESERVE → CONSUME/RETURN
```

### Step 1: Catalog Management
**Route:** `/admin/catalog`
**Component:** `apps/web/src/app/admin/catalog/page.tsx`
**Roles:** ADMIN only

| Action | API Call | DB Operation |
|--------|----------|--------------|
| List catalog | `GET /api/catalog` | SELECT `item_catalog` |
| Create item | `POST /api/catalog` | INSERT `item_catalog` |
| Update item | `PATCH /api/catalog/:id` | UPDATE `item_catalog` |
| Activate | `POST /api/catalog/:id/activate` | UPDATE `item_catalog.active=true` |
| Deactivate | `POST /api/catalog/:id/deactivate` | UPDATE `item_catalog.active=false` |

**Data Written:**
- `item_catalog.name`, `category`, `manufacturer`, `catalog_number`
- `item_catalog.requires_sterility`, `is_loaner`, `active`

**Gating:** `requireAdmin`, `CATALOG_MANAGE` capability

---

### Step 2: Inventory Check-In
**Route:** `/admin/inventory/check-in`
**Component:** `apps/web/src/app/admin/inventory/check-in/page.tsx`
**Roles:** ADMIN, INVENTORY_TECH

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Create item | `POST /api/inventory/items` | INSERT `inventory_item` |
| Record event | `POST /api/inventory/events` | INSERT `inventory_event` (RECEIVED) |

**Data Written:**
- `inventory_item.*` (new physical item)
- `inventory_event` (type=RECEIVED)
- `inventory_item.sterility_status`, `location_id`

**Gating:** `requireInventoryTech` (ADMIN or INVENTORY_TECH)

---

### Step 3: Location Assignment
**Route:** `/admin/inventory`
**Component:** `apps/web/src/app/admin/inventory/page.tsx`
**Roles:** ADMIN

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Update location | `PATCH /api/inventory/items/:id` | UPDATE `inventory_item.location_id` |
| Record move | `POST /api/inventory/events` | INSERT `inventory_event` (LOCATION_CHANGED) |

**Data Written:**
- `inventory_item.location_id`
- `inventory_event` (type=LOCATION_CHANGED, previous_location_id)

---

### Step 4: Verification (Scanning)
**Route:** `/case/[caseId]/verify`
**Roles:** SCRUB (VERIFY_SCAN capability)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Scan barcode | `POST /api/inventory/device-events` | INSERT `device_event` |
| Verify item | `POST /api/inventory/events` | INSERT `inventory_event` (VERIFIED) |

**Data Written:**
- `device_event.raw_value`, `processed_item_id`
- `inventory_event` (type=VERIFIED)
- `inventory_item.last_verified_at`, `last_verified_by_user_id`

---

### Step 5: Reservation
**Route:** (Automatic when case activates or manual)
**Roles:** System/ADMIN

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Reserve for case | `POST /api/inventory/events` | INSERT `inventory_event` (RESERVED) |

**Data Written:**
- `inventory_event` (type=RESERVED, case_id)
- `inventory_item.availability_status` = 'RESERVED'
- `inventory_item.reserved_for_case_id`

---

### Step 6: Consumption/Return
**Route:** Case completion flow
**Roles:** System/ADMIN

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Consume item | `POST /api/inventory/events` | INSERT `inventory_event` (CONSUMED) |
| Return loaner | `POST /api/inventory/events` | INSERT `inventory_event` (RETURNED) |
| Release | `POST /api/inventory/events` | INSERT `inventory_event` (RELEASED) |

**Data Written:**
- `inventory_event` (type=CONSUMED/RETURNED/RELEASED)
- `inventory_item.availability_status` = 'UNAVAILABLE' (consumed) or 'AVAILABLE' (released)

---

### Event Types Summary
| Event Type | Trigger | Item State Change |
|------------|---------|-------------------|
| RECEIVED | Check-in | sterility_status, availability=AVAILABLE |
| VERIFIED | Scan verification | last_verified_at, last_verified_by |
| LOCATION_CHANGED | Move item | location_id |
| RESERVED | Case activation | availability=RESERVED, reserved_for_case_id |
| RELEASED | Case cancel/change | availability=AVAILABLE, reserved_for_case_id=null |
| CONSUMED | Case completion | availability=UNAVAILABLE |
| EXPIRED | Sterility expiry | sterility_status=EXPIRED |
| RETURNED | Loaner return | availability=AVAILABLE |

---

## C. Case Cards (SPC) Lifecycle

### Overview
```
CREATE → EDIT/VERSION → ACTIVATE → LINK TO CASE → PRINT → FEEDBACK → DEPRECATE
```

### Step 1: Create Case Card
**Route:** `/preference-cards`
**Component:** `apps/web/src/app/preference-cards/page.tsx`, `PreferenceCardDialog`
**Roles:** ADMIN, INVENTORY_TECH, CIRCULATOR, SCRUB, SURGEON (not SCHEDULER)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Create card | `POST /api/case-cards` | INSERT `case_card`, `case_card_version`, `case_card_edit_log` |

**Data Written:**
- `case_card.surgeon_id`, `procedure_name`, `case_type`, `status=DRAFT`
- `case_card_version` (v1.0.0) with all sections
- `case_card_edit_log` (action=CREATED)

**Gating:**
- Role check: SCHEDULER excluded
- Constraint: One active card per surgeon+procedure+facility

---

### Step 2: Edit / New Version
**Route:** `/preference-cards`
**Component:** `PreferenceCardDialog`
**Roles:** Same as create (with lock check)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Acquire lock | `POST /api/case-cards/:id/lock` | UPDATE `case_card.locked_by_user_id` |
| Save changes | `PUT /api/case-cards/:id` | INSERT `case_card_version`, UPDATE `case_card`, INSERT `case_card_edit_log` |
| Release lock | `POST /api/case-cards/:id/unlock` | UPDATE `case_card.locked_by_user_id=null` |

**Data Written:**
- `case_card.version_major/minor/patch` (incremented)
- `case_card.current_version_id` (new version)
- `case_card_version` (immutable snapshot)
- `case_card_edit_log` (action=UPDATED, changes_summary)

**Gating:**
- Soft-lock: 30-minute timeout
- Lock check: Cannot edit if locked by another user
- Status check: Cannot edit DEPRECATED or DELETED cards

---

### Step 3: Activate Card
**Route:** `/preference-cards`
**Component:** `PreferenceCardDialog`
**Roles:** Same as create

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Activate | `POST /api/case-cards/:id/activate` | UPDATE `case_card.status=ACTIVE` |

**Data Written:**
- `case_card.status` = 'ACTIVE'
- `case_card_edit_log` (action=ACTIVATED)

**Gating:**
- Current status must be DRAFT
- Only one ACTIVE card per surgeon+procedure

---

### Step 4: Link to Case
**Route:** `/case/[caseId]` (Case Dashboard)
**Component:** `CaseDashboardContent`
**Roles:** All authenticated

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Link card | `PUT /api/case-dashboard/:id/link-case-card` | UPDATE `surgical_case.preference_card_version_id` |
| Copy requirements | (automatic) | INSERT `case_requirement` from version items |

**Data Written:**
- `surgical_case.preference_card_version_id`
- `case_requirement.*` (copied from version)

---

### Step 5: Print
**Route:** `/preference-cards`
**Component:** `PreferenceCardDialog`, `CaseDashboardPrintView`
**Roles:** All authenticated

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Get card details | `GET /api/case-cards/:id` | SELECT `case_card` + version |
| Print | (client-side) | None |

**Data Read:**
- `case_card`, `case_card_version` (current)
- All JSONB sections (header, instrumentation, equipment, etc.)

**Gating:** None (read-only)

---

### Step 6: Feedback / Review
**Route:** `/preference-cards`, `/or/debrief/[caseId]`
**Component:** Various
**Roles:** All authenticated (submit), ADMIN (review)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Submit feedback | `POST /api/case-cards/:id/feedback` | INSERT `case_card_feedback` (status=PENDING) |
| Review feedback | `POST /api/case-cards/:id/feedback/:feedbackId/review` | UPDATE `case_card_feedback` (reviewed) |
| List feedback | `GET /api/case-cards/:id/feedback` | SELECT `case_card_feedback` |

**Data Written:**
- `case_card_feedback.feedback_text`, `source_case_id`, `status`
- `case_card_feedback.reviewed_at`, `reviewed_by_user_id`, `resolution_notes`

**Gating:**
- Submit: All authenticated
- Review: ADMIN only

---

### Step 7: Deprecate / Delete
**Route:** `/preference-cards`
**Component:** `PreferenceCardDialog`
**Roles:** ADMIN (deprecate), SURGEON owner (delete)

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Deprecate | `POST /api/case-cards/:id/deprecate` | UPDATE `case_card.status=DEPRECATED` |
| Soft-delete | `DELETE /api/case-cards/:id` | UPDATE `case_card.status=DELETED`, set delete fields |

**Data Written:**
- `case_card.status` = 'DEPRECATED' or 'DELETED'
- `case_card.deleted_at`, `deleted_by_user_id`, `delete_reason`
- `case_card_edit_log` (action=DEPRECATED or DELETED)

**Gating:**
- Deprecate: ADMIN or owner SURGEON
- Delete: Owner SURGEON only

---

### Version History
**Route:** `/preference-cards`

| Action | API Call | DB Operation |
|--------|----------|--------------|
| Get versions | `GET /api/case-cards/:id/versions` | SELECT `case_card_version` |
| Get edit log | `GET /api/case-cards/:id/edit-log` | SELECT `case_card_edit_log` |

---

### Status Transitions
```
DRAFT → ACTIVE (activate)
ACTIVE → DEPRECATED (deprecate)
ANY → DELETED (soft-delete by owner surgeon)
```

### Governance Rules
1. **SCHEDULER excluded** from case card access
2. **One ACTIVE per surgeon+procedure** constraint
3. **Soft-lock** prevents concurrent edits (30-min timeout)
4. **Edit log** is append-only
5. **Versions** are immutable snapshots
6. **DELETED** cards remain visible with `includeDeleted=true`

---

## Summary

### API Endpoints by Workflow

| Workflow | Key Endpoints |
|----------|---------------|
| Case Request | `POST /api/cases`, `GET /api/cases` |
| Case Approval | `POST /api/cases/:id/approve`, `POST /api/cases/:id/reject` |
| Case Dashboard | `GET/PUT /api/case-dashboard/:id/*` |
| Checklists | `POST /api/cases/:id/checklists/*` |
| Inventory | `POST /api/inventory/items`, `POST /api/inventory/events` |
| Case Cards | `GET/POST/PUT /api/case-cards/*` |

### Feature Flag Gates
| Gate | Flag | Effect |
|------|------|--------|
| Case Start | `enableTimeoutDebrief` | Requires TIMEOUT checklist completed |
| Case Complete | `enableTimeoutDebrief` | Requires DEBRIEF checklist completed |

### Role Restrictions Summary
| Action | Allowed Roles |
|--------|---------------|
| Create case request | All authenticated |
| Approve/Reject case | ADMIN, SCHEDULER |
| Activate case | ADMIN |
| Edit scheduling | ADMIN, SCHEDULER |
| Verify/Scan | SCRUB (VERIFY_SCAN) |
| OR Timeout | CIRCULATOR (OR_TIMEOUT) |
| OR Debrief | CIRCULATOR (OR_DEBRIEF) |
| Manage inventory | ADMIN, INVENTORY_TECH |
| Edit case cards | All except SCHEDULER |
| Review feedback | ADMIN |
