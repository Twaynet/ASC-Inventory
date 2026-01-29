'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '@/app/components/AuthGuard';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
