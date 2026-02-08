'use client';

import { useEffect, useCallback } from 'react';
import { useCaseDashboardData } from './useCaseDashboardData';
import { CaseDashboardContent } from './CaseDashboardContent';

export interface CaseDashboardModalProps {
  isOpen: boolean;
  caseId: string | null;
  token: string;
  user: {
    id: string;
    name: string;
    role: string;
    roles?: string[];
    facilityName?: string;
  };
  onClose: () => void;
  onSuccess?: () => void;
}

export function CaseDashboardModal({
  isOpen,
  caseId,
  token,
  user,
  onClose,
  onSuccess,
}: CaseDashboardModalProps) {
  const {
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
  } = useCaseDashboardData(token, caseId);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && caseId && token) {
      loadData();
    }
  }, [isOpen, caseId, token, loadData]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDataChange = useCallback(() => {
    loadData();
    onSuccess?.();
  }, [loadData, onSuccess]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !caseId) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 max-md:p-0"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-surface-primary rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.15)] w-[95%] max-w-[1200px] max-h-[90vh] flex flex-col overflow-hidden max-md:w-full max-md:max-w-full max-md:max-h-screen max-md:rounded-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-surface-secondary shrink-0">
          <h2 className="text-xl font-semibold text-text-primary">Case Dashboard</h2>
          <button
            className="bg-transparent border-none text-[1.75rem] cursor-pointer text-text-muted p-0 leading-none w-8 h-8 flex items-center justify-center rounded transition-colors hover:text-text-primary hover:bg-surface-tertiary"
            onClick={onClose}
            title="Close (ESC)"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 max-md:p-4 [&_.modal-overlay]:z-[1100] [&_.nested-modal]:z-[1100]">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px] text-text-muted">Loading case dashboard...</div>
          ) : error && !dashboard ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
              <div className="error-message">{error}</div>
              <button onClick={onClose} className="btn-secondary">Close</button>
            </div>
          ) : dashboard ? (
            <CaseDashboardContent
              caseId={caseId}
              token={token}
              user={user}
              dashboard={dashboard}
              eventLog={eventLog}
              caseCardLinkData={caseCardLinkData}
              availableCaseCards={availableCaseCards}
              surgeons={surgeons}
              anesthesiaModalities={anesthesiaModalities}
              patientFlagOptions={patientFlagOptions}
              checklists={checklists}
              onClose={onClose}
              onDataChange={handleDataChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
              <div className="error-message">Case not found</div>
              <button onClick={onClose} className="btn-secondary">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
