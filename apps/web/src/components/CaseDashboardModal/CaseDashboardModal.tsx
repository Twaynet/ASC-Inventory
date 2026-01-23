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
    availableCaseCards,
    surgeons,
    anesthesiaModalities,
    patientFlagOptions,
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
    <div className="case-dashboard-modal-overlay" onClick={handleOverlayClick}>
      <div className="case-dashboard-modal-content" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="case-dashboard-modal-header">
          <h2>Case Dashboard</h2>
          <button className="modal-close-btn" onClick={onClose} title="Close (ESC)">
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="case-dashboard-modal-body">
          {isLoading ? (
            <div className="loading-state">Loading case dashboard...</div>
          ) : error && !dashboard ? (
            <div className="error-state">
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
              availableCaseCards={availableCaseCards}
              surgeons={surgeons}
              anesthesiaModalities={anesthesiaModalities}
              patientFlagOptions={patientFlagOptions}
              onClose={onClose}
              onDataChange={handleDataChange}
            />
          ) : (
            <div className="error-state">
              <div className="error-message">Case not found</div>
              <button onClick={onClose} className="btn-secondary">Close</button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .case-dashboard-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .case-dashboard-modal-content {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          width: 95%;
          max-width: 1200px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .case-dashboard-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
          flex-shrink: 0;
        }

        .case-dashboard-modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .modal-close-btn {
          background: none;
          border: none;
          font-size: 1.75rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          line-height: 1;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background-color 0.15s;
        }

        .modal-close-btn:hover {
          color: #111827;
          background: #e5e7eb;
        }

        .case-dashboard-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          color: #6b7280;
          font-size: 1rem;
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          gap: 1rem;
        }

        /* Ensure nested modals appear above this modal */
        :global(.case-dashboard-modal-body .modal-overlay) {
          z-index: 1100;
        }

        :global(.case-dashboard-modal-body .nested-modal) {
          z-index: 1100;
        }

        @media (max-width: 768px) {
          .case-dashboard-modal-overlay {
            padding: 0;
          }

          .case-dashboard-modal-content {
            width: 100%;
            max-width: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .case-dashboard-modal-body {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
