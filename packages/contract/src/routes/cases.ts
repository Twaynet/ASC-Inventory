/**
 * Case route contracts.
 *
 * Wire-format schemas matching the actual JSON responses from the API.
 */

import { z } from 'zod';
import { CaseStatus } from '@asc/domain';
import { defineRoute } from '../define-route.js';

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();

/** Case object as returned by the API (JSON wire format). */
export const CaseApiSchema = z.object({
  id: z.string().uuid(),
  caseNumber: z.string(),
  facilityId: z.string().uuid(),
  scheduledDate: nullableString,
  scheduledTime: nullableString,
  requestedDate: nullableString,
  requestedTime: nullableString,
  surgeonId: z.string().uuid(),
  surgeonName: z.string(),
  procedureName: z.string(),
  preferenceCardVersionId: nullableString,
  status: CaseStatus,
  notes: nullableString,
  isActive: z.boolean(),
  activatedAt: nullableString,
  activatedByUserId: nullableString,
  isCancelled: z.boolean(),
  cancelledAt: nullableString,
  cancelledByUserId: nullableString,
  rejectedAt: nullableString,
  rejectedByUserId: nullableString,
  rejectionReason: nullableString,
  preopCheckedInAt: nullableString,
  preopCheckedInByUserId: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
  roomId: nullableString,
  roomName: nullableString,
  estimatedDurationMinutes: z.number().nullable(),
  sortOrder: z.number().nullable(),
  // PHI Phase 1: Case attribution
  primaryOrganizationId: nullableString,
});
export type CaseApi = z.infer<typeof CaseApiSchema>;

// ---------------------------------------------------------------------------
// Query / body schemas
// ---------------------------------------------------------------------------

export const CaseListQuerySchema = z.object({
  date: z.string().optional(),
  status: z.string().optional(),
  active: z.string().optional(),
  search: z.string().optional(),
});

export const UpdateCaseBodySchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  surgeonId: z.string().uuid().optional(),
  procedureName: z.string().min(1).max(255).optional(),
  preferenceCardVersionId: z.string().uuid().nullable().optional(),
  status: CaseStatus.optional(),
  notes: z.string().nullable().optional(),
});

export const ApproveCaseBodySchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  roomId: z.string().uuid().nullable().optional(),
  estimatedDurationMinutes: z.number().int().min(15).max(720).optional(),
});

export const RejectCaseBodySchema = z.object({
  reason: z.string().min(1).max(500),
});

export const AssignRoomBodySchema = z.object({
  roomId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  estimatedDurationMinutes: z.number().int().min(15).max(720).optional(),
});

export const CreateCaseBodySchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  requestedTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  surgeonId: z.string().uuid(),
  procedureName: z.string().min(1).max(255),
  preferenceCardId: z.string().uuid().optional(),
  notes: z.string().optional(),
  status: z.enum(['REQUESTED', 'SCHEDULED']).optional(),
  // PHI Phase 1: Primary organization attribution (defaults to facility ASC org)
  primaryOrganizationId: z.string().uuid().optional(),
});

export const ActivateCaseBodySchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
});

export const CancelCaseBodySchema = z.object({
  reason: z.string().optional(),
});

/** Status event from the append-only audit trail. */
export const StatusEventApiSchema = z.object({
  id: z.string().uuid(),
  surgicalCaseId: z.string().uuid(),
  fromStatus: nullableString,
  toStatus: z.string(),
  reason: nullableString,
  context: z.unknown().nullable(),
  actorUserId: z.string().uuid(),
  actorName: z.string(),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

const CaseResponsePayload = z.object({ case: CaseApiSchema });
const CaseListResponsePayload = z.object({ cases: z.array(CaseApiSchema) });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const caseIdParams = z.object({ caseId: z.string().uuid() });

export const caseRoutes = {
  list: defineRoute({
    method: 'GET' as const,
    path: '/cases',
    summary: 'List cases with optional filters',
    query: CaseListQuerySchema,
    response: CaseListResponsePayload,
  }),

  get: defineRoute({
    method: 'GET' as const,
    path: '/cases/:caseId',
    summary: 'Get a single case by ID',
    params: caseIdParams,
    response: CaseResponsePayload,
  }),

  create: defineRoute({
    method: 'POST' as const,
    path: '/cases',
    summary: 'Create a new surgical case',
    body: CreateCaseBodySchema,
    response: CaseResponsePayload,
  }),

  update: defineRoute({
    method: 'PATCH' as const,
    path: '/cases/:caseId',
    summary: 'Update case fields',
    params: caseIdParams,
    body: UpdateCaseBodySchema,
    response: CaseResponsePayload,
  }),

  approve: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/approve',
    summary: 'Approve a requested case',
    params: caseIdParams,
    body: ApproveCaseBodySchema,
    response: CaseResponsePayload,
  }),

  reject: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/reject',
    summary: 'Reject a requested case',
    params: caseIdParams,
    body: RejectCaseBodySchema,
    response: CaseResponsePayload,
  }),

  assignRoom: defineRoute({
    method: 'PATCH' as const,
    path: '/cases/:caseId/assign-room',
    summary: 'Assign or unassign a room for a case',
    params: caseIdParams,
    body: AssignRoomBodySchema,
    response: CaseResponsePayload,
  }),

  activate: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/activate',
    summary: 'Activate a case for the OR day',
    params: caseIdParams,
    body: ActivateCaseBodySchema,
    response: CaseResponsePayload,
  }),

  deactivate: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/deactivate',
    summary: 'Deactivate an active case',
    params: caseIdParams,
    response: CaseResponsePayload,
  }),

  cancel: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/cancel',
    summary: 'Cancel a case',
    params: caseIdParams,
    body: CancelCaseBodySchema,
    response: CaseResponsePayload,
  }),

  checkInPreop: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/check-in-preop',
    summary: 'Check patient in to preoperative area',
    params: caseIdParams,
    response: CaseResponsePayload,
  }),

  statusEvents: defineRoute({
    method: 'GET' as const,
    path: '/cases/:caseId/status-events',
    summary: 'Get status change audit trail for a case',
    params: caseIdParams,
    response: z.array(StatusEventApiSchema),
  }),
};
