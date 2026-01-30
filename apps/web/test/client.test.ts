import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, ApiError, resolveAssetUrl } from '@/lib/api/client';

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
});
