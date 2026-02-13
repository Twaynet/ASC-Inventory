'use client';

import { Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { CaseDashboardModal } from '@/components/CaseDashboardModal';

function CaseDashboardPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useParams();
  const caseId = params.caseId as string;

  const handleClose = () => {
    router.back();
  };

  if (!user || !token) {
    return (
      <>
        <Header title="Case Dashboard" />
        <main className="admin-main">
          <div className="loading">Loading...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Case Dashboard" />
      <main className="admin-main" style={{ background: '#f3f4f6', minHeight: '100vh' }}>
        {/* Phase 7 sub-navigation */}
        <div className="flex gap-2 px-6 py-3 bg-surface-primary border-b border-border">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => router.push(`/case/${caseId}/timeline`)}
          >
            View Timeline
          </button>
          <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-surface-secondary text-text-muted border border-border">
            Overrides — Phase 7 (coming soon)
          </span>
        </div>
        <CaseDashboardModal
          isOpen={true}
          caseId={caseId}
          token={token}
          user={{
            id: user.id,
            name: user.name,
            role: user.role,
            roles: user.roles,
            facilityName: user.facilityName,
          }}
          onClose={handleClose}
        />
      </main>
    </>
  );
}

export default function CaseDashboardPageWrapper() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <CaseDashboardPage />
    </Suspense>
  );
}
