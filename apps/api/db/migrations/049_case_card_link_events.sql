-- Migration: 049_case_card_link_events
-- Purpose: Append-only link event history for case ↔ case-card linkage
-- Stores immutable snapshots so linked card data is frozen at link time.

CREATE TABLE case_card_link_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Case and facility context
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Action: LINKED (first link), UNLINKED, RELINKED (change)
  action VARCHAR(20) NOT NULL CHECK (action IN ('LINKED', 'UNLINKED', 'RELINKED')),

  -- Source card identity (NULL for UNLINKED)
  source_case_card_id UUID REFERENCES case_card(id),
  source_case_card_version_id UUID REFERENCES case_card_version(id),

  -- Render-complete snapshot of the card at link time (NULL for UNLINKED)
  -- Includes: caseCardId, caseCardName, surgeonId, surgeonName, caseCardStatus,
  --   caseType, procedureCodes, defaultDurationMinutes, turnoverNotes,
  --   versionId, versionNumber, headerInfo, patientFlags, instrumentation,
  --   equipment, supplies, medications, setupPositioning, surgeonNotes
  snapshot_json JSONB,

  -- Required reason for all actions
  reason_code VARCHAR(50) NOT NULL,
  reason_note TEXT,

  -- Who performed the action
  performed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  performed_by_name VARCHAR(255) NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_ccle_case ON case_card_link_event(case_id);
CREATE INDEX idx_ccle_case_date ON case_card_link_event(case_id, performed_at DESC, created_at DESC, id DESC);
CREATE INDEX idx_ccle_facility ON case_card_link_event(facility_id);

-- Append-only protection
CREATE TRIGGER case_card_link_event_no_update
  BEFORE UPDATE ON case_card_link_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_card_link_event_no_delete
  BEFORE DELETE ON case_card_link_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE case_card_link_event IS 'Append-only audit trail for case ↔ case-card link/unlink/relink events with immutable snapshots';
