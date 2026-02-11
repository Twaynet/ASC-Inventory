/**
 * Surgery Request API Schemas (Phase 1 Readiness)
 *
 * Zod schemas for clinic submission and ASC admin review endpoints.
 */

import { z } from 'zod';
import {
  SurgeryRequestStatus,
  SurgeryRequestReasonCode,
} from '@asc/domain';

// ============================================================================
// CLINIC SUBMISSION
// ============================================================================

export const ClinicChecklistResponseSchema = z.object({
  itemKey: z.string().min(1).max(255),
  response: z.record(z.unknown()),
});

export const ClinicPatientSchema = z.object({
  clinicPatientKey: z.string().min(1).max(255),
  displayName: z.string().max(500).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
});

export const ClinicChecklistSchema = z.object({
  templateVersionId: z.string().uuid(),
  responses: z.array(ClinicChecklistResponseSchema).min(1),
});

export const ClinicSubmitRequestSchema = z.object({
  targetFacilityId: z.string().uuid(),
  sourceRequestId: z.string().min(1).max(255),
  submittedAt: z.string().datetime(),
  procedureName: z.string().min(1).max(255),
  surgeonId: z.string().uuid().optional(),
  surgeonUsername: z.string().max(100).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  patient: ClinicPatientSchema,
  checklist: ClinicChecklistSchema.optional(),
});
export type ClinicSubmitRequest = z.infer<typeof ClinicSubmitRequestSchema>;

export const ClinicListQuerySchema = z.object({
  status: SurgeryRequestStatus.optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ClinicListQuery = z.infer<typeof ClinicListQuerySchema>;

// ============================================================================
// ASC ADMIN ACTIONS
// ============================================================================

export const AdminReturnRequestSchema = z.object({
  reasonCode: SurgeryRequestReasonCode,
  note: z.string().max(2000).optional(),
});
export type AdminReturnRequest = z.infer<typeof AdminReturnRequestSchema>;

export const AdminAcceptRequestSchema = z.object({
  note: z.string().max(2000).optional(),
});
export type AdminAcceptRequest = z.infer<typeof AdminAcceptRequestSchema>;

export const AdminRejectRequestSchema = z.object({
  reasonCode: SurgeryRequestReasonCode,
  note: z.string().max(2000).optional(),
});
export type AdminRejectRequest = z.infer<typeof AdminRejectRequestSchema>;

export const AdminListQuerySchema = z.object({
  status: SurgeryRequestStatus.optional(),
  clinicId: z.string().uuid().optional(),
  surgeonId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;
