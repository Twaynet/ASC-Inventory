/**
 * Security Consistency Tests (Security Wave 1)
 *
 * Verifies:
 * 1. fail() includes requestId when provided
 * 2. Auth error envelopes use { error: { code, message } } shape
 * 3. Login error responses use envelope shape (static analysis)
 * 4. Idempotency middleware hash stability
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fail } from '../src/utils/reply.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. fail() includes requestId
// ---------------------------------------------------------------------------

describe('fail() requestId support', () => {
  it('includes requestId in error envelope when provided', () => {
    let sentBody: unknown;
    const reply = {
      status() { return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    fail(reply, 'NOT_FOUND', 'Not found', 404, undefined, 'req-123');

    expect((sentBody as any).error.requestId).toBe('req-123');
  });

  it('omits requestId when not provided', () => {
    let sentBody: unknown;
    const reply = {
      status() { return this; },
      send(body: unknown) { sentBody = body; return this; },
    } as any;

    fail(reply, 'NOT_FOUND', 'Not found', 404);

    expect((sentBody as any).error.requestId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Auth plugin error envelope shape (static analysis)
// ---------------------------------------------------------------------------

describe('Auth plugin error envelope consistency', () => {
  const authContent = readFileSync(join(__dirname, '..', 'src', 'plugins', 'auth.ts'), 'utf-8');

  it('does not use bare { error: "string" } in auth.ts', () => {
    const lines = authContent.split('\n');
    const bareErrors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match: .send({ error: 'string' }) or .send({ error: "string" })
      if (/\.send\(\{\s*error:\s*['"]/.test(line)) {
        bareErrors.push(`Line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(bareErrors).toEqual([]);
  });

  it('uses UNAUTHENTICATED code for 401 responses', () => {
    const has401WithCode = /status\(401\)[\s\S]{0,100}UNAUTHENTICATED/.test(authContent);
    expect(has401WithCode).toBe(true);
  });

  it('uses FORBIDDEN code for 403 responses', () => {
    const has403WithCode = /status\(403\)[\s\S]{0,100}FORBIDDEN/.test(authContent);
    expect(has403WithCode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Login route error envelope shape (static analysis)
// ---------------------------------------------------------------------------

describe('Login route error envelope consistency', () => {
  const authRoutesContent = readFileSync(join(__dirname, '..', 'src', 'routes', 'auth.routes.ts'), 'utf-8');

  it('does not use bare { error: "string" } in auth.routes.ts', () => {
    const lines = authRoutesContent.split('\n');
    const bareErrors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\.send\(\{\s*error:\s*['"]/.test(line)) {
        bareErrors.push(`Line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(bareErrors).toEqual([]);
  });

  it('includes requestId in all error responses', () => {
    const lines = authRoutesContent.split('\n');
    const errorSends: number[] = [];
    const errorSendsWithRequestId: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/reply\.status\(4\d\d\)\.send/.test(lines[i])) {
        errorSends.push(i + 1);
        // Check this line and next few for requestId
        const context = lines.slice(i, i + 3).join(' ');
        if (/requestId/.test(context)) {
          errorSendsWithRequestId.push(i + 1);
        }
      }
    }
    expect(errorSends.length).toBeGreaterThan(0);
    expect(errorSendsWithRequestId.length).toBe(errorSends.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Request ID plugin exists and configures correlation IDs
// ---------------------------------------------------------------------------

describe('Request ID plugin', () => {
  const pluginContent = readFileSync(join(__dirname, '..', 'src', 'plugins', 'request-id.ts'), 'utf-8');

  it('declares requestId on FastifyRequest', () => {
    expect(pluginContent).toContain('requestId');
  });

  it('sets X-Request-Id response header', () => {
    expect(pluginContent).toContain('X-Request-Id');
  });

  it('accepts inbound X-Request-Id header', () => {
    expect(pluginContent).toContain('x-request-id');
  });
});

// ---------------------------------------------------------------------------
// 5. Idempotency plugin exists with required features
// ---------------------------------------------------------------------------

describe('Idempotency plugin', () => {
  const content = readFileSync(join(__dirname, '..', 'src', 'plugins', 'idempotency.ts'), 'utf-8');

  it('exports idempotent() function', () => {
    expect(content).toMatch(/export\s+function\s+idempotent/);
  });

  it('checks Idempotency-Key header', () => {
    expect(content).toContain('idempotency-key');
  });

  it('returns 409 on key reuse with different body', () => {
    expect(content).toContain('409');
    expect(content).toContain('IDEMPOTENCY_KEY_REUSED');
  });

  it('uses SHA-256 body hashing', () => {
    expect(content).toContain('sha256');
  });
});

// ---------------------------------------------------------------------------
// 6. CORS includes security headers
// ---------------------------------------------------------------------------

describe('CORS security headers', () => {
  const indexContent = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

  it('allows X-Request-Id header', () => {
    expect(indexContent).toContain('X-Request-Id');
  });

  it('allows Idempotency-Key header', () => {
    expect(indexContent).toContain('Idempotency-Key');
  });
});
