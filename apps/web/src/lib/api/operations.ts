/**
 * Operations Health API module
 */

import { callContract } from './contract-client';
import { contract } from '@asc/contract';

export interface OperationsHealthSummary {
  missing: {
    openCount: number;
    over7Days: number;
    over30Days: number;
    resolutionRate30d: number;
  };
  financial: {
    overrideCount30d: number;
    gratisCount30d: number;
  };
  devices: {
    totalEvents7d: number;
    errorEvents7d: number;
    errorRate7d: number;
  };
  cases: {
    completed30d: number;
    canceled30d: number;
  };
}

export async function getOperationsHealthSummary(
  token: string,
  params: { start?: string; end?: string } = {},
): Promise<OperationsHealthSummary> {
  return callContract(contract.operations.healthSummary, {
    query: params,
    token,
  }) as Promise<OperationsHealthSummary>;
}
