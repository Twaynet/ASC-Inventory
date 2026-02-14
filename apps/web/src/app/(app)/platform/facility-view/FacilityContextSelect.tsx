'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getFacilities, type Facility } from '@/lib/api/platform';

/**
 * Dropdown populated from /platform/facilities.
 * On change: updates ?facilityId= preserving other params.
 */
export function FacilityContextSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedId = searchParams.get('facilityId') || '';

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getFacilities(token);
      setFacilities(result.facilities);
    } catch {
      // Degrade silently
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleChange(facilityId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (facilityId) {
      params.set('facilityId', facilityId);
    } else {
      params.delete('facilityId');
    }
    const qs = params.toString();
    const base = window.location.pathname;
    router.replace(qs ? `${base}?${qs}` : base);
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-text-secondary whitespace-nowrap">Facility:</label>
      <select
        value={selectedId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface-primary text-text-primary min-w-[200px]"
      >
        <option value="">Select a facility...</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      {selectedId && (
        <button
          onClick={() => handleChange('')}
          className="text-xs text-text-muted hover:text-text-secondary underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
