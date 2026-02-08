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
          <div className="max-w-[500px] mx-auto mt-16 p-8 text-center bg-surface-secondary rounded-lg border border-border">
            <h2 className="text-[var(--color-red)] mb-4">Access Denied</h2>
            <p className="text-text-secondary mb-2">
              This area is restricted to Platform Administrators only.
            </p>
            <p className="text-sm text-text-muted">
              If you believe you should have access, please contact your system administrator.
            </p>
          </div>
        </main>
      </>
    );
  }

  return <>{children}</>;
}
