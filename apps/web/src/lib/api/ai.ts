/**
 * AI API client — explanation-only endpoints.
 */

import { request } from './client';

export interface ExplainReadinessRequest {
  caseId: string;
  caseHeader: {
    caseNumber: string;
    procedureName: string;
    surgeonName: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    orRoom: string | null;
    status: string;
    isActive: boolean;
  };
  readinessSnapshot: {
    overall: 'READY' | 'BLOCKED' | 'UNKNOWN';
    blockers: {
      code: string;
      label: string;
      severity: 'warning' | 'critical';
      actionLabel: string;
      href: string;
      capability?: string;
    }[];
  };
}

export interface ExplainReadinessNextStep {
  label: string;
  why: string;
  action_href: string | null;
  requires: string | null;
}

export interface ExplainReadinessResponse {
  title: string;
  summary: string;
  next_steps: ExplainReadinessNextStep[];
  handoff: string;
  safety_note: string;
}

export async function explainReadiness(
  token: string,
  payload: ExplainReadinessRequest,
): Promise<ExplainReadinessResponse> {
  return request<ExplainReadinessResponse>('/ai/explain-readiness', {
    method: 'POST',
    body: payload,
    token,
  });
}
