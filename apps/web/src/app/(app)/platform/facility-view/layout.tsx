'use client';

import { Suspense } from 'react';
import { Header } from '@/app/components/Header';
import { FacilityContextSelect } from './FacilityContextSelect';

export default function FacilityViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header title="Facility View" />
      <div className="px-6 pt-4 max-w-6xl mx-auto">
        <Suspense fallback={<div className="text-sm text-text-muted">Loading...</div>}>
          <FacilityContextSelect />
        </Suspense>
      </div>
      {children}
    </>
  );
}
