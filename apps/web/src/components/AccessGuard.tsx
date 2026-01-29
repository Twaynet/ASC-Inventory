'use client';

import { ReactNode } from 'react';
import { useAccessControl } from '@/lib/auth';
import type { Role, Capability } from '@/lib/access-control';

interface AccessGuardProps {
  /** Show children if user has ANY of these roles */
  requiredRoles?: Role[];
  /** Show children if user has ANY of these capabilities */
  requiredCapabilities?: Capability[];
  /** Shown when access is denied. Defaults to null (hidden). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Single reusable guard component for UI access control.
 *
 * Uses roles[] (not primary role) and derived capabilities as truth.
 * This is UX only — the API enforces real authorization.
 *
 * Logic: user needs ANY required role OR ANY required capability (OR).
 * If neither requiredRoles nor requiredCapabilities is provided, children render unconditionally.
 */
export function AccessGuard({
  requiredRoles,
  requiredCapabilities,
  fallback = null,
  children,
}: AccessGuardProps) {
  const { hasRole, hasCapability } = useAccessControl();

  // No requirements = always show
  if (!requiredRoles?.length && !requiredCapabilities?.length) {
    return <>{children}</>;
  }

  const roleMatch = requiredRoles?.some(r => hasRole(r)) ?? false;
  const capMatch = requiredCapabilities?.some(c => hasCapability(c)) ?? false;

  if (roleMatch || capMatch) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
