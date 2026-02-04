/**
 * Case Repository Interface
 * Abstracts surgical case persistence
 */

export interface SurgicalCase {
  id: string;
  caseNumber: string;
  facilityId: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  surgeonId: string;
  surgeonName?: string;
  procedureName: string;
  preferenceCardVersionId: string | null;
  status: 'DRAFT' | 'REQUESTED' | 'SCHEDULED' | 'IN_PREOP' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  notes: string | null;
  isActive: boolean;
  activatedAt: Date | null;
  activatedByUserId: string | null;
  isCancelled: boolean;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  // PreOp tracking
  preopCheckedInAt: Date | null;
  preopCheckedInByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Room scheduling fields
  roomId: string | null;
  roomName?: string | null;
  estimatedDurationMinutes: number;
  sortOrder: number;
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
  requestedDate?: string | null;
  requestedTime?: string | null;
  surgeonId: string;
  procedureName: string;
  preferenceCardVersionId?: string | null;
  notes?: string | null;
  /** Optional status override - defaults to REQUESTED. Admin/Scheduler can use SCHEDULED for direct scheduling */
  status?: 'REQUESTED' | 'SCHEDULED';
}

export interface UpdateCaseData {
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  surgeonId?: string;
  procedureName?: string;
  preferenceCardVersionId?: string | null;
  status?: SurgicalCase['status'];
  notes?: string | null;
  // Room scheduling fields
  roomId?: string | null;
  estimatedDurationMinutes?: number;
  sortOrder?: number;
}

export interface ActivateCaseData {
  scheduledDate: string;
  scheduledTime?: string | null;
}

export interface ApproveCaseData {
  scheduledDate: string;
  scheduledTime?: string | null;
  roomId?: string | null;
  estimatedDurationMinutes?: number;
}

export interface RejectCaseData {
  reason: string;
}

export interface CaseFilters {
  date?: string;
  status?: string;
  active?: boolean;
  surgeonId?: string;
  search?: string; // Search by case_number, surgeon name, or procedure name
}

export interface RequirementItem {
  catalogId: string;
  quantity: number;
  notes?: string | null;
}

export interface ICaseRepository {
  // Case queries
  findById(id: string, facilityId: string): Promise<SurgicalCase | null>;
  findByCaseNumber(caseNumber: string, facilityId: string): Promise<SurgicalCase | null>;
  findMany(facilityId: string, filters?: CaseFilters): Promise<SurgicalCase[]>;

  // Case mutations
  create(data: CreateCaseData): Promise<SurgicalCase>;
  update(id: string, facilityId: string, data: UpdateCaseData, actorUserId?: string): Promise<SurgicalCase | null>;
  activate(id: string, facilityId: string, userId: string, data: ActivateCaseData): Promise<SurgicalCase | null>;
  approve(id: string, facilityId: string, userId: string, data: ApproveCaseData): Promise<SurgicalCase | null>;
  reject(id: string, facilityId: string, userId: string, data: RejectCaseData): Promise<SurgicalCase | null>;
  deactivate(id: string, facilityId: string, userId: string): Promise<SurgicalCase | null>;
  cancel(id: string, facilityId: string, userId: string, reason?: string): Promise<SurgicalCase | null>;
  checkInPreop(id: string, facilityId: string, userId: string): Promise<SurgicalCase | null>;

  // Requirement operations
  getRequirements(caseId: string): Promise<CaseRequirement[]>;
  setRequirements(caseId: string, items: RequirementItem[], isSurgeonOverride: boolean): Promise<void>;
  clearNonOverrideRequirements(caseId: string): Promise<void>;
  copyRequirementsFromVersion(caseId: string, versionId: string): Promise<void>;

  // Validation helpers
  getSurgeonId(caseId: string, facilityId: string): Promise<string | null>;
  getStatus(id: string, facilityId: string): Promise<{ isActive: boolean; isCancelled: boolean; status: string } | null>;
}
