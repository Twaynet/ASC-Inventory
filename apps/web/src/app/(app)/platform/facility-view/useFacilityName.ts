'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { getFacilities, type Facility } from '@/lib/api/platform';

/**
 * Hook to resolve a facilityId → facility name.
 * Uses component-level cache (NOT module-level) to avoid cross-request leakage.
 */
export function useFacilityName(facilityId: string | null): string | null {
  const { token } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!facilityId || !token) {
      setName(null);
      return;
    }

    // Check cache first
    const cached = cacheRef.current.get(facilityId);
    if (cached) {
      setName(cached);
      return;
    }

    let cancelled = false;
    getFacilities(token).then((result) => {
      if (cancelled) return;
      // Populate cache with all results
      for (const f of result.facilities) {
        cacheRef.current.set(f.id, f.name);
      }
      setName(cacheRef.current.get(facilityId) ?? null);
    }).catch(() => {
      if (!cancelled) setName(null);
    });

    return () => { cancelled = true; };
  }, [facilityId, token]);

  return name;
}
