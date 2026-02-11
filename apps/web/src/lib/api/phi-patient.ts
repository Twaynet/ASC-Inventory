/**
 * PHI Patient API module — Phase 6A: Patient Identity Domain
 *
 * All endpoints require PHI_CLINICAL classification.
 * Write operations additionally require PHI_WRITE_CLINICAL capability (ADMIN only).
 * X-Access-Purpose: CLINICAL_CARE is auto-injected by client.ts for /phi-patient/* paths.
 */

import { request } from './client';
import type { Gender } from '@asc/domain';

// ============================================================================
// Types
// ============================================================================

export interface PatientIdentity {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn: string;
  gender: Gender;
}

export interface CreatePatientBody {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn: string;
  gender?: Gender;
}

export interface UpdatePatientBody {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  mrn?: string;
  gender?: Gender;
}

export interface PatientSearchParams {
  mrn?: string;
  lastName?: string;
  firstName?: string;
  dob?: string;
  dobYear?: string;
  limit?: number;
  offset?: number;
}

export interface PatientSearchResult {
  patients: PatientIdentity[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// API functions
// ============================================================================

/** Get patient identity linked to a surgical case */
export async function getPatientByCase(token: string, caseId: string): Promise<{ patient: PatientIdentity | null }> {
  return request<{ patient: PatientIdentity | null }>(`/phi-patient/by-case/${caseId}`, { token });
}

/** Lookup patient by MRN within the user's facility */
export async function lookupPatientByMrn(token: string, mrn: string): Promise<{ patient: PatientIdentity | null }> {
  return request<{ patient: PatientIdentity | null }>(`/phi-patient/lookup?mrn=${encodeURIComponent(mrn)}`, { token });
}

/** Search patients by combinable criteria (requires PHI_PATIENT_SEARCH) */
export async function searchPatients(token: string, params: PatientSearchParams): Promise<PatientSearchResult> {
  const qs = new URLSearchParams();
  if (params.mrn) qs.set('mrn', params.mrn);
  if (params.lastName) qs.set('lastName', params.lastName);
  if (params.firstName) qs.set('firstName', params.firstName);
  if (params.dob) qs.set('dob', params.dob);
  if (params.dobYear) qs.set('dobYear', params.dobYear);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  return request<PatientSearchResult>(`/phi-patient/search?${qs.toString()}`, { token });
}

/** Create a new patient identity record (requires PHI_WRITE_CLINICAL) */
export async function createPatient(token: string, body: CreatePatientBody): Promise<{ patient: PatientIdentity }> {
  return request<{ patient: PatientIdentity }>('/phi-patient', {
    method: 'POST',
    token,
    body,
  });
}

/** Update a patient identity record (requires PHI_WRITE_CLINICAL) */
export async function updatePatient(token: string, patientId: string, body: UpdatePatientBody): Promise<{ patient: PatientIdentity }> {
  return request<{ patient: PatientIdentity }>(`/phi-patient/${patientId}`, {
    method: 'PUT',
    token,
    body,
  });
}

/** Link or unlink a patient to a surgical case (requires PHI_WRITE_CLINICAL) */
export async function linkPatientToCase(token: string, caseId: string, patientId: string | null): Promise<{ linked: boolean }> {
  return request<{ linked: boolean }>(`/phi-patient/link-case/${caseId}`, {
    method: 'PUT',
    token,
    body: { patientId },
  });
}
