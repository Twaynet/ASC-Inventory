import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { request, ApiError, resolveAssetUrl } from '@/lib/api/client';
import { CaseListResponseSchema, CaseApiSchema } from '@/lib/api/schemas';

describe('client.ts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Environment safety: no crash when window/localStorage absent
  // -------------------------------------------------------------------------

  describe('Node environment (no window)', () => {
    it('request() does not crash without window or localStorage', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cases: [] }),
      });

      const result = await request<{ cases: unknown[] }>('/cases', { token: 'tok' });

      expect(result).toEqual({ cases: [] });
      expect(globalThis.fetch).toHaveBeenCalledOnce();

      // Verify Authorization header was set
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer tok');
    });
  });

  // -------------------------------------------------------------------------
  // ApiError construction
  // -------------------------------------------------------------------------

  describe('ApiError', () => {
    it('stores status, code, message, and details', () => {
      const err = new ApiError(422, 'VALIDATION', 'bad input', { field: 'name' });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiError');
      expect(err.status).toBe(422);
      expect(err.code).toBe('VALIDATION');
      expect(err.message).toBe('bad input');
      expect(err.details).toEqual({ field: 'name' });
    });
  });

  // -------------------------------------------------------------------------
  // Envelope unwrapping
  // -------------------------------------------------------------------------

  describe('envelope unwrapping', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('unwraps { data: payload } envelope', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1', name: 'test' } }),
      });

      const result = await request<{ id: string; name: string }>('/items/1', { token: 't' });
      expect(result).toEqual({ id: '1', name: 'test' });
    });

    it('passes through legacy responses (no envelope)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cases: [{ id: '1' }] }),
      });

      const result = await request<{ cases: { id: string }[] }>('/cases', { token: 't' });
      expect(result).toEqual({ cases: [{ id: '1' }] });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('throws ApiError for structured error envelope', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 'FORBIDDEN', message: 'No access' } }),
      });

      await expect(request('/secret', { token: 't' })).rejects.toThrow(ApiError);
      try {
        await request('/secret', { token: 't' });
      } catch (e) {
        const err = e as ApiError;
        expect(err.status).toBe(403);
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toBe('No access');
      }
    });

    it('throws ApiError for legacy string error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Something went wrong' }),
      });

      await expect(request('/bad', { token: 't' })).rejects.toThrow(ApiError);
      try {
        await request('/bad', { token: 't' });
      } catch (e) {
        const err = e as ApiError;
        expect(err.status).toBe(400);
        expect(err.message).toBe('Something went wrong');
      }
    });
  });

  // -------------------------------------------------------------------------
  // resolveAssetUrl
  // -------------------------------------------------------------------------

  describe('resolveAssetUrl', () => {
    it('resolves relative paths to full URL', () => {
      const url = resolveAssetUrl('/uploads/image.jpg');
      expect(url).toContain('/uploads/image.jpg');
      expect(url).toMatch(/^https?:\/\//);
    });

    it('returns absolute URLs unchanged', () => {
      const url = resolveAssetUrl('https://cdn.example.com/img.png');
      expect(url).toBe('https://cdn.example.com/img.png');
    });
  });

  // -------------------------------------------------------------------------
  // Schema validation (Wave 5)
  // -------------------------------------------------------------------------

  describe('schema validation', () => {
    const testSchema = z.object({ id: z.string(), name: z.string() });

    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('passes when response matches responseSchema', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'valid' }),
      });

      const result = await request<{ id: string; name: string }>('/test', {
        token: 't',
        responseSchema: testSchema,
      });
      expect(result).toEqual({ id: '1', name: 'valid' });
    });

    it('throws CLIENT_SCHEMA_VALIDATION when response fails responseSchema', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 123, name: null }),
      });

      try {
        await request('/test', { token: 't', responseSchema: testSchema });
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as ApiError;
        expect(err.code).toBe('CLIENT_SCHEMA_VALIDATION');
        expect(err.message).toBe('Response schema validation failed');
        expect(err.details).toHaveProperty('endpoint', '/test');
        expect(err.details).toHaveProperty('issues');
      }
    });

    it('throws CLIENT_SCHEMA_VALIDATION when request body fails requestSchema', async () => {
      const reqSchema = z.object({ name: z.string().min(1) });

      try {
        await request('/test', {
          method: 'POST',
          body: { name: '' },
          token: 't',
          requestSchema: reqSchema,
        });
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as ApiError;
        expect(err.code).toBe('CLIENT_SCHEMA_VALIDATION');
        expect(err.message).toBe('Request schema validation failed');
        expect(err.details).toHaveProperty('method', 'POST');
        expect(err.details).toHaveProperty('endpoint', '/test');
        expect(err.details).toHaveProperty('issues');
      }
      // fetch should NOT have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('includes method and endpoint in schema error details', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wrong: 'shape' }),
      });

      try {
        await request('/cases/123', { method: 'PATCH', token: 't', responseSchema: testSchema });
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as ApiError;
        expect(err.code).toBe('CLIENT_SCHEMA_VALIDATION');
        const details = err.details as { method: string; endpoint: string };
        expect(details.method).toBe('PATCH');
        expect(details.endpoint).toBe('/cases/123');
      }
    });

    it('validates real CaseListResponseSchema — accepts valid cases array', () => {
      const validCase = {
        id: 'c1', caseNumber: 'C-001', facilityId: 'f1',
        scheduledDate: '2025-01-15', scheduledTime: '08:00',
        requestedDate: null, requestedTime: null,
        surgeonId: 's1', surgeonName: 'Dr. Smith', procedureName: 'ACL Repair',
        preferenceCardVersionId: null, status: 'SCHEDULED',
        notes: null, isActive: true,
        activatedAt: '2025-01-14T10:00:00Z', activatedByUserId: 'u1',
        isCancelled: false, cancelledAt: null, cancelledByUserId: null,
        rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
        createdAt: '2025-01-10T08:00:00Z', updatedAt: '2025-01-14T10:00:00Z',
      };

      const valid = CaseListResponseSchema.safeParse({ cases: [validCase] });
      expect(valid.success).toBe(true);

      // Malformed: missing required field
      const invalid = CaseListResponseSchema.safeParse({ cases: [{ id: 'c1' }] });
      expect(invalid.success).toBe(false);
    });

    it('validates envelope-unwrapped data with responseSchema', async () => {
      const validCase = {
        id: 'c1', caseNumber: 'C-001', facilityId: 'f1',
        scheduledDate: null, scheduledTime: null,
        requestedDate: null, requestedTime: null,
        surgeonId: 's1', surgeonName: 'Dr. Smith', procedureName: 'Test',
        preferenceCardVersionId: null, status: 'DRAFT',
        notes: null, isActive: false,
        activatedAt: null, activatedByUserId: null,
        isCancelled: false, cancelledAt: null, cancelledByUserId: null,
        rejectedAt: null, rejectedByUserId: null, rejectionReason: null,
        createdAt: '2025-01-10T08:00:00Z', updatedAt: '2025-01-10T08:00:00Z',
      };

      // Envelope-wrapped response
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { cases: [validCase] } }),
      });

      const result = await request<{ cases: unknown[] }>('/cases', {
        token: 't',
        responseSchema: CaseListResponseSchema,
      });
      expect(result.cases).toHaveLength(1);
    });
  });
});
