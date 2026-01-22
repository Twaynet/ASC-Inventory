'use client';

import { useState, useEffect } from 'react';
import { createCase, getSurgeons, type User } from '@/lib/api';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  defaultDate?: string;
}

export function CreateCaseModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  defaultDate,
}: CreateCaseModalProps) {
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [isLoadingSurgeons, setIsLoadingSurgeons] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState({
    surgeonId: '',
    procedureName: '',
    requestedDate: defaultDate || '',
    requestedTime: '',
    notes: '',
  });

  // Load surgeons when modal opens
  useEffect(() => {
    if (isOpen && surgeons.length === 0) {
      setIsLoadingSurgeons(true);
      getSurgeons(token)
        .then((result) => {
          setSurgeons(result.users);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load surgeons');
        })
        .finally(() => {
          setIsLoadingSurgeons(false);
        });
    }
  }, [isOpen, token, surgeons.length]);

  // Update date when defaultDate changes
  useEffect(() => {
    if (defaultDate) {
      setFormData((prev) => ({ ...prev, requestedDate: defaultDate }));
    }
  }, [defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsSubmitting(true);
    setError('');

    try {
      const caseData: Record<string, string> = {
        surgeonId: formData.surgeonId,
        procedureName: formData.procedureName,
      };
      if (formData.requestedDate) {
        caseData.requestedDate = formData.requestedDate;
      }
      if (formData.requestedTime) {
        caseData.requestedTime = formData.requestedTime;
      }
      if (formData.notes) {
        caseData.notes = formData.notes;
      }

      await createCase(token, caseData);

      // Show success state
      setShowSuccess(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setShowSuccess(false);
    // Reset form
    setFormData({
      surgeonId: '',
      procedureName: '',
      requestedDate: defaultDate || '',
      requestedTime: '',
      notes: '',
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        {showSuccess ? (
          <>
            <div className="modal-header">
              <h2>Request Submitted</h2>
              <button className="modal-close" onClick={handleClose}>
                &times;
              </button>
            </div>
            <div className="success-content">
              <div className="success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3>Sent to Admin Case Request</h3>
              <p>Your case request has been submitted and is awaiting admin review.</p>
              <button className="btn btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <h2>Create Case</h2>
              <button className="modal-close" onClick={handleClose}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="form">
          {error && (
            <div className="form-error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="surgeonId">Surgeon*</label>
            {isLoadingSurgeons ? (
              <div style={{ padding: '0.5rem', color: '#6b7280' }}>Loading surgeons...</div>
            ) : (
              <select
                id="surgeonId"
                value={formData.surgeonId}
                onChange={(e) => setFormData({ ...formData, surgeonId: e.target.value })}
                required
              >
                <option value="">Select surgeon</option>
                {surgeons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="procedureName">Procedure Name*</label>
            <input
              id="procedureName"
              type="text"
              value={formData.procedureName}
              onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
              required
              placeholder="e.g., Total Hip Replacement"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="requestedDate">Requested Date</label>
              <input
                id="requestedDate"
                type="date"
                value={formData.requestedDate}
                onChange={(e) => setFormData({ ...formData, requestedDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="requestedTime">Requested Time (24h)</label>
              <select
                id="requestedTime"
                value={formData.requestedTime}
                onChange={(e) => setFormData({ ...formData, requestedTime: e.target.value })}
              >
                <option value="">Select time</option>
                {Array.from({ length: 24 * 4 }, (_, i) => {
                  const hour = Math.floor(i / 4);
                  const minute = (i % 4) * 15;
                  const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                  return (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes..."
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Case'}
            </button>
          </div>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
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
        }

        .modal {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          line-height: 1;
        }

        .modal-close:hover {
          color: #111827;
        }

        .form {
          padding: 1.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #374151;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 1rem;
          background: white;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 0.75rem;
          border-radius: 6px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
          margin-top: 1rem;
        }

        .btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          font-size: 0.875rem;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .success-content {
          padding: 2rem 1.5rem;
          text-align: center;
        }

        .success-icon {
          margin-bottom: 1rem;
        }

        .success-content h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          color: #111827;
        }

        .success-content p {
          margin: 0 0 1.5rem 0;
          color: #6b7280;
          font-size: 0.9375rem;
        }
      `}</style>
    </div>
  );
}
