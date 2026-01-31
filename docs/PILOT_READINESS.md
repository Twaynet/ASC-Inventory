# Pilot Readiness Checklist

Last updated: 2026-01-30

---

## A) Required Roles & Capabilities

Each workflow requires specific capabilities. Users inherit capabilities from their role.

| Workflow | Required Capability | Roles That Have It |
|----------|-------------------|--------------------|
| View Cases | CASE_VIEW | All roles |
| Verify Scanning | VERIFY_SCAN | Scrub |
| Inventory Check-In | INVENTORY_CHECKIN | Inventory Tech |
| Inventory Management | INVENTORY_MANAGE | Admin |
| Timeout | OR_TIMEOUT | Circulator |
| Debrief | OR_DEBRIEF | Circulator |
| Approve/Reject Cases | CASE_APPROVE | Admin, Scheduler |
| Assign Rooms | CASE_ASSIGN_ROOM | Admin, Scheduler |
| Activate Cases | CASE_ACTIVATE | Admin, Scheduler |
| Scheduling (create/edit) | CASE_CREATE, CASE_UPDATE | Admin, Scheduler, Surgeon |
| Link Preference Cards | CASE_PREFERENCE_CARD_LINK | Admin, Surgeon |
| Reports | REPORTS_VIEW | Admin |
| Settings | SETTINGS_MANAGE | Admin |

**Minimum pilot team:** Admin + Scheduler + Circulator + Scrub + Inventory Tech + Surgeon.

---

## B) Seed Data Requirements

For a case to be fully usable in pilot, all of the following must exist:

| Requirement | Where to Create | Notes |
|-------------|----------------|-------|
| **Facility** | Database seed / Admin | One per installation |
| **Users** | Admin > Users page | At least one per required role |
| **Surgeon** | Admin > Users (SURGEON role) | Cases reference a surgeon |
| **Rooms** | Admin > Settings > Locations | At least 1 OR room for scheduling |
| **Catalog items** | Admin > Catalog | Items the preference card references |
| **Inventory items** | Admin > Inventory | Physical items checked in/available |
| **Preference card** | Preference Cards page | Links catalog items to a procedure |
| **Scheduled case** | Cases page (+ New Case Request) | Needs date, surgeon, procedure |
| **Room assignment** | Calendar day view (drag-drop) | Assigns case to an OR room |

**Quick smoke test:** Run `npm run db:seed` to create demo data with 18 cases, 3 preference cards, 9 inventory items, and 7 users (password: `password123`).

---

## C) Staff Training Surface

### Pages staff need to learn (by role):

**All roles:**
- Login page
- Dashboard (home)
- Calendar (month/week/day views)
- Case Dashboard modal (click any case on calendar)
- Help page

**Circulator:**
- Timeout page (opened from Case Dashboard)
- Debrief page (opened from Case Dashboard)

**Scrub:**
- Verify Scanning page (opened from Case Dashboard)

**Inventory Tech:**
- Inventory Check-In page (Admin > Inventory > Check-In, or from Case Dashboard)

**Scheduler:**
- Cases page (approve/reject requests)
- Calendar day view (drag-drop room assignment)
- Unassigned Cases page

**Admin:**
- All of the above, plus Settings, Reports, User Management

### Pages staff can ignore:
- Preference Cards (managed by surgeons/admin, not day-of staff)
- Reports (admin only, not needed for pilot operations)
- Settings (admin only, configured before pilot)

---

## D) Rollback / Safety

### Disabling features without breaking others:

| Feature | How to Disable | Impact |
|---------|---------------|--------|
| Timeout/Debrief checklists | Set `CHECKLISTS_ENABLED=false` in facility settings | Workflow cards hide; readiness ignores checklist status |
| Inventory Check-In | Remove INVENTORY_TECH users or revoke capability | Check-In page access denied; readiness still shows based on existing data |
| Verify Scanning | Remove SCRUB users or revoke capability | Verify page access denied |
| Case approval workflow | Have Admin directly schedule cases (skip REQUESTED status) | Cases go straight to SCHEDULED |

### Emergency read-only mode:
1. Revoke all write capabilities from non-Admin roles
2. Only Admin retains full access for troubleshooting
3. All views remain readable; no actions can be taken
4. To restore: re-assign original roles

### Data safety:
- All mutations create event log entries (audit trail)
- Attestations can be voided with reason
- Cases can be deactivated (soft-disable, not deleted)
- No destructive operations exist in the UI (no case deletion for non-Admin)

---

## E) Support Workflow

### How staff report issues:

1. **Note the requestId** — shown in error messages as a small code (e.g., `req_abc123`)
2. **Note what they were doing** — which page, which button, which case
3. **Screenshot if possible** — browser screenshot of the error state
4. Report to facility Admin or designated support contact

### What to check first (for support/admin):

1. **API logs** — filter by requestId:
   ```bash
   # In production logs:
   grep "req_abc123" /var/log/api/*.log
   ```

2. **Common issues:**
   - "Access denied" → User role doesn't have required capability. Check Admin > Users.
   - "Case Card not linked" → Preference Card needs to be linked on Case Dashboard.
   - Readiness stuck on "Unknown" → Case may not have readiness data computed. Check if preference card is linked and inventory items exist.
   - "Case must be active" → Case needs to be activated by Admin/Scheduler before workflows can start.

3. **Database checks:**
   ```bash
   npm run db:check  # Runs schema validation
   ```

4. **Application health:**
   - API: `GET /health` endpoint returns 200 if running
   - Web: Page loads without errors in browser console

### Structured logging fields:
All API requests log: `requestId`, `userId`, `facilityId`, `method`, `path`, `statusCode`, `duration`.
Login attempts log: `code: LOGIN_SUCCESS` or `code: LOGIN_FAILED` with reason.

---

## Pre-Pilot Verification Checklist

Before going live, verify each item:

- [ ] All required users created with correct roles
- [ ] At least 1 surgeon with an active preference card
- [ ] Catalog items exist for preference card requirements
- [ ] Inventory items checked in and available
- [ ] At least 1 case scheduled for pilot day
- [ ] Case assigned to a room on the calendar
- [ ] Timeout/Debrief templates configured (if using checklists)
- [ ] Admin can log in and access all pages
- [ ] Each role can log in and sees only their permitted features
- [ ] Full workflow test: Schedule → Verify → Check-In → Activate → Timeout → Debrief → Complete
