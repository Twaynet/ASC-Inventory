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
  createdAt: z.string(),
  updatedAt: z.string(),
  roomId: nullableString,
  roomName: nullableString,
  estimatedDurationMinutes: z.number().nullable(),
  sortOrder: z.number().nullable(),
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

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

const CaseResponsePayload = z.object({ case: CaseApiSchema });
const CaseListResponsePayload = z.object({ cases: z.array(CaseApiSchema) });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

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
    params: z.object({ caseId: z.string().uuid() }),
    response: CaseResponsePayload,
  }),

  update: defineRoute({
    method: 'PATCH' as const,
    path: '/cases/:caseId',
    summary: 'Update case fields',
    params: z.object({ caseId: z.string().uuid() }),
    body: UpdateCaseBodySchema,
    response: CaseResponsePayload,
  }),

  approve: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/approve',
    summary: 'Approve a requested case',
    params: z.object({ caseId: z.string().uuid() }),
    body: ApproveCaseBodySchema,
    response: CaseResponsePayload,
  }),

  reject: defineRoute({
    method: 'POST' as const,
    path: '/cases/:caseId/reject',
    summary: 'Reject a requested case',
    params: z.object({ caseId: z.string().uuid() }),
    body: RejectCaseBodySchema,
    response: CaseResponsePayload,
  }),

  assignRoom: defineRoute({
    method: 'PATCH' as const,
    path: '/cases/:caseId/assign-room',
    summary: 'Assign or unassign a room for a case',
    params: z.object({ caseId: z.string().uuid() }),
    body: AssignRoomBodySchema,
    response: CaseResponsePayload,
  }),
};
