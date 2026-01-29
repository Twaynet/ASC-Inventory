'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Redirects unauthenticated users to /login and shows a loading state
 * while the auth check is in progress. Wrap authenticated route groups
 * with this component in a layout.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return <>{children}</>;
}
