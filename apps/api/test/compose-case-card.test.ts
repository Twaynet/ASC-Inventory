/**
 * Compose Case Card Version – unit tests
 *
 * Tests the composition logic (section routing + overrides) without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll dynamically import after mocking
let composeCaseCardVersion: typeof import('../src/services/compose-case-card.js').composeCaseCardVersion;

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
vi.mock('../src/db/index.js', () => ({ query: (...args: unknown[]) => mockQuery(...args) }));

beforeEach(async () => {
  mockQuery.mockReset();
  // Re-import to get fresh module with mock
  const mod = await import('../src/services/compose-case-card.js');
  composeCaseCardVersion = mod.composeCaseCardVersion;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    components: [],
    overrides: [],
    header_info: {},
    patient_flags: {},
    instrumentation: { items: [] },
    equipment: { items: [] },
    supplies: { items: [] },
    medications: { items: [] },
    setup_positioning: { items: [] },
    surgeon_notes: { items: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composeCaseCardVersion', () => {
  it('merges one preference-card component into supplies (default section)', async () => {
    const prefVersionId = 'pv-1';

    // First call: load case_card_version
    mockQuery.mockResolvedValueOnce({
      rows: [baseVersion({
        components: [{ preferenceCardVersionId: prefVersionId }],
      })],
    });

    // Second call: load preference_card_version items
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: prefVersionId,
        items: [
          { catalogId: 'cat-1', quantity: 2, notes: 'sterile' },
        ],
      }],
    });

    const result = await composeCaseCardVersion('v1');

    expect(result.versionId).toBe('v1');
    expect(result.components).toHaveLength(1);

    const supplies = result.composed.supplies as { items: unknown[] };
    expect(supplies.items).toHaveLength(1);
    expect(supplies.items[0]).toMatchObject({ catalogId: 'cat-1', quantity: 2 });
  });

  it('routes items with section hints to the correct section', async () => {
    const prefVersionId = 'pv-2';

    mockQuery.mockResolvedValueOnce({
      rows: [baseVersion({
        components: [{ preferenceCardVersionId: prefVersionId }],
      })],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: prefVersionId,
        items: [
          { catalogId: 'med-1', quantity: 1, section: 'medications' },
          { catalogId: 'eq-1', quantity: 1, category: 'Equipment' },
        ],
      }],
    });

    const result = await composeCaseCardVersion('v1');

    const meds = result.composed.medications as { items: unknown[] };
    expect(meds.items).toHaveLength(1);
    expect(meds.items[0]).toMatchObject({ catalogId: 'med-1' });

    const equip = result.composed.equipment as { items: unknown[] };
    expect(equip.items).toHaveLength(1);
    expect(equip.items[0]).toMatchObject({ catalogId: 'eq-1' });
  });

  it('applies remove override', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseVersion({
        supplies: { items: [{ catalogId: 'cat-1', quantity: 5 }] },
        overrides: [
          { op: 'remove', section: 'supplies', match: { catalogId: 'cat-1' } },
        ],
      })],
    });

    const result = await composeCaseCardVersion('v1');

    const supplies = result.composed.supplies as { items: unknown[] };
    expect(supplies.items).toHaveLength(0);
  });

  it('applies add override', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseVersion({
        overrides: [
          { op: 'add', section: 'equipment', item: { catalogId: 'new-eq', quantity: 1 } },
        ],
      })],
    });

    const result = await composeCaseCardVersion('v1');

    const equip = result.composed.equipment as { items: unknown[] };
    expect(equip.items).toHaveLength(1);
    expect(equip.items[0]).toMatchObject({ catalogId: 'new-eq' });
  });

  it('copy-forward: composed output preserves components/overrides from source version', async () => {
    const components = [{ preferenceCardVersionId: 'pv-99' }];
    const overrides = [{ op: 'add', section: 'supplies', item: { catalogId: 'x', quantity: 1 } }];

    // Load version that already has components + overrides (no preference items to fetch)
    mockQuery.mockResolvedValueOnce({
      rows: [baseVersion({ components, overrides })],
    });

    // Preference card version lookup for the component
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await composeCaseCardVersion('v1');

    // components carried through
    expect(result.components).toEqual(components);
    // override was applied (add to supplies)
    const supplies = result.composed.supplies as { items: unknown[] };
    expect(supplies.items).toHaveLength(1);
    expect(supplies.items[0]).toMatchObject({ catalogId: 'x' });
    // composed_cache is not part of compose output (it's a DB-only column)
    expect(result).not.toHaveProperty('composed_cache');
  });
});
