/**
 * API Contract Tests
 * Verify the ok/fail envelope helpers produce the expected shapes.
 */

import { describe, it, expect } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Minimal FastifyReply stub                                         */
/* ------------------------------------------------------------------ */
function createReplyStub() {
  let _status = 200;
  let _body: unknown;
  const reply: any = {
    status(code: number) { _status = code; return reply; },
    send(body: unknown) { _body = body; return reply; },
    get sentStatus() { return _status; },
    get sentBody() { return _body; },
  };
  return reply;
}

/* ------------------------------------------------------------------ */
/*  Import helpers                                                    */
/* ------------------------------------------------------------------ */
import { ok, fail } from '../src/utils/reply.js';

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */
describe('API contract envelope', () => {
  it('ok() wraps payload in { data }', () => {
    const reply = createReplyStub();
    ok(reply, { items: [1, 2, 3] });

    expect(reply.sentStatus).toBe(200);
    expect(reply.sentBody).toEqual({ data: { items: [1, 2, 3] } });
  });

  it('ok() accepts a custom status code', () => {
    const reply = createReplyStub();
    ok(reply, { id: 'abc' }, 201);

    expect(reply.sentStatus).toBe(201);
    expect(reply.sentBody).toEqual({ data: { id: 'abc' } });
  });

  it('fail() returns { error: { code, message } }', () => {
    const reply = createReplyStub();
    fail(reply, 'NOT_FOUND', 'Item not found', 404);

    expect(reply.sentStatus).toBe(404);
    expect(reply.sentBody).toEqual({
      error: { code: 'NOT_FOUND', message: 'Item not found' },
    });
  });

  it('fail() includes details when provided', () => {
    const reply = createReplyStub();
    const details = { fieldErrors: { name: ['Required'] } };
    fail(reply, 'VALIDATION_ERROR', 'Validation error', 400, details);

    expect(reply.sentStatus).toBe(400);
    expect(reply.sentBody).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error',
        details,
      },
    });
  });

  it('fail() omits details key when not provided', () => {
    const reply = createReplyStub();
    fail(reply, 'DUPLICATE', 'Already exists', 400);

    const body = reply.sentBody as any;
    expect(body.error).not.toHaveProperty('details');
  });
});
