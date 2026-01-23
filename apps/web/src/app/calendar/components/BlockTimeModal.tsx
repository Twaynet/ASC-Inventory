'use client';

import { useState, useEffect } from 'react';
import { createBlockTime, updateBlockTime, deleteBlockTime } from '@/lib/api';

// Simplified type for editing - we only need these fields
interface EditableBlockTime {
  id: string;
  durationMinutes: number;
  notes?: string | null;
}

interface BlockTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  roomId: string;
  roomName: string;
  date: string;
  editingBlockTime?: EditableBlockTime | null;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
];

export function BlockTimeModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  roomId,
  roomName,
  date,
  editingBlockTime,
}: BlockTimeModalProps) {
  const isEditing = !!editingBlockTime;
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync state when editingBlockTime changes
  useEffect(() => {
    if (editingBlockTime) {
      setDurationMinutes(editingBlockTime.durationMinutes);
      setNotes(editingBlockTime.notes || '');
    } else {
      setDurationMinutes(60);
      setNotes('');
    }
  }, [editingBlockTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (isEditing && editingBlockTime) {
        await updateBlockTime(token, editingBlockTime.id, {
          durationMinutes,
          notes: notes || null,
        });
      } else {
        await createBlockTime(token, {
          roomId,
          blockDate: date,
          durationMinutes,
          notes: notes || undefined,
        });
      }
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save block time');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBlockTime) return;
    if (!confirm('Are you sure you want to delete this block time?')) return;

    setIsSubmitting(true);
    setError('');

    try {
      await deleteBlockTime(token, editingBlockTime.id);
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block time');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDurationMinutes(60);
    setNotes('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Block Time' : 'Add Block Time'}</h2>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-info">
              <div className="info-item">
                <span className="info-label">Room:</span>
                <span className="info-value">{roomName}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Date:</span>
                <span className="info-value">{date}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="duration">Duration</label>
              <select
                id="duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                className="form-select"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes (optional)</label>
              <input
                type="text"
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Equipment setup, Room turnover"
                className="form-input"
              />
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            {isEditing && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete
              </button>
            )}
            <div className="footer-right">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add Block Time'}
              </button>
            </div>
          </div>
        </form>

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

          .modal-content {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--color-gray-200);
          }

          .modal-header h2 {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 600;
          }

          .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--color-gray-500);
            cursor: pointer;
            line-height: 1;
          }

          .modal-close:hover {
            color: var(--color-gray-700);
          }

          .modal-body {
            padding: 1.5rem;
          }

          .form-info {
            background: var(--color-gray-50);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
          }

          .info-item {
            display: flex;
            justify-content: space-between;
            font-size: 0.875rem;
          }

          .info-item + .info-item {
            margin-top: 0.5rem;
          }

          .info-label {
            color: var(--color-gray-600);
          }

          .info-value {
            font-weight: 500;
            color: var(--color-gray-900);
          }

          .form-group {
            margin-bottom: 1rem;
          }

          .form-group label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--color-gray-700);
            margin-bottom: 0.375rem;
          }

          .form-select,
          .form-input {
            width: 100%;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            border: 1px solid var(--color-gray-300);
            border-radius: 6px;
          }

          .form-select:focus,
          .form-input:focus {
            outline: none;
            border-color: var(--color-blue);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }

          .form-error {
            background: var(--color-red-50, #FEE2E2);
            color: var(--color-red-700, #B91C1C);
            padding: 0.75rem;
            border-radius: 6px;
            font-size: 0.875rem;
            margin-top: 1rem;
          }

          .modal-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-top: 1px solid var(--color-gray-200);
            background: var(--color-gray-50);
            border-radius: 0 0 12px 12px;
          }

          .footer-right {
            display: flex;
            gap: 0.5rem;
            margin-left: auto;
          }
        `}</style>
      </div>
    </div>
  );
}
