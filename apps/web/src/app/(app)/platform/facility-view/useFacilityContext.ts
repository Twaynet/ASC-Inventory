'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Hook to read facilityId from URL search params and build links preserving it.
 */
export function useFacilityContext() {
  const searchParams = useSearchParams();
  const facilityId = searchParams.get('facilityId') || null;

  /** Build href preserving facilityId + adding extra params */
  function buildHref(basePath: string, extraParams?: Record<string, string>): string {
    const params = new URLSearchParams();
    if (facilityId) params.set('facilityId', facilityId);
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return { facilityId, buildHref };
}
