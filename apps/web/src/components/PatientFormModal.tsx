'use client';

import { useState } from 'react';
import {
  createPatient,
  updatePatient,
  type PatientIdentity,
  type CreatePatientBody,
} from '@/lib/api/phi-patient';
import { GENDER_VALUES, type Gender } from '@asc/domain';

interface PatientFormModalProps {
  token: string;
  /** If provided, form is in edit mode */
  patient?: PatientIdentity;
  onSaved: (patient: PatientIdentity) => void;
  onClose: () => void;
}

export function PatientFormModal({
  token,
  patient,
  onSaved,
  onClose,
}: PatientFormModalProps) {
  const isEdit = !!patient;

  const [firstName, setFirstName] = useState(patient?.firstName ?? '');
  const [lastName, setLastName] = useState(patient?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(patient?.dateOfBirth ?? '');
  const [mrn, setMrn] = useState(patient?.mrn ?? '');
  const [gender, setGender] = useState<Gender>(patient?.gender ?? 'UNKNOWN');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = firstName.trim() && lastName.trim() && dateOfBirth && mrn.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError('');
    try {
      if (isEdit && patient) {
        const body: Partial<CreatePatientBody> = {};
        if (firstName.trim() !== patient.firstName) body.firstName = firstName.trim();
        if (lastName.trim() !== patient.lastName) body.lastName = lastName.trim();
        if (dateOfBirth !== patient.dateOfBirth) body.dateOfBirth = dateOfBirth;
        if (mrn.trim() !== patient.mrn) body.mrn = mrn.trim();
        if (gender !== patient.gender) body.gender = gender;

        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }

        const result = await updatePatient(token, patient.id, body);
        onSaved(result.patient);
      } else {
        const result = await createPatient(token, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
          mrn: mrn.trim(),
          gender,
        });
        onSaved(result.patient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save patient');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay nested-modal" onClick={onClose}>
      <div className="modal-content max-w-[500px]" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4">{isEdit ? 'Edit Patient' : 'Create Patient'}</h3>

        {error && (
          <div className="alert alert-error mb-3">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First Name *</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              required
            />
          </div>
          <div className="form-group">
            <label>Date of Birth *</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>MRN *</label>
            <input
              type="text"
              value={mrn}
              onChange={e => setMrn(e.target.value)}
              placeholder="Medical Record Number"
              required
            />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select
              value={gender}
              onChange={e => setGender(e.target.value as Gender)}
            >
              {GENDER_VALUES.map(g => (
                <option key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSubmit || saving}
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
