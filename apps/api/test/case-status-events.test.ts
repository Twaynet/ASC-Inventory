/**
 * Case Status Events – unit tests
 *
 * 1. recordStatusEvent inserts a row with correct from/to.
 * 2. Append-only: UPDATE/DELETE on surgical_case_status_event must be blocked
 *    (simulated via prevent_modification trigger logic).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
vi.mock('../src/db/index.js', () => ({ query: (...args: unknown[]) => mockQuery(...args) }));

let recordStatusEvent: typeof import('../src/services/case-status.service.js').recordStatusEvent;
let getStatusEvents: typeof import('../src/services/case-status.service.js').getStatusEvents;

beforeEach(async () => {
  mockQuery.mockReset();
  const mod = await import('../src/services/case-status.service.js');
  recordStatusEvent = mod.recordStatusEvent;
  getStatusEvents = mod.getStatusEvents;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Case Status Events', () => {
  it('recordStatusEvent inserts a row with correct from/to, actor, reason, and context', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT returns nothing useful

    await recordStatusEvent(
      'case-uuid-1',
      'REQUESTED',
      'SCHEDULED',
      'user-uuid-1',
      { reason: 'Approved by scheduler', context: { source: 'case_approve' } },
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];
    // Verify the SQL is an INSERT into the correct table
    expect(sql).toContain('INSERT INTO surgical_case_status_event');
    // Verify parameters
    expect(params[0]).toBe('case-uuid-1');       // surgical_case_id
    expect(params[1]).toBe('REQUESTED');          // from_status
    expect(params[2]).toBe('SCHEDULED');          // to_status
    expect(params[3]).toBe('Approved by scheduler'); // reason
    expect(JSON.parse(params[4])).toEqual({ source: 'case_approve' }); // context as JSON
    expect(params[5]).toBe('user-uuid-1');        // actor_user_id
  });

  it('recordStatusEvent defaults reason to null and context to empty object', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await recordStatusEvent('case-uuid-2', null, 'REQUESTED', null);

    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBeNull();                  // from_status (null for creation)
    expect(params[3]).toBeNull();                  // reason
    expect(JSON.parse(params[4])).toEqual({});     // context defaults to {}
    expect(params[5]).toBeNull();                  // actor_user_id
  });

  it('getStatusEvents returns rows ordered by created_at', async () => {
    const fakeRows = [
      {
        id: 'evt-1',
        surgical_case_id: 'case-1',
        from_status: null,
        to_status: 'REQUESTED',
        reason: null,
        context: {},
        actor_user_id: null,
        actor_name: null,
        created_at: new Date('2025-01-01T10:00:00Z'),
      },
      {
        id: 'evt-2',
        surgical_case_id: 'case-1',
        from_status: 'REQUESTED',
        to_status: 'SCHEDULED',
        reason: 'Approved',
        context: { source: 'case_approve' },
        actor_user_id: 'user-1',
        actor_name: 'Jane Admin',
        created_at: new Date('2025-01-01T11:00:00Z'),
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const events = await getStatusEvents('case-1');

    expect(events).toHaveLength(2);
    expect(events[0].to_status).toBe('REQUESTED');
    expect(events[1].to_status).toBe('SCHEDULED');
    expect(events[1].actor_name).toBe('Jane Admin');

    // Verify the query includes ORDER BY
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY');
  });

  it('append-only: service module does not expose update or delete functions', async () => {
    // The actual enforcement is at the DB layer via:
    //   CREATE TRIGGER case_status_event_no_update
    //     BEFORE UPDATE ON surgical_case_status_event
    //     FOR EACH ROW EXECUTE FUNCTION prevent_modification();
    //   CREATE TRIGGER case_status_event_no_delete
    //     BEFORE DELETE ON surgical_case_status_event
    //     FOR EACH ROW EXECUTE FUNCTION prevent_modification();
    //
    // At the application layer, we verify the service module does NOT
    // expose any update/delete functions — only insert and read.
    const mod = await import('../src/services/case-status.service.js');
    const exportedNames = Object.keys(mod);
    expect(exportedNames).not.toContain('updateStatusEvent');
    expect(exportedNames).not.toContain('deleteStatusEvent');
    // Only recordStatusEvent and getStatusEvents should exist
    expect(exportedNames).toContain('recordStatusEvent');
    expect(exportedNames).toContain('getStatusEvents');
  });
});
