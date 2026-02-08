'use client';

import { useState, useCallback } from 'react';
import {
  getCaseDashboard,
  getCaseEventLog,
  getCaseCardLink,
  getCaseCards,
  getSurgeons,
  getConfigItems,
  getCaseChecklists,
  type CaseDashboardData,
  type CaseDashboardEventLogEntry,
  type CaseCardLinkData,
  type CaseCardSummary,
  type User,
  type ConfigItem,
  type CaseChecklistsResponse,
} from '@/lib/api';

export interface UseCaseDashboardDataResult {
  dashboard: CaseDashboardData | null;
  eventLog: CaseDashboardEventLogEntry[];
  caseCardLinkData: CaseCardLinkData | null;
  availableCaseCards: CaseCardSummary[];
  surgeons: User[];
  anesthesiaModalities: ConfigItem[];
  patientFlagOptions: ConfigItem[];
  checklists: CaseChecklistsResponse | null;
  isLoading: boolean;
  error: string;
  setError: (error: string) => void;
  loadData: () => Promise<void>;
}

export function useCaseDashboardData(
  token: string | null,
  caseId: string | null
): UseCaseDashboardDataResult {
  const [dashboard, setDashboard] = useState<CaseDashboardData | null>(null);
  const [eventLog, setEventLog] = useState<CaseDashboardEventLogEntry[]>([]);
  const [caseCardLinkData, setCaseCardLinkData] = useState<CaseCardLinkData | null>(null);
  const [availableCaseCards, setAvailableCaseCards] = useState<CaseCardSummary[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [anesthesiaModalities, setAnesthesiaModalities] = useState<ConfigItem[]>([]);
  const [patientFlagOptions, setPatientFlagOptions] = useState<ConfigItem[]>([]);
  const [checklists, setChecklists] = useState<CaseChecklistsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;

    setIsLoading(true);
    setError('');

    try {
      const [dashboardResult, eventLogResult, linkDataResult, caseCardsResult, surgeonsResult, configItemsResult, checklistsResult] = await Promise.all([
        getCaseDashboard(token, caseId),
        getCaseEventLog(token, caseId),
        getCaseCardLink(token, caseId).catch(() => ({ currentLink: null, history: [] })),
        getCaseCards(token, { status: 'ACTIVE' }),
        getSurgeons(token),
        getConfigItems(token),
        getCaseChecklists(token, caseId).catch(() => null), // Don't fail if checklists feature is disabled
      ]);

      setDashboard(dashboardResult.dashboard);
      setEventLog(eventLogResult.eventLog);
      setCaseCardLinkData(linkDataResult);
      setAvailableCaseCards(caseCardsResult.cards);
      setSurgeons(surgeonsResult.users);
      setChecklists(checklistsResult);

      // Set config items for dynamic lists
      const allItems = configItemsResult.items;
      setAnesthesiaModalities(allItems.filter(i => i.itemType === 'ANESTHESIA_MODALITY'));
      setPatientFlagOptions(allItems.filter(i => i.itemType === 'PATIENT_FLAG'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [token, caseId]);

  return {
    dashboard,
    eventLog,
    caseCardLinkData,
    availableCaseCards,
    surgeons,
    anesthesiaModalities,
    patientFlagOptions,
    checklists,
    isLoading,
    error,
    setError,
    loadData,
  };
}
