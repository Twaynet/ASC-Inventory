'use client';

import { useState, useCallback } from 'react';
import {
  getCaseDashboard,
  getCaseEventLog,
  getCaseCards,
  getSurgeons,
  getConfigItems,
  type CaseDashboardData,
  type CaseDashboardEventLogEntry,
  type CaseCardSummary,
  type User,
  type ConfigItem,
} from '@/lib/api';

export interface UseCaseDashboardDataResult {
  dashboard: CaseDashboardData | null;
  eventLog: CaseDashboardEventLogEntry[];
  availableCaseCards: CaseCardSummary[];
  surgeons: User[];
  anesthesiaModalities: ConfigItem[];
  patientFlagOptions: ConfigItem[];
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
  const [availableCaseCards, setAvailableCaseCards] = useState<CaseCardSummary[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [anesthesiaModalities, setAnesthesiaModalities] = useState<ConfigItem[]>([]);
  const [patientFlagOptions, setPatientFlagOptions] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;

    setIsLoading(true);
    setError('');

    try {
      const [dashboardResult, eventLogResult, caseCardsResult, surgeonsResult, configItemsResult] = await Promise.all([
        getCaseDashboard(token, caseId),
        getCaseEventLog(token, caseId),
        getCaseCards(token, { status: 'ACTIVE' }),
        getSurgeons(token),
        getConfigItems(token),
      ]);

      setDashboard(dashboardResult.dashboard);
      setEventLog(eventLogResult.eventLog);
      setAvailableCaseCards(caseCardsResult.cards);
      setSurgeons(surgeonsResult.users);

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
    availableCaseCards,
    surgeons,
    anesthesiaModalities,
    patientFlagOptions,
    isLoading,
    error,
    setError,
    loadData,
  };
}
