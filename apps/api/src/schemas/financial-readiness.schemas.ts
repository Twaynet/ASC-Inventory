/**
 * Financial Readiness Zod Schemas (Phase 2)
 *
 * Validation for dashboard queries and financial event recording.
 * Reason codes are strictly validated against controlled lists.
 */

import { z } from 'zod';
import {
  ClinicFinancialState,
  AscFinancialState,
  OverrideState,
  FinancialRiskState,
  OverrideReasonCode,
  ClinicFinancialReasonCode,
  AscFinancialReasonCode,
} from '@asc/domain';

// Dashboard query
export const FinancialDashboardQuerySchema = z.object({
  riskState: FinancialRiskState.optional(),
  clinicId: z.string().uuid().optional(),
  surgeonId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type FinancialDashboardQuery = z.infer<typeof FinancialDashboardQuerySchema>;

// Record clinic financial declaration (admin-entered on behalf of clinic)
export const RecordClinicDeclarationSchema = z.object({
  state: ClinicFinancialState.exclude(['UNKNOWN']),
  reasonCodes: z.array(ClinicFinancialReasonCode).default([]),
  note: z.string().max(2000).optional(),
});
export type RecordClinicDeclaration = z.infer<typeof RecordClinicDeclarationSchema>;

// Record ASC financial verification
export const RecordAscVerificationSchema = z.object({
  state: AscFinancialState.exclude(['UNKNOWN']),
  reasonCodes: z.array(AscFinancialReasonCode).default([]),
  note: z.string().max(2000).optional(),
});
export type RecordAscVerification = z.infer<typeof RecordAscVerificationSchema>;

// Record financial override (state=NONE clears override)
export const RecordOverrideSchema = z.object({
  state: OverrideState,
  reasonCode: OverrideReasonCode.nullable().default(null),
  note: z.string().max(2000).optional(),
}).refine(
  d => (d.state === 'NONE') === (d.reasonCode === null),
  { message: 'reasonCode required when state is not NONE, and must be null when state is NONE' },
);
export type RecordOverride = z.infer<typeof RecordOverrideSchema>;
