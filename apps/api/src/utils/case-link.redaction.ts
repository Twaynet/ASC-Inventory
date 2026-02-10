/**
 * Case-Link Redaction Utility
 *
 * PHI_ACCESS_AND_RETENTION_LAW — Phase 2: Normalized Redaction
 *
 * Provides a single, shared redaction schema for any case-linked reference.
 * Users without PHI_CLINICAL_ACCESS see operational data with case identifiers stripped.
 *
 * Rules:
 * - If user HAS PHI_CLINICAL_ACCESS → return full caseId
 * - If user LACKS PHI_CLINICAL_ACCESS → strip caseId, return { hasCase: true, redacted: true }
 * - Never return partial identifiers
 * - Never vary behavior by endpoint
 */

import type { Capability } from '@asc/domain';

// ============================================================================
// Types
// ============================================================================

export interface CaseLink {
  caseId?: string | null;
  hasCase: boolean;
  redacted: boolean;
}

// ============================================================================
// Core redaction function
// ============================================================================

/**
 * Redact a case identifier based on user capabilities.
 *
 * @param caseId - The raw caseId from the data source (may be null/undefined)
 * @param userCapabilities - The user's derived capabilities array
 * @returns A CaseLink object with appropriate redaction applied
 */
export function redactCaseLink(
  caseId: string | null | undefined,
  userCapabilities: Capability[]
): CaseLink {
  const hasCase = caseId != null && caseId !== '';

  if (!hasCase) {
    return { hasCase: false, redacted: false };
  }

  if (userCapabilities.includes('PHI_CLINICAL_ACCESS')) {
    return { caseId, hasCase: true, redacted: false };
  }

  return { hasCase: true, redacted: true };
}

/**
 * Check if the user has PHI clinical access capability.
 * Convenience function for routes that need a simple boolean check.
 */
export function hasPhiClinicalAccess(userCapabilities: Capability[]): boolean {
  return userCapabilities.includes('PHI_CLINICAL_ACCESS');
}
