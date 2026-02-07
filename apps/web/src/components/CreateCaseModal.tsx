'use client';

import { useState, useEffect } from 'react';
import { createCase, getSurgeons, type User } from '@/lib/api';
import { TimeSelect } from './TimeSelect';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.15)] w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        {showSuccess ? (
          <>
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h2 className="m-0 text-xl font-semibold text-text-primary">Request Submitted</h2>
              <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={handleClose}>
                &times;
              </button>
            </div>
            <div className="py-8 px-6 text-center">
              <div className="mb-4">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3 className="m-0 mb-2 text-xl text-text-primary">Sent to Admin Case Request</h3>
              <p className="m-0 mb-6 text-text-muted text-[0.9375rem]">Your case request has been submitted and is awaiting admin review.</p>
              <button className="btn btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h2 className="m-0 text-xl font-semibold text-text-primary">Create Case</h2>
              <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={handleClose}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-[var(--color-red-50)] border border-[var(--color-red-200)] text-[var(--color-red-700)] p-3 rounded-md mb-4">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="surgeonId">Surgeon*</label>
            {isLoadingSurgeons ? (
              <div className="p-2 text-text-muted">Loading surgeons...</div>
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

          <div className="grid grid-cols-2 gap-4">
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
              <TimeSelect
                id="requestedTime"
                value={formData.requestedTime}
                onChange={(value) => setFormData({ ...formData, requestedTime: value })}
                startHour={6}
                endHour={18}
              />
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

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
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
    </div>
  );
}
