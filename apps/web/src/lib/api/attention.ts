/**
 * Attention API module
 * Fetches derived-truth attention items (overdue loaners, expiring inventory).
 */

import { request } from './client';

// ============================================================================
// Types
// ============================================================================

export type AttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AttentionType =
  | 'LOANER_OVERDUE'
  | 'LOANER_DUE_SOON'
  | 'ITEM_EXPIRED'
  | 'ITEM_EXPIRING_SOON';

export interface AttentionItem {
  key: string;
  type: AttentionType;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  dueAt: string | null;
  deepLink: string;
  source: { entity: string; id: string };
}

export interface AttentionFilters {
  types?: AttentionType[];
  severity?: AttentionSeverity;
}

// ============================================================================
// API
// ============================================================================

export async function getAttention(
  token: string,
  filters?: AttentionFilters,
): Promise<{ items: AttentionItem[] }> {
  const params = new URLSearchParams();
  if (filters?.types?.length) {
    params.set('types', filters.types.join(','));
  }
  if (filters?.severity) {
    params.set('severity', filters.severity);
  }
  const qs = params.toString();
  const endpoint = `/attention${qs ? `?${qs}` : ''}`;
  return request<{ items: AttentionItem[] }>(endpoint, { token });
}
