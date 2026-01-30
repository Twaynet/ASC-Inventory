/**
 * Persona System — UX-only session focus.
 *
 * A persona is the active "hat" a multi-role user wears for their session.
 * It NEVER grants or restricts permissions. Authorization is always the
 * UNION of all roles/capabilities.
 *
 * Stored client-side (React state + localStorage). Sent to API as
 * untrusted X-Active-Persona header for audit/logging only.
 */

import { type UserRole, type Capability, ROLE_CAPABILITIES } from './types.js';

// ---------------------------------------------------------------------------
// Persona type — currently 1:1 with UserRole but decoupled for future use
// ---------------------------------------------------------------------------

export type Persona = UserRole;

export const PERSONA_STORAGE_KEY = 'asc_active_persona';
export const PERSONA_HEADER = 'X-Active-Persona';

// ---------------------------------------------------------------------------
// Persona resolution helpers
// ---------------------------------------------------------------------------

/**
 * Return the list of personas available to a user given their roles.
 * The optional capabilities parameter is reserved for future use where
 * personas may be derived from capabilities rather than roles alone.
 */
export function getAvailablePersonas(
  roles: UserRole[],
  _capabilities?: Capability[],
): Persona[] {
  // v1: personas are 1:1 with roles
  return [...roles];
}

/**
 * Resolve a requested persona against the user's entitled roles.
 *
 * Returns the persona if valid, or null if the requested value is not
 * one of the user's available personas (caller should fall back to default).
 */
export function resolvePersona(
  requested: string | null | undefined,
  roles: UserRole[],
  _capabilities?: Capability[],
): Persona | null {
  if (!requested) return null;
  const available = getAvailablePersonas(roles);
  const match = available.find((p) => p === requested);
  return match ?? null;
}

/**
 * Pick a sensible default persona for a user.
 * Uses a priority order so users land on their most "operational" role.
 */
const PERSONA_PRIORITY: UserRole[] = [
  'CIRCULATOR',
  'SCRUB',
  'INVENTORY_TECH',
  'SURGEON',
  'ANESTHESIA',
  'SCHEDULER',
  'ADMIN',
];

export function getDefaultPersona(roles: UserRole[]): Persona {
  for (const p of PERSONA_PRIORITY) {
    if (roles.includes(p)) return p;
  }
  // Fallback: first role
  return roles[0];
}

/**
 * Human-readable label for a persona (for UI display).
 */
const PERSONA_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  SCHEDULER: 'Scheduler',
  INVENTORY_TECH: 'Inventory Tech',
  CIRCULATOR: 'Circulator',
  SURGEON: 'Surgeon',
  SCRUB: 'Scrub Tech',
  ANESTHESIA: 'Anesthesia',
};

export function getPersonaLabel(persona: Persona): string {
  return PERSONA_LABELS[persona] ?? persona;
}
