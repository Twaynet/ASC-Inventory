/**
 * Vendors API module
 * Wave 1: Financial Attribution - Vendor management
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export type VendorType = 'MANUFACTURER' | 'DISTRIBUTOR' | 'LOANER_PROVIDER' | 'CONSIGNMENT';

export interface Vendor {
  id: string;
  name: string;
  vendorType: VendorType;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorRequest {
  name: string;
  vendorType: VendorType;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export interface UpdateVendorRequest {
  name?: string;
  vendorType?: VendorType;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

// ============================================================================
// Endpoints
// ============================================================================

export async function getVendors(
  token: string,
  filters?: { vendorType?: VendorType; isActive?: boolean; search?: string }
): Promise<{ vendors: Vendor[] }> {
  const params = new URLSearchParams();
  if (filters?.vendorType) params.set('vendorType', filters.vendorType);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.search) params.set('search', filters.search);

  const queryString = params.toString();
  return request(`/vendors${queryString ? `?${queryString}` : ''}`, { token });
}

export async function getVendor(
  token: string,
  vendorId: string
): Promise<{ vendor: Vendor }> {
  return request(`/vendors/${vendorId}`, { token });
}

export async function createVendor(
  token: string,
  data: CreateVendorRequest
): Promise<{ vendor: Vendor }> {
  return request('/vendors', { method: 'POST', body: data, token });
}

export async function updateVendor(
  token: string,
  vendorId: string,
  data: UpdateVendorRequest
): Promise<{ vendor: Vendor }> {
  return request(`/vendors/${vendorId}`, { method: 'PATCH', body: data, token });
}
