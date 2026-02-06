/**
 * Vendor Repository Interface
 * Wave 1: Financial Attribution - Vendor management
 */

export type VendorType = 'MANUFACTURER' | 'DISTRIBUTOR' | 'LOANER_PROVIDER' | 'CONSIGNMENT';

export interface Vendor {
  id: string;
  facilityId: string;
  name: string;
  vendorType: VendorType;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVendorData {
  facilityId: string;
  name: string;
  vendorType: VendorType;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface UpdateVendorData {
  name?: string;
  vendorType?: VendorType;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface VendorFilters {
  vendorType?: VendorType;
  isActive?: boolean;
  search?: string;
}

export interface IVendorRepository {
  findById(id: string, facilityId: string): Promise<Vendor | null>;
  findByName(name: string, facilityId: string): Promise<Vendor | null>;
  findMany(facilityId: string, filters?: VendorFilters): Promise<Vendor[]>;
  create(data: CreateVendorData): Promise<Vendor>;
  update(id: string, facilityId: string, data: UpdateVendorData): Promise<Vendor | null>;
}
