/**
 * Loaner Set Repository Interface
 * Wave 1: Financial Attribution - Loaner tracking
 */

export interface LoanerSet {
  id: string;
  facilityId: string;
  vendorId: string;
  vendorName?: string;
  setIdentifier: string;
  description: string | null;
  caseId: string | null;
  caseName?: string | null;
  receivedAt: Date;
  receivedByUserId: string;
  receivedByUserName?: string;
  expectedReturnDate: Date | null;
  returnedAt: Date | null;
  returnedByUserId: string | null;
  returnedByUserName?: string | null;
  itemCount: number | null;
  notes: string | null;
  createdAt: Date;
}

export interface CreateLoanerSetData {
  facilityId: string;
  vendorId: string;
  setIdentifier: string;
  description?: string | null;
  caseId?: string | null;
  receivedAt: Date;
  receivedByUserId: string;
  expectedReturnDate?: Date | null;
  itemCount?: number | null;
  notes?: string | null;
}

export interface MarkLoanerSetReturnedData {
  returnedAt: Date;
  returnedByUserId: string;
  notes?: string | null;
}

export interface LoanerSetFilters {
  vendorId?: string;
  caseId?: string;
  isOpen?: boolean;
  isOverdue?: boolean;
}

export interface ILoanerSetRepository {
  findById(id: string, facilityId: string): Promise<LoanerSet | null>;
  findMany(facilityId: string, filters?: LoanerSetFilters): Promise<LoanerSet[]>;
  findOpenSets(facilityId: string): Promise<LoanerSet[]>;
  findOverdueSets(facilityId: string): Promise<LoanerSet[]>;
  create(data: CreateLoanerSetData): Promise<LoanerSet>;
  markReturned(id: string, facilityId: string, data: MarkLoanerSetReturnedData): Promise<LoanerSet | null>;
}
