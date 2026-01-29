/**
 * composeCaseCardVersion
 *
 * Loads a case_card_version, resolves its components[] (preference card versions),
 * merges their items into the appropriate case-card sections, then applies overrides[].
 */

import { query } from '../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Component {
  preferenceCardVersionId: string;
  role?: string;   // e.g. "SURGEON", "ANESTHESIA"
  label?: string;
}

interface Override {
  op: 'add' | 'remove' | 'replace';
  section: string;                     // target section key
  match?: Record<string, unknown>;     // identifies existing item (for remove/replace)
  item?: Record<string, unknown>;      // new/replacement item (for add/replace)
}

interface PrefItem {
  catalogId?: string;
  quantity?: number;
  notes?: string;
  section?: string;
  category?: string;
  [key: string]: unknown;
}

// The case-card section keys that map from preference item metadata
const SECTION_KEYS = [
  'instrumentation', 'equipment', 'supplies', 'medications',
  'setup_positioning', 'surgeon_notes',
] as const;

type SectionKey = typeof SECTION_KEYS[number];

// ---------------------------------------------------------------------------
// Section routing
// ---------------------------------------------------------------------------

function routeToSection(item: PrefItem): SectionKey {
  const hint = (item.section || item.category || '').toLowerCase();
  if (hint.includes('instrument'))      return 'instrumentation';
  if (hint.includes('equip'))           return 'equipment';
  if (hint.includes('med'))             return 'medications';
  if (hint.includes('setup') || hint.includes('position')) return 'setup_positioning';
  if (hint.includes('note'))            return 'surgeon_notes';
  // default
  return 'supplies';
}

// ---------------------------------------------------------------------------
// Override application
// ---------------------------------------------------------------------------

function applyOverrides(sections: Record<string, unknown>, overrides: Override[]): void {
  for (const ov of overrides) {
    const key = ov.section as string;
    if (!key) continue;

    // Ensure target is an object with an items array
    const sec = (sections[key] ?? { items: [] }) as Record<string, unknown>;
    const items = (Array.isArray(sec.items) ? sec.items : []) as Record<string, unknown>[];

    if (ov.op === 'add' && ov.item) {
      items.push(ov.item);
    } else if (ov.op === 'remove' && ov.match) {
      const matchEntries = Object.entries(ov.match);
      const idx = items.findIndex(i => matchEntries.every(([k, v]) => i[k] === v));
      if (idx !== -1) items.splice(idx, 1);
    } else if (ov.op === 'replace' && ov.match && ov.item) {
      const matchEntries = Object.entries(ov.match);
      const idx = items.findIndex(i => matchEntries.every(([k, v]) => i[k] === v));
      if (idx !== -1) items[idx] = { ...items[idx], ...ov.item };
    }

    sec.items = items;
    sections[key] = sec;
  }
}

// ---------------------------------------------------------------------------
// Main compose function
// ---------------------------------------------------------------------------

export async function composeCaseCardVersion(versionId: string): Promise<{
  versionId: string;
  components: Component[];
  composed: Record<string, unknown>;
}> {
  // 1. Load base version
  const vr = await query<{
    id: string;
    components: Component[];
    overrides: Override[];
    header_info: Record<string, unknown>;
    patient_flags: Record<string, unknown>;
    instrumentation: Record<string, unknown>;
    equipment: Record<string, unknown>;
    supplies: Record<string, unknown>;
    medications: Record<string, unknown>;
    setup_positioning: Record<string, unknown>;
    surgeon_notes: Record<string, unknown>;
  }>(`
    SELECT id, components, overrides,
           header_info, patient_flags, instrumentation, equipment,
           supplies, medications, setup_positioning, surgeon_notes
    FROM case_card_version WHERE id = $1
  `, [versionId]);

  if (vr.rows.length === 0) throw new Error('Version not found');
  const row = vr.rows[0];

  // Deep-clone sections so we don't mutate originals
  const composed: Record<string, unknown> = {
    header_info: JSON.parse(JSON.stringify(row.header_info)),
    patient_flags: JSON.parse(JSON.stringify(row.patient_flags)),
    instrumentation: JSON.parse(JSON.stringify(row.instrumentation)),
    equipment: JSON.parse(JSON.stringify(row.equipment)),
    supplies: JSON.parse(JSON.stringify(row.supplies)),
    medications: JSON.parse(JSON.stringify(row.medications)),
    setup_positioning: JSON.parse(JSON.stringify(row.setup_positioning)),
    surgeon_notes: JSON.parse(JSON.stringify(row.surgeon_notes)),
  };

  const components: Component[] = Array.isArray(row.components) ? row.components : [];
  const overrides: Override[] = Array.isArray(row.overrides) ? row.overrides : [];

  // 2. Merge each component's items
  if (components.length > 0) {
    const ids = components.map(c => c.preferenceCardVersionId);
    const prefResult = await query<{ id: string; items: PrefItem[] }>(`
      SELECT id, items FROM preference_card_version WHERE id = ANY($1)
    `, [ids]);

    const prefMap = new Map(prefResult.rows.map(r => [r.id, r.items]));

    for (const comp of components) {
      const items = prefMap.get(comp.preferenceCardVersionId);
      if (!items || !Array.isArray(items)) continue;

      for (const item of items) {
        const sectionKey = routeToSection(item);
        const sec = (composed[sectionKey] ?? { items: [] }) as Record<string, unknown>;
        const arr = (Array.isArray(sec.items) ? sec.items : []) as unknown[];
        arr.push({ ...item, _source: 'preference', _componentId: comp.preferenceCardVersionId });
        sec.items = arr;
        composed[sectionKey] = sec;
      }
    }
  }

  // 3. Apply overrides
  applyOverrides(composed, overrides);

  return { versionId, components, composed };
}
