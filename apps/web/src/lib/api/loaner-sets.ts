/**
 * Loaner Sets API module
 * Wave 1: Financial Attribution - Loaner tracking
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export interface LoanerSet {
  id: string;
  vendorId: string;
  vendorName?: string;
  setIdentifier: string;
  description: string | null;
  caseId: string | null;
  caseName?: string | null;
  receivedAt: string;
  receivedByUserId: string;
  receivedByUserName?: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  returnedByUserId: string | null;
  returnedByUserName?: string | null;
  itemCount: number | null;
  notes: string | null;
  createdAt: string;
  isOpen: boolean;
  isOverdue: boolean;
}

export interface CreateLoanerSetRequest {
  vendorId: string;
  setIdentifier: string;
  description?: string;
  caseId?: string;
  receivedAt?: string;
  expectedReturnDate?: string;
  itemCount?: number;
  notes?: string;
}

export interface ReturnLoanerSetRequest {
  returnedAt?: string;
  notes?: string;
}

// ============================================================================
// Endpoints
// ============================================================================

export async function getLoanerSets(
  token: string,
  filters?: { vendorId?: string; caseId?: string; isOpen?: boolean; isOverdue?: boolean }
): Promise<{ loanerSets: LoanerSet[] }> {
  const params = new URLSearchParams();
  if (filters?.vendorId) params.set('vendorId', filters.vendorId);
  if (filters?.caseId) params.set('caseId', filters.caseId);
  if (filters?.isOpen !== undefined) params.set('isOpen', String(filters.isOpen));
  if (filters?.isOverdue !== undefined) params.set('isOverdue', String(filters.isOverdue));

  const queryString = params.toString();
  return request(`/loaner-sets${queryString ? `?${queryString}` : ''}`, { token });
}

export async function getOpenLoanerSets(
  token: string
): Promise<{ loanerSets: LoanerSet[] }> {
  return request('/loaner-sets/open', { token });
}

export async function getOverdueLoanerSets(
  token: string
): Promise<{ loanerSets: LoanerSet[] }> {
  return request('/loaner-sets/overdue', { token });
}

export async function getLoanerSet(
  token: string,
  loanerSetId: string
): Promise<{ loanerSet: LoanerSet }> {
  return request(`/loaner-sets/${loanerSetId}`, { token });
}

export async function createLoanerSet(
  token: string,
  data: CreateLoanerSetRequest
): Promise<{ loanerSet: LoanerSet }> {
  return request('/loaner-sets', { method: 'POST', body: data, token });
}

export async function returnLoanerSet(
  token: string,
  loanerSetId: string,
  data?: ReturnLoanerSetRequest
): Promise<{ loanerSet: LoanerSet | null; itemsReturned: number }> {
  return request(`/loaner-sets/${loanerSetId}/return`, {
    method: 'POST',
    body: data || {},
    token,
  });
}
