/**
 * Operations Health route contracts.
 */

import { z } from 'zod';
import { defineRoute } from '../define-route.js';

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const MissingHealthSchema = z.object({
  openCount: z.number(),
  over7Days: z.number(),
  over30Days: z.number(),
  resolutionRate30d: z.number(),
});

const FinancialHealthSchema = z.object({
  overrideCount30d: z.number(),
  gratisCount30d: z.number(),
});

const DeviceHealthSchema = z.object({
  totalEvents7d: z.number(),
  errorEvents7d: z.number(),
  errorRate7d: z.number(),
});

const CaseThroughputSchema = z.object({
  completed30d: z.number(),
  canceled30d: z.number(),
});

const OperationsHealthSummarySchema = z.object({
  missing: MissingHealthSchema,
  financial: FinancialHealthSchema,
  devices: DeviceHealthSchema,
  cases: CaseThroughputSchema,
});

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const HealthSummaryQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const operationsRoutes = {
  healthSummary: defineRoute({
    method: 'GET' as const,
    path: '/operations/health-summary',
    summary: 'Aggregated operational health metrics',
    query: HealthSummaryQuerySchema,
    response: OperationsHealthSummarySchema,
  }),
};
