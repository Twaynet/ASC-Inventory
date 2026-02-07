-- Migration 047: Configuration Registry
-- Implements LAW §5 (Configuration Governance) and §11 (Audit and Evidence)
--
-- LAW §5.1: Operational system variables must be database-governed configuration
-- LAW §5.2: Configuration is defined in a typed registry with validation rules
-- LAW §5.3: Configuration scopes include at minimum PLATFORM and FACILITY
-- LAW §5.4: Effective configuration resolved: Facility override → Platform default → Code fallback
-- LAW §5.6: All configuration changes are versioned and audited
-- LAW §6.1: Every configuration change produces an immutable version
-- LAW §11.1: All Control Plane mutations emit immutable audit events

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Configuration scope (LAW §5.3)
CREATE TYPE config_scope AS ENUM ('PLATFORM', 'FACILITY');

-- Configuration value type for typed registry (LAW §5.2)
CREATE TYPE config_value_type AS ENUM ('STRING', 'BOOLEAN', 'NUMBER', 'JSON');

-- Risk classification for configuration keys (LAW §4.3, §6.4)
CREATE TYPE config_risk_class AS ENUM (
  'LOW',      -- No additional controls required
  'MEDIUM',   -- Requires reason/note
  'HIGH',     -- Requires reason/note + may require scheduling
  'CRITICAL'  -- Requires reason/note + scheduling + approval (future)
);

-- ============================================================================
-- PLATFORM SETTING REGISTRY (LAW §5.2)
-- Defines all configuration keys with their metadata and validation
-- ============================================================================

CREATE TABLE platform_config_key (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Key identity
  key VARCHAR(100) NOT NULL UNIQUE,

  -- Type and validation (LAW §5.2)
  value_type config_value_type NOT NULL DEFAULT 'STRING',
  validation_schema JSONB,  -- Optional JSON Schema for value validation

  -- Defaults and scope
  default_value TEXT,  -- Code fallback value (LAW §5.5)

  -- Override control (LAW §5.3)
  allow_facility_override BOOLEAN NOT NULL DEFAULT true,

  -- Risk classification (LAW §4.3)
  risk_class config_risk_class NOT NULL DEFAULT 'LOW',

  -- Display metadata
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',

  -- Sensitivity (for masking in UI)
  is_sensitive BOOLEAN NOT NULL DEFAULT false,

  -- Soft delete
  deprecated_at TIMESTAMPTZ,
  deprecated_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_config_key_category ON platform_config_key(category);
CREATE INDEX idx_platform_config_key_risk ON platform_config_key(risk_class);

-- Updated_at trigger
CREATE TRIGGER platform_config_key_updated_at
  BEFORE UPDATE ON platform_config_key
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE platform_config_key IS 'LAW §5.2: Typed configuration registry with validation rules';
COMMENT ON COLUMN platform_config_key.risk_class IS 'LAW §4.3: High-risk actions require additional controls';
COMMENT ON COLUMN platform_config_key.allow_facility_override IS 'LAW §5.3: Controls whether facilities can override';

-- ============================================================================
-- PLATFORM CONFIG VALUE (versioned, LAW §6.1)
-- Stores the platform-level default value with full version history
-- ============================================================================

CREATE TABLE platform_config_value (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to key definition
  config_key_id UUID NOT NULL REFERENCES platform_config_key(id),

  -- Version tracking (LAW §6.1)
  version INT NOT NULL DEFAULT 1,

  -- The actual value
  value TEXT,  -- Encrypted for sensitive keys

  -- Change metadata (LAW §11.1)
  changed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  change_reason TEXT,  -- Required for MEDIUM+ risk
  change_note TEXT,

  -- Scheduling (LAW §7.3)
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Timestamps (created_at is immutable for audit)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(config_key_id, version)
);

CREATE INDEX idx_platform_config_value_key ON platform_config_value(config_key_id);
CREATE INDEX idx_platform_config_value_effective ON platform_config_value(config_key_id, effective_at DESC);

-- Prevent modification (append-only for audit, LAW §6.1)
CREATE OR REPLACE FUNCTION prevent_config_value_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Configuration values are immutable. Create a new version instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_config_value_no_update
  BEFORE UPDATE ON platform_config_value
  FOR EACH ROW EXECUTE FUNCTION prevent_config_value_modification();

CREATE TRIGGER platform_config_value_no_delete
  BEFORE DELETE ON platform_config_value
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE platform_config_value IS 'LAW §6.1: Immutable version history of platform config values';

-- ============================================================================
-- FACILITY CONFIG OVERRIDE (versioned, LAW §5.3)
-- Stores facility-level overrides with full version history
-- ============================================================================

CREATE TABLE facility_config_override (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Scope
  facility_id UUID NOT NULL REFERENCES facility(id),
  config_key_id UUID NOT NULL REFERENCES platform_config_key(id),

  -- Version tracking (LAW §6.1)
  version INT NOT NULL DEFAULT 1,

  -- The override value (NULL means "use platform default")
  override_value TEXT,

  -- Change metadata (LAW §11.1)
  changed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  change_reason TEXT,
  change_note TEXT,

  -- Scheduling (LAW §7.3)
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete (to revert to platform default)
  cleared_at TIMESTAMPTZ,
  cleared_by_user_id UUID REFERENCES app_user(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(facility_id, config_key_id, version)
);

CREATE INDEX idx_facility_config_override_facility ON facility_config_override(facility_id);
CREATE INDEX idx_facility_config_override_key ON facility_config_override(config_key_id);
CREATE INDEX idx_facility_config_override_effective ON facility_config_override(facility_id, config_key_id, effective_at DESC);

-- Prevent modification (append-only)
CREATE TRIGGER facility_config_override_no_update
  BEFORE UPDATE ON facility_config_override
  FOR EACH ROW EXECUTE FUNCTION prevent_config_value_modification();

CREATE TRIGGER facility_config_override_no_delete
  BEFORE DELETE ON facility_config_override
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE facility_config_override IS 'LAW §5.3: Facility-level overrides of platform configuration';

-- ============================================================================
-- CONFIG AUDIT LOG (append-only, LAW §11.1)
-- Immutable audit trail for all configuration changes
-- ============================================================================

CREATE TABLE config_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What changed
  config_key VARCHAR(100) NOT NULL,
  scope config_scope NOT NULL,
  facility_id UUID REFERENCES facility(id),  -- NULL for PLATFORM scope

  -- Change details
  action VARCHAR(20) NOT NULL,  -- 'SET', 'CLEAR', 'DEPRECATE'
  old_value TEXT,  -- Previous value (masked for sensitive)
  new_value TEXT,  -- New value (masked for sensitive)
  version_before INT,
  version_after INT,

  -- Change metadata
  change_reason TEXT,
  change_note TEXT,

  -- Actor (LAW §11.1)
  actor_user_id UUID NOT NULL REFERENCES app_user(id),
  actor_name VARCHAR(255) NOT NULL,
  actor_roles TEXT[] NOT NULL,

  -- Request correlation (LAW §11.2)
  request_id VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_config_audit_log_key ON config_audit_log(config_key);
CREATE INDEX idx_config_audit_log_facility ON config_audit_log(facility_id) WHERE facility_id IS NOT NULL;
CREATE INDEX idx_config_audit_log_actor ON config_audit_log(actor_user_id);
CREATE INDEX idx_config_audit_log_created ON config_audit_log(created_at DESC);

-- Protect from modification (append-only, LAW §11.1)
CREATE TRIGGER config_audit_log_no_update
  BEFORE UPDATE ON config_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER config_audit_log_no_delete
  BEFORE DELETE ON config_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE config_audit_log IS 'LAW §11.1: Immutable audit log for all configuration changes';
COMMENT ON COLUMN config_audit_log.request_id IS 'LAW §11.2: Correlation ID for incident reconstruction';

-- ============================================================================
-- HELPER VIEW: Effective Configuration (LAW §5.4)
-- Resolves: Facility override → Platform default → Code fallback
-- ============================================================================

CREATE VIEW v_effective_config AS
SELECT
  k.key,
  k.value_type,
  k.display_name,
  k.category,
  k.risk_class,
  k.is_sensitive,
  k.allow_facility_override,
  k.default_value AS code_fallback,
  pv.value AS platform_value,
  pv.version AS platform_version,
  pv.effective_at AS platform_effective_at,
  f.id AS facility_id,
  f.name AS facility_name,
  fo.override_value AS facility_value,
  fo.version AS facility_version,
  fo.effective_at AS facility_effective_at,
  fo.cleared_at AS facility_cleared_at,
  -- Effective value resolution (LAW §5.4)
  COALESCE(
    CASE WHEN fo.cleared_at IS NULL THEN fo.override_value END,
    pv.value,
    k.default_value
  ) AS effective_value,
  -- Source of effective value
  CASE
    WHEN fo.override_value IS NOT NULL AND fo.cleared_at IS NULL THEN 'FACILITY'
    WHEN pv.value IS NOT NULL THEN 'PLATFORM'
    ELSE 'CODE_FALLBACK'
  END AS effective_source
FROM platform_config_key k
CROSS JOIN facility f
LEFT JOIN LATERAL (
  SELECT value, version, effective_at
  FROM platform_config_value
  WHERE config_key_id = k.id
    AND effective_at <= NOW()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1
) pv ON true
LEFT JOIN LATERAL (
  SELECT override_value, version, effective_at, cleared_at
  FROM facility_config_override
  WHERE config_key_id = k.id
    AND facility_id = f.id
    AND effective_at <= NOW()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1
) fo ON true
WHERE k.deprecated_at IS NULL;

COMMENT ON VIEW v_effective_config IS 'LAW §5.4: Resolved effective configuration per facility';

-- ============================================================================
-- SEED INITIAL CONFIGURATION KEYS
-- Migrate from environment variables per CONFIG_REGISTRY_MIGRATION.md
-- ============================================================================

INSERT INTO platform_config_key (key, value_type, default_value, display_name, description, category, risk_class, is_sensitive, allow_facility_override)
VALUES
  -- AI Features (from env: AI_EXPLAIN_READINESS_ENABLED)
  ('feature.ai.explain_readiness.enabled', 'BOOLEAN', 'false',
   'AI Readiness Explanation', 'Enable AI-powered case readiness explanations',
   'ai', 'MEDIUM', false, true),

  -- OpenAI API Key (from env: OPENAI_API_KEY) - platform only, sensitive
  ('integration.openai.api_key', 'STRING', NULL,
   'OpenAI API Key', 'API key for OpenAI integration',
   'integrations', 'HIGH', true, false),

  -- Session timeout
  ('security.session.timeout_hours', 'NUMBER', '24',
   'Session Timeout (hours)', 'JWT token expiration time in hours',
   'security', 'MEDIUM', false, false),

  -- Feature flags for future use
  ('feature.loaner_tracking.enabled', 'BOOLEAN', 'true',
   'Loaner Tracking', 'Enable loaner set tracking features',
   'features', 'LOW', false, true),

  ('feature.financial_attribution.enabled', 'BOOLEAN', 'true',
   'Financial Attribution', 'Enable financial attribution tracking',
   'features', 'LOW', false, true),

  -- Kill switches (LAW §7.1)
  ('killswitch.ai.all', 'BOOLEAN', 'false',
   'AI Kill Switch', 'Emergency disable all AI features',
   'killswitches', 'CRITICAL', false, false),

  ('killswitch.external_integrations.all', 'BOOLEAN', 'false',
   'External Integrations Kill Switch', 'Emergency disable all external API calls',
   'killswitches', 'CRITICAL', false, false)
ON CONFLICT (key) DO NOTHING;
