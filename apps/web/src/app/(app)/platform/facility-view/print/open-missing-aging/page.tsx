'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { PrintLayout, PrintSection } from '@/app/components/PrintLayout';
import { getOpenMissingAging } from '@/lib/api/platform-facility-view';
import type { OpenMissingAgingItem } from '@/lib/api/inventory';
import { useFacilityContext } from '../../useFacilityContext';
import { useFacilityName } from '../../useFacilityName';

const MAX_ITEMS = 50;

function Content() {
  const { token } = useAuth();
  const { facilityId } = useFacilityContext();
  const facilityName = useFacilityName(facilityId);
  const [items, setItems] = useState<OpenMissingAgingItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !facilityId) return;
    try {
      const r = await getOpenMissingAging(token, facilityId);
      const sorted = [...r.items].sort((a, b) => b.daysMissing - a.daysMissing);
      setItems(sorted.slice(0, MAX_ITEMS));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [token, facilityId]);

  useEffect(() => { load(); }, [load]);

  if (!facilityId) {
    return <div className="p-6 text-text-muted">Select a facility to generate this report.</div>;
  }

  return (
    <PrintLayout title="Open Missing Aging" facilityName={facilityName ?? undefined}>
      {error && <div className="alert alert-error">{error}</div>}
      {items.length === 0 && !error && <p className="text-text-muted">Loading...</p>}
      {items.length > 0 && (
        <PrintSection>
          <p className="text-sm text-text-muted mb-3">
            Showing top {items.length} items sorted by days missing (descending). Point-in-time snapshot.
          </p>
          <table className="print-table w-full text-sm border-collapse border border-border">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="p-2 text-left border border-border">Catalog</th>
                <th className="p-2 text-left border border-border">Lot / Serial</th>
                <th className="p-2 text-left border border-border">Location</th>
                <th className="p-2 text-left border border-border">Missing Since</th>
                <th className="p-2 text-right border border-border">Days</th>
                <th className="p-2 text-left border border-border">Reported By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.inventoryItemId}>
                  <td className="p-2 border border-border">{item.catalogName}</td>
                  <td className="p-2 border border-border text-xs">{item.lotNumber || item.serialNumber || '-'}</td>
                  <td className="p-2 border border-border">{item.locationName || '-'}</td>
                  <td className="p-2 border border-border text-xs">{new Date(item.missingSince).toLocaleDateString()}</td>
                  <td className={`p-2 border border-border text-right font-semibold ${item.daysMissing > 30 ? 'text-[var(--color-red)]' : item.daysMissing > 7 ? 'text-[var(--color-orange)]' : ''}`}>
                    {item.daysMissing}
                  </td>
                  <td className="p-2 border border-border text-xs">{item.lastStaffName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      )}
    </PrintLayout>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-6 text-text-muted">Loading...</div>}><Content /></Suspense>;
}
