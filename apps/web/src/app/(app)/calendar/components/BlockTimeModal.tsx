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
      setError(err instanceof Error ? err.message : 'Failed to save time slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBlockTime) return;
    if (!confirm('Are you sure you want to delete this time slot?')) return;

    setIsSubmitting(true);
    setError('');

    try {
      await deleteBlockTime(token, editingBlockTime.id);
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete time slot');
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
    <div className="fixed inset-0 bg-[var(--shadow-overlay)] flex items-center justify-center z-[1000]" onClick={handleClose}>
      <div className="bg-surface-primary rounded-xl w-[90%] max-w-[400px] shadow-[0_20px_40px_var(--shadow-md)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h2 className="m-0 text-lg font-semibold">{isEditing ? 'Edit Time Slot' : 'Add Time Slot'}</h2>
          <button className="bg-transparent border-none text-2xl text-text-muted cursor-pointer leading-none hover:text-text-primary" onClick={handleClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <div className="bg-surface-secondary rounded-lg p-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Room:</span>
                <span className="font-medium text-text-primary">{roomName}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-text-muted">Date:</span>
                <span className="font-medium text-text-primary">{date}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="duration">Duration</label>
              <select
                id="duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
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
              />
            </div>

            {error && <div className="bg-[var(--color-red-50)] text-[var(--color-red-700)] p-3 rounded-md text-sm mt-4">{error}</div>}
          </div>

          <div className="flex justify-between items-center px-6 py-4 border-t border-border bg-surface-secondary rounded-b-xl">
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
            <div className="flex gap-2 ml-auto">
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
                {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add Time Slot'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
