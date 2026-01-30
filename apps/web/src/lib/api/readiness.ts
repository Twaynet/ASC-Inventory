/**
 * Readiness API module
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface MissingItem {
  catalogId: string;
  catalogName: string;
  requiredQuantity: number;
  availableQuantity: number;
  reason: string;
}

export interface CaseReadiness {
  caseId: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  procedureName: string;
  surgeonId: string;
  surgeonName: string;
  readinessState: 'GREEN' | 'ORANGE' | 'RED';
  missingItems: MissingItem[];
  totalRequiredItems: number;
  totalVerifiedItems: number;
  hasAttestation: boolean;
  attestedAt: string | null;
  attestedByName: string | null;
  attestationId: string | null;
  hasSurgeonAcknowledgment: boolean;
  surgeonAcknowledgedAt: string | null;
  surgeonAcknowledgmentId: string | null;
  isActive: boolean;
  isCancelled: boolean;
}

export interface DayBeforeResponse {
  facilityId: string;
  facilityName: string;
  targetDate: string;
  cases: CaseReadiness[];
  summary: {
    total: number;
    green: number;
    orange: number;
    red: number;
    attested: number;
  };
}

export interface CalendarDaySummary {
  date: string;
  caseCount: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
}

export interface CalendarCaseSummary {
  caseId: string;
  caseNumber: string;
  scheduledDate: string;
  scheduledTime: string | null;
  procedureName: string;
  laterality: string | null;
  surgeonName: string;
  surgeonColor: string | null;
  readinessState: 'GREEN' | 'ORANGE' | 'RED';
  isActive: boolean;
  roomId: string | null;
  roomName: string | null;
}

export interface CalendarSummaryResponse {
  days?: CalendarDaySummary[];
  cases?: CalendarCaseSummary[];
}

export interface CreateAttestationRequest {
  caseId: string;
  type: 'CASE_READINESS' | 'SURGEON_ACKNOWLEDGMENT';
  notes?: string;
}

export interface AttestationResponse {
  id: string;
  caseId: string;
  type: string;
  attestedByUserId: string;
  attestedByName: string;
  readinessStateAtTime: string;
  notes: string | null;
  createdAt: string;
}

export interface VoidAttestationResponse {
  success: boolean;
  attestationId: string;
  voidedAt: string;
  voidedByUserId: string;
  voidedByName: string;
  reason: string | null;
}

export interface VerificationItem {
  id: string;
  barcode: string | null;
  serialNumber: string | null;
  locationName: string | null;
  sterilityStatus: string;
  sterilityExpiresAt: string | null;
  availabilityStatus: string;
  isReservedForThisCase: boolean;
  lastVerifiedAt: string | null;
  lastVerifiedByName: string | null;
  isVerified: boolean;
}

export interface VerificationRequirement {
  id: string;
  catalogId: string;
  catalogName: string;
  category: string;
  requiredQuantity: number;
  requiresSterility: boolean;
  availableCount: number;
  verifiedCount: number;
  suitableCount: number;
  isSatisfied: boolean;
  items: VerificationItem[];
}

export interface CaseVerificationResponse {
  caseId: string;
  procedureName: string;
  surgeonName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  requirements: VerificationRequirement[];
  summary: {
    totalRequirements: number;
    satisfiedRequirements: number;
    totalRequired: number;
    totalVerified: number;
    allSatisfied: boolean;
    readinessState: 'GREEN' | 'ORANGE' | 'RED';
  };
}

// ============================================================================
// Endpoints
// ============================================================================

// TODO(api-schema): needs Zod response schema
export async function getDayBeforeReadiness(
  token: string,
  date?: string,
  refresh?: boolean
): Promise<DayBeforeResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (refresh) params.set('refresh', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/readiness/day-before${query}`, { token });
}

// TODO(api-schema): needs Zod response schema
export async function getCalendarSummary(
  token: string,
  startDate: string,
  endDate: string,
  granularity: 'day' | 'case'
): Promise<CalendarSummaryResponse> {
  const params = new URLSearchParams({ startDate, endDate, granularity });
  return request(`/readiness/calendar-summary?${params.toString()}`, { token });
}

// TODO(api-schema): needs Zod request + response schema
export async function createAttestation(
  token: string,
  data: CreateAttestationRequest
): Promise<AttestationResponse> {
  return request('/readiness/attestations', { method: 'POST', body: data, token });
}

// TODO(api-schema): needs Zod request + response schema
export async function voidAttestation(
  token: string,
  attestationId: string,
  reason?: string
): Promise<VoidAttestationResponse> {
  return request(`/readiness/attestations/${attestationId}/void`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

// TODO(api-schema): needs Zod request + response schema
export async function refreshReadiness(token: string, date?: string): Promise<void> {
  await request('/readiness/refresh', { method: 'POST', body: { date }, token });
}

// TODO(api-schema): needs Zod response schema
export async function getCaseVerification(
  token: string,
  caseId: string
): Promise<CaseVerificationResponse> {
  return request(`/readiness/cases/${caseId}/verification`, { token });
}
