/**
 * Minimal JWT payload decoder (no verification — server validates the token).
 * Used client-side to extract display-only flags like isDemo.
 */

interface JwtPayloadSubset {
  userId?: string;
  facilityId?: string | null;
  isDemo?: boolean;
}

export function decodeJwtPayload(token: string): JwtPayloadSubset | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayloadSubset;
  } catch {
    return null;
  }
}
