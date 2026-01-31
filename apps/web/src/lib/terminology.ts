/**
 * Canonical terminology for ASC Inventory UI.
 *
 * Single source of truth for user-facing labels.
 * Import from here — do not hardcode display strings.
 */

// ── Status labels (sentence case, consistent everywhere) ────────────

export const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  PENDING: 'Not Started', // legacy alias
};

/** Convert any status value to its display label. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.NOT_STARTED;
  const key = status.toUpperCase().replace(/\s+/g, '_');
  return STATUS_LABELS[key] ?? status;
}

// ── Action verbs (Start / Continue / View) ──────────────────────────

const ACTION_VERB: Record<string, string> = {
  NOT_STARTED: 'Start',
  IN_PROGRESS: 'Continue',
  COMPLETED: 'View',
};

/** "Start Verification", "Continue Timeout", "View Debrief" */
export function actionVerb(status: string | null | undefined, workflow: string): string {
  const key = status ? status.toUpperCase().replace(/\s+/g, '_') : 'NOT_STARTED';
  const verb = ACTION_VERB[key] ?? 'Start';
  return `${verb} ${workflow}`;
}

// ── Capability display names ────────────────────────────────────────

const CAPABILITY_LABELS: Record<string, string> = {
  INVENTORY_CHECKIN: 'Inventory Check-In',
  INVENTORY_MANAGE: 'Inventory Management',
  VERIFY_SCAN: 'Verification Scanning',
  OR_TIMEOUT: 'Timeout',
  OR_DEBRIEF: 'Debrief',
  CASE_APPROVE: 'Case Approval',
  CASE_ASSIGN_ROOM: 'Room Assignment',
  CASE_VIEW: 'Case Viewing',
  USER_MANAGE: 'User Management',
  LOCATION_MANAGE: 'Location Management',
  CATALOG_MANAGE: 'Catalog Management',
  REPORTS_VIEW: 'Reports',
  SETTINGS_MANAGE: 'Settings Management',
};

/** Human-readable name for a capability code. */
export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability.replace(/_/g, ' ').toLowerCase();
}

// ── Canonical terms ─────────────────────────────────────────────────

export const TERMS = {
  PREFERENCE_CARD: 'Preference Card',
  PREFERENCE_CARDS: 'Preference Cards',
  DEBRIEF: 'Debrief',
  TIMEOUT: 'Timeout',
  CHECK_IN: 'Check-In',
  VERIFICATION: 'Verification',
} as const;
