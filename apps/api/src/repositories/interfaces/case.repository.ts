/**
 * Case Repository Interface
 * Abstracts surgical case persistence
 */

export interface SurgicalCase {
  id: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  surgeonId: string;
  surgeonName?: string;
  procedureName: string;
  preferenceCardVersionId: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  isActive: boolean;
  activatedAt: Date | null;
  activatedByUserId: string | null;
  isCancelled: boolean;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseRequirement {
  id: string;
  caseId: string;
  catalogId: string;
  catalogName?: string;
  quantity: number;
  isSurgeonOverride: boolean;
  notes: string | null;
}

export interface CreateCaseData {
  facilityId: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  surgeonId: string;
  procedureName: string;
  preferenceCardVersionId?: string | null;
  notes?: string | null;
}

export interface UpdateCaseData {
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  surgeonId?: string;
  procedureName?: string;
  preferenceCardVersionId?: string | null;
  status?: SurgicalCase['status'];
  notes?: string | null;
}

export interface ActivateCaseData {
  scheduledDate: string;
  scheduledTime?: string | null;
}

export interface CaseFilters {
  date?: string;
  status?: string;
  active?: boolean;
  surgeonId?: string;
}

export interface RequirementItem {
  catalogId: string;
  quantity: number;
  notes?: string | null;
}

export interface ICaseRepository {
  // Case queries
  findById(id: string, facilityId: string): Promise<SurgicalCase | null>;
  findMany(facilityId: string, filters?: CaseFilters): Promise<SurgicalCase[]>;

  // Case mutations
  create(data: CreateCaseData): Promise<SurgicalCase>;
  update(id: string, facilityId: string, data: UpdateCaseData): Promise<SurgicalCase | null>;
  activate(id: string, facilityId: string, userId: string, data: ActivateCaseData): Promise<SurgicalCase | null>;
  deactivate(id: string, facilityId: string): Promise<SurgicalCase | null>;
  cancel(id: string, facilityId: string, userId: string, reason?: string): Promise<SurgicalCase | null>;

  // Requirement operations
  getRequirements(caseId: string): Promise<CaseRequirement[]>;
  setRequirements(caseId: string, items: RequirementItem[], isSurgeonOverride: boolean): Promise<void>;
  clearNonOverrideRequirements(caseId: string): Promise<void>;
  copyRequirementsFromVersion(caseId: string, versionId: string): Promise<void>;

  // Validation helpers
  getSurgeonId(caseId: string, facilityId: string): Promise<string | null>;
  getStatus(id: string, facilityId: string): Promise<{ isActive: boolean; isCancelled: boolean; status: string } | null>;
}
