'use client';

import { useState } from 'react';
import {
  searchPatients,
  type PatientIdentity,
  type PatientSearchParams,
} from '@/lib/api/phi-patient';

interface PatientSearchModalProps {
  token: string;
  /** If provided, the "Link to Case" action is available */
  caseId?: string;
  onSelect: (patient: PatientIdentity) => void;
  onLinkToCase?: (patient: PatientIdentity) => void;
  onCreateNew?: () => void;
  onClose: () => void;
}

const PAGE_SIZE = 25;

export function PatientSearchModal({
  token,
  caseId,
  onSelect,
  onLinkToCase,
  onCreateNew,
  onClose,
}: PatientSearchModalProps) {
  // Search form
  const [mrn, setMrn] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [dob, setDob] = useState('');
  const [dobYear, setDobYear] = useState('');

  // Results
  const [patients, setPatients] = useState<PatientIdentity[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasCriteria = [mrn, lastName, firstName, dob, dobYear].some(v => v.trim().length > 0);

  const doSearch = async (searchOffset = 0) => {
    if (!hasCriteria) return;
    setLoading(true);
    setError('');
    try {
      const params: PatientSearchParams = {
        limit: PAGE_SIZE,
        offset: searchOffset,
      };
      if (mrn.trim()) params.mrn = mrn.trim();
      if (lastName.trim()) params.lastName = lastName.trim();
      if (firstName.trim()) params.firstName = firstName.trim();
      if (dob.trim()) params.dob = dob.trim();
      if (dobYear.trim()) params.dobYear = dobYear.trim();

      const result = await searchPatients(token, params);
      setPatients(result.patients);
      setTotal(result.total);
      setOffset(searchOffset);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(0);
  };

  const handlePrev = () => {
    if (offset > 0) doSearch(Math.max(0, offset - PAGE_SIZE));
  };
  const handleNext = () => {
    if (offset + PAGE_SIZE < total) doSearch(offset + PAGE_SIZE);
  };

  return (
    <div className="modal-overlay nested-modal" onClick={onClose}>
      <div className="modal-content max-w-[750px]" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4">Patient Search</h3>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-3">
            <div className="form-group">
              <label>MRN</label>
              <input
                type="text"
                value={mrn}
                onChange={e => setMrn(e.target.value)}
                placeholder="Partial or exact"
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Contains..."
              />
            </div>
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Contains..."
              />
            </div>
            <div className="form-group">
              <label>DOB (exact)</label>
              <input
                type="date"
                value={dob}
                onChange={e => { setDob(e.target.value); if (e.target.value) setDobYear(''); }}
              />
            </div>
            <div className="form-group">
              <label>DOB Year</label>
              <input
                type="text"
                value={dobYear}
                onChange={e => { setDobYear(e.target.value); if (e.target.value) setDob(''); }}
                placeholder="YYYY"
                maxLength={4}
              />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="submit"
              className="btn-primary"
              disabled={!hasCriteria || loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            {onCreateNew && (
              <button type="button" onClick={onCreateNew} className="btn-secondary">
                Create New Patient
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="alert alert-error mb-3">{error}</div>
        )}

        {/* Results */}
        {searched && (
          <>
            <div className="text-sm text-text-muted mb-2">
              {total === 0 ? 'No patients found.' : `${total} patient${total !== 1 ? 's' : ''} found`}
              {total > PAGE_SIZE && ` (showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)})`}
            </div>

            {patients.length > 0 && (
              <div className="max-h-[350px] overflow-y-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>DOB</th>
                      <th>MRN</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map(p => (
                      <tr key={p.id}>
                        <td>{p.lastName}, {p.firstName}</td>
                        <td>{p.dateOfBirth}</td>
                        <td>{p.mrn}</td>
                        <td>
                          <div className="flex gap-1">
                            {caseId && onLinkToCase && (
                              <button
                                onClick={() => onLinkToCase(p)}
                                className="btn-sm btn-primary"
                              >
                                Link to Case
                              </button>
                            )}
                            <button
                              onClick={() => onSelect(p)}
                              className="btn-sm btn-secondary"
                            >
                              Select
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex justify-between items-center mt-3">
                <button
                  onClick={handlePrev}
                  className="btn-sm btn-secondary"
                  disabled={offset === 0}
                >
                  Previous
                </button>
                <span className="text-sm text-text-muted">
                  Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
                </span>
                <button
                  onClick={handleNext}
                  className="btn-sm btn-secondary"
                  disabled={offset + PAGE_SIZE >= total}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
