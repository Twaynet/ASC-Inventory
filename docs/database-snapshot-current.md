# Comprehensive Database Snapshot - ASC Inventory System

**Last Updated:** 2026-01-24
**Version:** v1.5.0+
**Analysis Mode:** Factual observation only (no recommendations)

---

## 1. Database Technology & Configuration

### Technology Stack
- **Database:** PostgreSQL 16 (Alpine)
- **Driver:** `pg` (node-postgres)
- **ORM:** None - raw SQL queries
- **Validation:** Zod schemas (application layer)

### Configuration
**File:** `apps/api/src/db/index.ts`

```typescript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'asc_inventory',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,                      // Max pool connections
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Connection timeout 2s
});
```

### Connection Functions
- `query<T>()` - Execute parameterized queries
- `getClient()` - Get pooled client
- `transaction<T>(fn)` - Execute in transaction with auto-rollback

---

## 2. Schema Definitions (Tables)

### Core Tables

#### `facility`
Multi-tenant root table.
```sql
CREATE TABLE facility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  facility_key VARCHAR(20) UNIQUE NOT NULL,  -- Added in 010
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `app_user`
Facility-scoped users.
```sql
CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  username VARCHAR(100) NOT NULL,             -- Added in 007
  email VARCHAR(255),                         -- Made nullable in 007
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL,                    -- Primary role
  roles user_role[] DEFAULT '{}',             -- Added in 021 (multi-role)
  password_hash VARCHAR(255) NOT NULL,
  display_color VARCHAR(20),                  -- Added in 025 (surgeon color)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, username)
);
```

#### `surgical_case`
Scheduled surgical cases.
```sql
CREATE TABLE surgical_case (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  case_number VARCHAR(50),                    -- Added in 020
  scheduled_date DATE,                        -- Made nullable in 009
  scheduled_time TIME,
  requested_date DATE,                        -- Added in 018
  requested_time TIME,                        -- Added in 018
  surgeon_id UUID NOT NULL REFERENCES app_user(id),
  procedure_name VARCHAR(255) NOT NULL,
  preference_card_version_id UUID REFERENCES preference_card_version(id),
  status case_status NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  -- Room scheduling (023)
  room_id UUID REFERENCES room(id),
  sort_order INTEGER DEFAULT 0,
  estimated_duration_minutes INT DEFAULT 60,  -- Added in 012
  -- Active/Inactive workflow (008)
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by_user_id UUID,
  -- Cancellation tracking
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID,
  -- Rejection tracking (019)
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id UUID,
  rejection_reason TEXT,
  -- Case-specific fields (016)
  laterality VARCHAR(50),
  anesthesia_modalities TEXT[],              -- Changed from anesthesia_modality in 013
  -- Case summary (029)
  admission_types JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `room`
Operating rooms.
```sql
CREATE TABLE room (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0,               -- Added in 024
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, name)
);
```

#### `location`
Hierarchical storage locations.
```sql
CREATE TABLE location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_location_id UUID REFERENCES location(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `item_catalog`
What items can exist in inventory.
```sql
CREATE TABLE item_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category item_category NOT NULL,
  manufacturer VARCHAR(255),
  catalog_number VARCHAR(255),
  requires_sterility BOOLEAN NOT NULL DEFAULT true,
  is_loaner BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `inventory_item`
Physical inventory items.
```sql
CREATE TABLE inventory_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  serial_number VARCHAR(255),
  lot_number VARCHAR(255),
  barcode VARCHAR(255),
  location_id UUID REFERENCES location(id),
  sterility_status sterility_status NOT NULL DEFAULT 'UNKNOWN',
  sterility_expires_at TIMESTAMPTZ,
  availability_status availability_status NOT NULL DEFAULT 'AVAILABLE',
  reserved_for_case_id UUID REFERENCES surgical_case(id),
  last_verified_at TIMESTAMPTZ,
  last_verified_by_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Preference Card System

#### `preference_card`
Surgeon's preferred items for procedures.
```sql
CREATE TABLE preference_card (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  surgeon_id UUID NOT NULL REFERENCES app_user(id),
  procedure_name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID REFERENCES preference_card_version(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `preference_card_version`
Immutable snapshots of preference card items.
```sql
CREATE TABLE preference_card_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preference_card_id UUID NOT NULL REFERENCES preference_card(id),
  version_number INT NOT NULL,
  items JSONB NOT NULL,  -- Array of {catalogId, quantity, notes}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  UNIQUE(preference_card_id, version_number)
);
```

### Case Card System (SPC)

#### `case_card`
Main case card table.
```sql
CREATE TABLE case_card (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  surgeon_id UUID NOT NULL REFERENCES app_user(id),
  procedure_name VARCHAR(255) NOT NULL,
  procedure_codes TEXT[],
  case_type case_type NOT NULL DEFAULT 'ELECTIVE',
  default_duration_minutes INT,
  turnover_notes TEXT,
  status case_card_status NOT NULL DEFAULT 'DRAFT',
  version_major INT NOT NULL DEFAULT 1,
  version_minor INT NOT NULL DEFAULT 0,
  version_patch INT NOT NULL DEFAULT 0,
  current_version_id UUID REFERENCES case_card_version(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  CONSTRAINT unique_active_card UNIQUE (facility_id, surgeon_id, procedure_name) DEFERRABLE
);
```

#### `case_card_version`
Immutable snapshots of case card data.
```sql
CREATE TABLE case_card_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  version_number VARCHAR(20) NOT NULL,
  header_info JSONB NOT NULL DEFAULT '{}',
  patient_flags JSONB NOT NULL DEFAULT '{}',
  instrumentation JSONB NOT NULL DEFAULT '{}',
  equipment JSONB NOT NULL DEFAULT '{}',
  supplies JSONB NOT NULL DEFAULT '{}',
  medications JSONB NOT NULL DEFAULT '{}',
  setup_positioning JSONB NOT NULL DEFAULT '{}',
  surgeon_notes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  UNIQUE(case_card_id, version_number)
);
```

#### `case_card_edit_log`
Append-only edit history.
```sql
CREATE TABLE case_card_edit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  editor_user_id UUID NOT NULL REFERENCES app_user(id),
  action VARCHAR(50) NOT NULL,
  changes_summary TEXT,
  old_version_number VARCHAR(20),
  new_version_number VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `case_card_feedback`
Feedback and review requests.
```sql
CREATE TABLE case_card_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  submitted_by_user_id UUID NOT NULL REFERENCES app_user(id),
  feedback_text TEXT NOT NULL,
  source_case_id UUID REFERENCES surgical_case(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id UUID REFERENCES app_user(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Checklist System

#### `facility_settings`
Feature flags per facility.
```sql
CREATE TABLE facility_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL UNIQUE REFERENCES facility(id),
  enable_timeout_debrief BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `checklist_template`
Template definitions.
```sql
CREATE TABLE checklist_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  type checklist_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID REFERENCES checklist_template_version(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, type)
);
```

#### `checklist_template_version`
Immutable template versions.
```sql
CREATE TABLE checklist_template_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES checklist_template(id),
  version_number INT NOT NULL,
  items JSONB NOT NULL,              -- Array of {key, label, type, required, options?}
  required_signatures JSONB NOT NULL, -- Array of {role, required}
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version_number)
);
```

#### `case_checklist_instance`
Per-case checklist execution.
```sql
CREATE TABLE case_checklist_instance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),
  type checklist_type NOT NULL,
  template_version_id UUID NOT NULL REFERENCES checklist_template_version(id),
  status checklist_status NOT NULL DEFAULT 'NOT_STARTED',
  room_id UUID REFERENCES room(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Surgeon feedback (028)
  surgeon_notes TEXT,
  surgeon_flagged_for_review BOOLEAN DEFAULT false,
  surgeon_flag_resolved BOOLEAN DEFAULT false,
  surgeon_flag_resolved_at TIMESTAMPTZ,
  surgeon_flag_resolved_by_user_id UUID REFERENCES app_user(id),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, type)
);
```

#### `case_checklist_response`
Append-only checklist responses.
```sql
CREATE TABLE case_checklist_response (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES case_checklist_instance(id),
  item_key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  completed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `case_checklist_signature`
Append-only signatures.
```sql
CREATE TABLE case_checklist_signature (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES case_checklist_instance(id),
  role VARCHAR(50) NOT NULL,
  signed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  signed_at TIMESTAMPTZ NOT NULL,
  method signature_method NOT NULL DEFAULT 'LOGIN',
  flagged_for_review BOOLEAN DEFAULT false,      -- Added in 026
  flag_comment TEXT,                             -- Added in 027
  resolved BOOLEAN DEFAULT false,                -- Added in 026
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Scheduling Tables

#### `block_time`
Blocked time slots in rooms.
```sql
CREATE TABLE block_time (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  room_id UUID NOT NULL REFERENCES room(id),
  block_date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES app_user(id)
);
```

#### `room_day_config`
Per-date room configuration.
```sql
CREATE TABLE room_day_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES room(id),
  config_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '07:30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, config_date)
);
```

### Config Items

#### `facility_config_item`
Configurable items (patient flags, modalities).
```sql
CREATE TABLE facility_config_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  item_type VARCHAR(50) NOT NULL,  -- 'PATIENT_FLAG' or 'ANESTHESIA_MODALITY'
  item_key VARCHAR(100) NOT NULL,
  display_label VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, item_type, item_key)
);
```

### Append-Only Event Tables

#### `inventory_event`
Immutable inventory audit log.
```sql
CREATE TABLE inventory_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_item(id),
  event_type inventory_event_type NOT NULL,
  case_id UUID REFERENCES surgical_case(id),
  location_id UUID REFERENCES location(id),
  previous_location_id UUID REFERENCES location(id),
  sterility_status sterility_status,
  notes TEXT,
  performed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  device_event_id UUID REFERENCES device_event(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Protected by triggers: NO UPDATE, NO DELETE
```

#### `attestation`
Immutable attestation records.
```sql
CREATE TABLE attestation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  type attestation_type NOT NULL,
  attested_by_user_id UUID NOT NULL REFERENCES app_user(id),
  readiness_state_at_time readiness_state NOT NULL,
  notes TEXT,
  voided_at TIMESTAMPTZ,                      -- Added in 002
  voided_by_user_id UUID,                     -- Added in 002
  voided_reason TEXT,                         -- Added in 002
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Protected by triggers: NO UPDATE (except voiding), NO DELETE
```

#### `device_event`
Raw device scan events.
```sql
CREATE TABLE device_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  device_id UUID NOT NULL REFERENCES device(id),
  device_type device_type NOT NULL,
  payload_type device_payload_type NOT NULL,
  raw_value TEXT NOT NULL,
  processed_item_id UUID REFERENCES inventory_item(id),
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Protected by triggers: NO UPDATE, NO DELETE
```

### Cache Tables

#### `case_readiness_cache`
Pre-computed readiness state.
```sql
CREATE TABLE case_readiness_cache (
  case_id UUID PRIMARY KEY REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),
  scheduled_date DATE NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  surgeon_name VARCHAR(255) NOT NULL,
  readiness_state readiness_state NOT NULL,
  missing_items JSONB NOT NULL DEFAULT '[]',
  total_required_items INT NOT NULL DEFAULT 0,
  total_verified_items INT NOT NULL DEFAULT 0,
  has_attestation BOOLEAN NOT NULL DEFAULT false,
  attestation_id UUID,                        -- Added in 003
  attested_at TIMESTAMPTZ,
  attested_by_name VARCHAR(255),
  has_surgeon_acknowledgment BOOLEAN NOT NULL DEFAULT false,
  surgeon_acknowledged_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Enums & Status Fields

### User Role (`user_role`)
**File:** `apps/api/db/migrations/001_initial_schema.sql:14`, updated in `006`
```sql
CREATE TYPE user_role AS ENUM (
  'ADMIN', 'SCHEDULER', 'INVENTORY_TECH', 'CIRCULATOR', 'SURGEON',
  'SCRUB', 'ANESTHESIA'  -- Added in 006
);
```
**UI Behavior:** Determines navigation access, feature visibility, capability derivation

### Case Status (`case_status`)
**File:** `apps/api/db/migrations/001_initial_schema.sql:22`, updated in `018`
```sql
CREATE TYPE case_status AS ENUM (
  'DRAFT', 'REQUESTED', 'SCHEDULED', 'READY', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED', 'REJECTED'  -- REQUESTED, REJECTED added in 018
);
```
**UI Behavior:**
- `REQUESTED` → Shows in case requests queue
- `SCHEDULED` → Shows on calendar
- `REJECTED` → Shows rejection reason

### Readiness State (`readiness_state`)
**File:** `apps/api/db/migrations/001_initial_schema.sql:31`
```sql
CREATE TYPE readiness_state AS ENUM ('GREEN', 'ORANGE', 'RED');
```
**UI Behavior:**
- `GREEN` → Ready indicator
- `ORANGE` → Pending verification
- `RED` → Missing items, requires attestation

### Item Category (`item_category`)
```sql
CREATE TYPE item_category AS ENUM ('IMPLANT', 'INSTRUMENT', 'LOANER', 'HIGH_VALUE_SUPPLY');
```

### Sterility Status (`sterility_status`)
```sql
CREATE TYPE sterility_status AS ENUM ('STERILE', 'NON_STERILE', 'EXPIRED', 'UNKNOWN');
```

### Availability Status (`availability_status`)
```sql
CREATE TYPE availability_status AS ENUM ('AVAILABLE', 'RESERVED', 'IN_USE', 'UNAVAILABLE', 'MISSING');
```

### Inventory Event Type (`inventory_event_type`)
```sql
CREATE TYPE inventory_event_type AS ENUM (
  'RECEIVED', 'VERIFIED', 'LOCATION_CHANGED', 'RESERVED',
  'RELEASED', 'CONSUMED', 'EXPIRED', 'RETURNED', 'ADJUSTED'
);
```

### Attestation Type (`attestation_type`)
```sql
CREATE TYPE attestation_type AS ENUM ('CASE_READINESS', 'SURGEON_ACKNOWLEDGMENT');
```

### Device Type (`device_type`)
```sql
CREATE TYPE device_type AS ENUM ('barcode', 'rfid', 'nfc', 'other');
```

### Device Payload Type (`device_payload_type`)
```sql
CREATE TYPE device_payload_type AS ENUM ('scan', 'presence', 'input');
```

### Checklist Type (`checklist_type`)
**File:** `apps/api/db/migrations/004_timeout_debrief.sql:8`
```sql
CREATE TYPE checklist_type AS ENUM ('TIMEOUT', 'DEBRIEF');
```

### Checklist Status (`checklist_status`)
```sql
CREATE TYPE checklist_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
```
**UI Behavior:** Gates case start/complete when feature enabled

### Signature Method (`signature_method`)
```sql
CREATE TYPE signature_method AS ENUM ('LOGIN', 'PIN', 'BADGE', 'KIOSK_TAP');
```

### Case Card Status (`case_card_status`)
**File:** `apps/api/db/migrations/011_case_cards.sql:12`
```sql
CREATE TYPE case_card_status AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');
```
**UI Behavior:**
- `DRAFT` → Editable, not linkable to cases
- `ACTIVE` → Can be linked to cases
- `DEPRECATED` → Read-only archive

### Case Type (`case_type`)
**File:** `apps/api/db/migrations/011_case_cards.sql:18`
```sql
CREATE TYPE case_type AS ENUM ('ELECTIVE', 'ADD_ON', 'TRAUMA', 'REVISION');
```

---

## 4. Migrations (Ordered List)

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | Core tables: facility, app_user, location, item_catalog, inventory_item, preference_card, surgical_case, case_requirement, inventory_event, attestation, device, device_event, case_readiness_cache |
| 002 | `002_attestation_voiding.sql` | Add voided_at, voided_by_user_id, voided_reason to attestation |
| 003 | `003_cache_attestation_id.sql` | Add attestation_id to case_readiness_cache |
| 004 | `004_timeout_debrief.sql` | Checklist system: facility_settings, room, checklist_template, checklist_template_version, case_checklist_instance, case_checklist_response, case_checklist_signature |
| 005 | `005_debrief_conditional_signatures.sql` | Add conditional visibility for checklist items |
| 006 | `006_add_scrub_anesthesia_roles.sql` | Add SCRUB and ANESTHESIA to user_role enum |
| 007 | `007_username_auth.sql` | Add username column, make email nullable, add unique constraint |
| 008 | `008_case_active_status.sql` | Add is_active, activated_at, activated_by_user_id to surgical_case |
| 009 | `009_nullable_scheduled_date.sql` | Make scheduled_date nullable in surgical_case |
| 010 | `010_facility_key.sql` | Add facility_key to facility table |
| 011 | `011_case_cards.sql` | Case card system: case_card, case_card_version, case_card_edit_log |
| 012 | `012_case_dashboard.sql` | Add estimated_duration_minutes, anesthesia_modality to surgical_case, add case_override table |
| 013 | `013_modality_array_tiva.sql` | Change anesthesia_modality to anesthesia_modalities array |
| 014 | `014_feedback_review.sql` | Add case_card_feedback table |
| 015 | `015_case_card_governance.sql` | Add governance fields to case_card |
| 016 | `016_case_specific_fields.sql` | Add laterality, patient_flags to surgical_case |
| 017 | `017_drop_patient_mrn.sql` | Remove patient_mrn from surgical_case (PHI compliance) |
| 018 | `018_case_request_approval_workflow.sql` | Add REQUESTED, REJECTED to case_status enum |
| 019 | `019_case_request_approval_columns.sql` | Add requested_date/time, rejected_at/by/reason to surgical_case |
| 020 | `020_case_number.sql` | Add case_number to surgical_case |
| 021 | `021_multi_role_support.sql` | Add roles array to app_user |
| 022 | `022_facility_config_items.sql` | Add facility_config_item table |
| 023 | `023_room_scheduling.sql` | Add room_id, sort_order to surgical_case; add block_time, room_day_config tables |
| 024 | `024_room_sort_order.sql` | Add sort_order to room table |
| 025 | `025_surgeon_color.sql` | Add display_color to app_user |
| 026 | `026_checklist_flag_for_review.sql` | Add flagged_for_review, resolved to case_checklist_signature |
| 027 | `027_checklist_flag_comment.sql` | Add flag_comment to case_checklist_signature |
| 028 | `028_surgeon_checklist_feedback.sql` | Add surgeon feedback fields to case_checklist_instance |
| 029 | `029_admission_types.sql` | Add admission_types JSONB to surgical_case |

---

## 5. Seed Data & Fixtures

**File:** `apps/api/db/seed.ts`

### Seed Data Created
| Entity | Count | Details |
|--------|-------|---------|
| Facility | 1 | "Demo Surgery Center" with facility_key |
| Users | 7 | admin, scheduler, tech, circulator, scrub, drsmith (SURGEON), drjones (SURGEON) |
| Locations | 4 | OR Storage A, OR Storage B, Sterile Processing, Loaner Storage |
| Catalog Items | 9 | Hip stems, cups, knee tray, scopes, drill, mesh |
| Inventory Items | 9 | All STERILE, various barcodes |
| Preference Cards | 2 | THA (Dr. Smith), TKA (Dr. Jones) |
| Surgical Cases | 3 | Tomorrow: THA (GREEN), TKA (GREEN), Spine (RED - missing loaner) |

### Default Password
All seed users: `password123` (hashed with bcrypt, 10 rounds)

### Idempotency
Seed script checks for existing facility before running; skips if already seeded.

---

## 6. Observations & Notes

### Duplicated/Related Models

| Model A | Model B | Relationship |
|---------|---------|--------------|
| `preference_card` | `case_card` | Both are "surgeon preference" concepts; preference_card is inventory-focused, case_card is procedure-focused |
| `preference_card_version` | `case_card_version` | Both use versioned snapshots with JSONB items |
| `case_requirement` | `case_override` | Both track per-case item customizations; case_override added later for dashboard |

### JSONB Fields
| Table | Column | Contents |
|-------|--------|----------|
| `preference_card_version` | `items` | Array of {catalogId, quantity, notes} |
| `case_card_version` | `header_info`, `patient_flags`, etc. | Section-specific JSONB |
| `checklist_template_version` | `items` | Array of {key, label, type, required, options?} |
| `checklist_template_version` | `required_signatures` | Array of {role, required} |
| `case_readiness_cache` | `missing_items` | Array of MissingItemReason |
| `facility_config_item` | (none) | Uses columns instead of JSONB |
| `surgical_case` | `admission_types` | JSONB map of {key: boolean} |

### Append-Only Tables (Protected by Triggers)
- `inventory_event` - No UPDATE, No DELETE
- `attestation` - No DELETE (UPDATE allowed for voiding)
- `device_event` - No UPDATE, No DELETE
- `case_checklist_response` - Append-only by design
- `case_checklist_signature` - Append-only by design
- `case_card_edit_log` - Append-only by design

### Multi-Tenant Scoping
All tables include `facility_id` for multi-tenant isolation.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Tables | 28 |
| Enums | 15 |
| Migrations | 29 |
| JSONB Fields | 12 |
| Append-Only Tables | 6 |
| Index Count | 50+ |
