'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { decodeJwtPayload } from '@/lib/jwt-decode';
import { API_BASE } from '@/lib/api/client';

export default function DemoLoginPage() {
  const [email, setEmail] = useState('test@example.com');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; details?: unknown } | null>(null);
  const [success, setSuccess] = useState(false);

  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      router.push(user.isDemo ? '/demo' : '/dashboard');
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/demo/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error(`Unexpected response type: ${contentType || 'unknown'}`);
      }

      const json = await response.json();

      if (!response.ok) {
        // Handle error response: { error: { code, message, details? } }
        const err = json.error || { code: 'UNKNOWN_ERROR', message: 'Request failed' };
        setError(err);
        setIsSubmitting(false);
        return;
      }

      // Handle success response: { data: { token, expiresAt, demo, facility } }
      const data = json.data || json; // Defensive: handle both shapes
      const token = data.token;

      if (!token || typeof token !== 'string') {
        throw new Error('Invalid response: missing or malformed token');
      }

      // Store token
      localStorage.setItem('asc_token', token);
      setSuccess(true);

      // Redirect to demo landing page
      setTimeout(() => {
        window.location.href = '/demo';
      }, 500);
    } catch (err) {
      setError({
        code: 'REQUEST_FAILED',
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="login-container" style={{ minHeight: 'calc(100vh - 3rem)' }}>
      <div className="login-card">
        <h1>Demo Access</h1>
        <p className="text-sm text-text-secondary text-center mb-6">
          Request instant 14-day demo access. No approval required.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              <div className="font-semibold">{error.code}</div>
              <div className="text-sm">{error.message}</div>
              {error.details ? (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 overflow-auto">{JSON.stringify(error.details, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          )}

          {success && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              Demo access granted! Redirecting...
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={isSubmitting || success}
          >
            {isSubmitting ? 'Requesting Access...' : success ? 'Success!' : 'Request Demo Access'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-text-muted text-center">
            Already have credentials?{' '}
            <a href="/login" className="text-accent hover:underline">
              Sign in here
            </a>
          </p>
        </div>

        {/* Diagnostics Section */}
        <DiagnosticsSection />
      </div>
    </div>
  );
}

// ─── Diagnostics Section ───────────────────────────────────────────

function DiagnosticsSection() {
  const [tokenExists, setTokenExists] = useState(false);
  const [decodedPayload, setDecodedPayload] = useState<{
    userId?: string;
    email?: string;
    isDemo?: boolean;
    exp?: number;
    expLocal?: string;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('asc_token');
    setTokenExists(!!token);

    if (token) {
      const decoded = decodeJwtPayload(token);
      if (decoded) {
        const expTimestamp = (decoded as any).exp;
        const expLocal = expTimestamp
          ? new Date(expTimestamp * 1000).toLocaleString()
          : 'Unknown';
        setDecodedPayload({
          userId: (decoded as any).userId,
          email: (decoded as any).email,
          isDemo: decoded.isDemo,
          exp: expTimestamp,
          expLocal,
        });
      }
    } else {
      setDecodedPayload(null);
    }
  }, []);

  const handleClearToken = () => {
    localStorage.removeItem('asc_token');
    window.location.reload();
  };

  return (
    <details className="mt-6 pt-6 border-t border-border">
      <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
        Self-Diagnostics
      </summary>
      <div className="mt-3 text-xs text-text-secondary space-y-2">
        <div>
          <span className="font-semibold">Token exists:</span>{' '}
          {tokenExists ? (
            <span className="text-[var(--color-green)]">Yes</span>
          ) : (
            <span className="text-text-muted">No</span>
          )}
        </div>

        {decodedPayload && (
          <>
            <div>
              <span className="font-semibold">User ID:</span> {decodedPayload.userId || 'N/A'}
            </div>
            <div>
              <span className="font-semibold">Email:</span> {decodedPayload.email || 'N/A'}
            </div>
            <div>
              <span className="font-semibold">Is Demo:</span>{' '}
              {decodedPayload.isDemo ? (
                <span className="text-[var(--color-blue)]">true</span>
              ) : (
                <span className="text-text-muted">false</span>
              )}
            </div>
            <div>
              <span className="font-semibold">Expires:</span> {decodedPayload.expLocal}
            </div>
          </>
        )}

        {tokenExists && (
          <button
            type="button"
            onClick={handleClearToken}
            className="btn btn-sm btn-danger"
            style={{ marginTop: '0.5rem' }}
          >
            Clear Demo Token
          </button>
        )}
      </div>
    </details>
  );
}
