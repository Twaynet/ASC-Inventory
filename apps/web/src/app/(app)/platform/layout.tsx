'use client';

/**
 * Platform Admin Layout
 *
 * LAW §2.4: Tenant users must never access Control Plane routes.
 * LAW §3.1: PLATFORM_ADMIN is no-tenant identity.
 */

import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading } = useAuth();
  const { hasRole } = useAccessControl();

  if (isLoading) {
    return (
      <>
        <Header title="Platform Administration" />
        <main className="container-full">
          <div className="loading-state">Loading...</div>
        </main>
      </>
    );
  }

  if (!hasRole('PLATFORM_ADMIN')) {
    return (
      <>
        <Header title="Platform Administration" />
        <main className="container-full">
          <div className="access-denied">
            <h2>Access Denied</h2>
            <p>
              This area is restricted to Platform Administrators only.
            </p>
            <p className="hint">
              If you believe you should have access, please contact your system administrator.
            </p>
          </div>
        </main>
        <style jsx>{`
          .access-denied {
            max-width: 500px;
            margin: 4rem auto;
            padding: 2rem;
            text-align: center;
            background: var(--surface-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-default);
          }
          .access-denied h2 {
            color: var(--color-red);
            margin-bottom: 1rem;
          }
          .access-denied p {
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
          }
          .access-denied .hint {
            font-size: 0.875rem;
            color: var(--text-muted);
          }
        `}</style>
      </>
    );
  }

  return <>{children}</>;
}
