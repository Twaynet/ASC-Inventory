'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  searchPatients,
  getPatientCases,
  type PatientIdentity,
  type PatientCase,
  type PatientSearchParams,
} from '@/lib/api/phi-patient';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortKey = 'name-asc' | 'name-desc' | 'dob' | 'mrn';

function sortPatients(patients: PatientIdentity[], key: SortKey): PatientIdentity[] {
  const sorted = [...patients];
  switch (key) {
    case 'name-asc':
      return sorted.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    case 'name-desc':
      return sorted.sort((a, b) => `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`));
    case 'dob':
      return sorted.sort((a, b) => a.dateOfBirth.localeCompare(b.dateOfBirth));
    case 'mrn':
      return sorted.sort((a, b) => a.mrn.localeCompare(b.mrn));
    default:
      return sorted;
  }
}

function groupCases(cases: PatientCase[]): { today: PatientCase[]; upcoming: PatientCase[]; past: PatientCase[] } {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const today: PatientCase[] = [];
  const upcoming: PatientCase[] = [];
  const past: PatientCase[] = [];

  for (const c of cases) {
    if (!c.scheduledDate) {
      upcoming.push(c); // unscheduled → treat as upcoming
    } else if (c.scheduledDate === todayStr) {
      today.push(c);
    } else if (c.scheduledDate > todayStr) {
      upcoming.push(c);
    } else {
      past.push(c);
    }
  }

  return { today, upcoming, past };
}

const PAGE_SIZE = 25;

const statusBadgeBase = 'py-0.5 px-2 rounded-full text-xs font-medium inline-block';

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'REQUESTED':
      return `${statusBadgeBase} bg-[var(--color-blue-100)] text-[var(--color-blue-600)]`;
    case 'SCHEDULED':
      return `${statusBadgeBase} bg-[var(--color-purple-100)] text-[var(--color-purple-700)]`;
    case 'IN_PROGRESS':
      return `${statusBadgeBase} bg-[var(--color-green-100)] text-[var(--color-green-700)]`;
    case 'COMPLETED':
      return `${statusBadgeBase} bg-surface-tertiary text-text-secondary`;
    case 'CANCELLED':
      return `${statusBadgeBase} bg-[var(--color-red-100)] text-[var(--color-red-600)]`;
    default:
      return `${statusBadgeBase} bg-surface-tertiary text-text-secondary`;
  }
}

// ============================================================================
// Component
// ============================================================================

export default function PatientSearchPage() {
  const { token } = useAuth();
  const { hasCapability } = useAccessControl();
  const router = useRouter();

  // Access gate
  const canSearch = hasCapability('PHI_PATIENT_SEARCH');

  // Search form state
  const [mrn, setMrn] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [dob, setDob] = useState('');
  const [dobYear, setDobYear] = useState('');

  // Results state
  const [patients, setPatients] = useState<PatientIdentity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Expanded patient → cases
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [patientCases, setPatientCases] = useState<PatientCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);

  const hasAnyCriteria = mrn.trim() || lastName.trim() || firstName.trim() || dob || dobYear.trim();

  const doSearch = useCallback(async (offset = 0) => {
    if (!token || !hasAnyCriteria) return;
    setIsSearching(true);
    setSearchError(null);
    setExpandedPatientId(null);
    setPatientCases([]);

    const params: PatientSearchParams = { limit: 50, offset };
    if (mrn.trim()) params.mrn = mrn.trim();
    if (lastName.trim()) params.lastName = lastName.trim();
    if (firstName.trim()) params.firstName = firstName.trim();
    if (dob) params.dob = dob;
    if (dobYear.trim()) params.dobYear = dobYear.trim();

    try {
      const result = await searchPatients(token, params);
      setPatients(result.patients);
      setTotal(result.total);
      setPage(0);
      setHasSearched(true);
    } catch {
      setSearchError('Search failed. Please try again.');
      setPatients([]);
      setTotal(0);
    } finally {
      setIsSearching(false);
    }
  }, [token, mrn, lastName, firstName, dob, dobYear, hasAnyCriteria]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(0);
  };

  const handleClear = () => {
    setMrn('');
    setLastName('');
    setFirstName('');
    setDob('');
    setDobYear('');
    setPatients([]);
    setTotal(0);
    setPage(0);
    setHasSearched(false);
    setSearchError(null);
    setExpandedPatientId(null);
    setPatientCases([]);
  };

  const toggleExpand = async (patientId: string) => {
    if (expandedPatientId === patientId) {
      setExpandedPatientId(null);
      setPatientCases([]);
      return;
    }

    setExpandedPatientId(patientId);
    setPatientCases([]);
    setIsLoadingCases(true);

    try {
      if (!token) return;
      const result = await getPatientCases(token, patientId);
      setPatientCases(result.cases);
    } catch {
      setPatientCases([]);
    } finally {
      setIsLoadingCases(false);
    }
  };

  const navigateToCase = (caseItem: PatientCase) => {
    const date = caseItem.scheduledDate || new Date().toISOString().split('T')[0];
    router.push(`/calendar?view=day&date=${date}&openCase=${caseItem.id}`);
  };

  // Pagination
  const sorted = sortPatients(patients, sortKey);
  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageEnd);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  if (!canSearch) {
    return (
      <>
        <Header title="Patient Search" />
        <main className="container py-6">
          <div className="alert alert-error">Access denied. You do not have permission to search patients.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Patient Search" />
      <main className="container py-6">
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="bg-surface-secondary rounded-lg border border-border p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="search-mrn">MRN</label>
              <input
                id="search-mrn"
                type="text"
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                placeholder="Medical record number"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="search-lastName">Last Name</label>
              <input
                id="search-lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="search-firstName">First Name</label>
              <input
                id="search-firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="search-dob">Date of Birth</label>
              <input
                id="search-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="search-dobYear">DOB Year</label>
              <input
                id="search-dobYear"
                type="text"
                value={dobYear}
                onChange={(e) => setDobYear(e.target.value)}
                placeholder="e.g. 1985"
                maxLength={4}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!hasAnyCriteria || isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
              Clear
            </button>
            {hasSearched && (
              <span className="text-sm text-text-muted ml-2">
                {total} result{total !== 1 ? 's' : ''} found
              </span>
            )}
          </div>
        </form>

        {searchError && <div className="alert alert-error mb-4">{searchError}</div>}

        {/* Results */}
        {hasSearched && patients.length === 0 && !searchError && (
          <div className="text-text-muted text-center py-8">No patients found matching your criteria.</div>
        )}

        {patients.length > 0 && (
          <>
            {/* Sort + Pagination Controls */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label htmlFor="sort-select" className="text-sm text-text-secondary">Sort:</label>
                <select
                  id="sort-select"
                  value={sortKey}
                  onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(0); }}
                  className="text-sm border border-border rounded px-2 py-1 bg-surface-primary text-text-primary"
                >
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="dob">Date of Birth</option>
                  <option value="mrn">MRN</option>
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Prev
                  </button>
                  <span className="text-text-secondary">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary text-text-secondary">
                    <th className="text-left py-2 px-3 font-medium w-8"></th>
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium">DOB</th>
                    <th className="text-left py-2 px-3 font-medium">MRN</th>
                    <th className="text-left py-2 px-3 font-medium">Gender</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((patient) => (
                    <PatientRow
                      key={patient.id}
                      patient={patient}
                      isExpanded={expandedPatientId === patient.id}
                      onToggle={() => toggleExpand(patient.id)}
                      cases={expandedPatientId === patient.id ? patientCases : []}
                      isLoadingCases={expandedPatientId === patient.id && isLoadingCases}
                      onCaseClick={navigateToCase}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Empty state before first search */}
        {!hasSearched && !searchError && (
          <div className="text-text-muted text-center py-12">
            Enter at least one search criterion above to find patients.
          </div>
        )}
      </main>
    </>
  );
}

// ============================================================================
// Patient Row + Case Sub-rows
// ============================================================================

interface PatientRowProps {
  patient: PatientIdentity;
  isExpanded: boolean;
  onToggle: () => void;
  cases: PatientCase[];
  isLoadingCases: boolean;
  onCaseClick: (c: PatientCase) => void;
}

function PatientRow({ patient, isExpanded, onToggle, cases, isLoadingCases, onCaseClick }: PatientRowProps) {
  const grouped = isExpanded ? groupCases(cases) : null;

  return (
    <>
      <tr
        className="border-t border-border hover:bg-surface-secondary cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2 px-3 text-text-muted">
          <span className="inline-block transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
            &#9654;
          </span>
        </td>
        <td className="py-2 px-3 text-text-primary font-medium">
          {patient.lastName}, {patient.firstName}
        </td>
        <td className="py-2 px-3 text-text-secondary">{formatDate(patient.dateOfBirth)}</td>
        <td className="py-2 px-3 text-text-secondary font-mono text-xs">{patient.mrn}</td>
        <td className="py-2 px-3 text-text-secondary">{patient.gender}</td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="bg-surface-primary border-t border-border px-6 py-3">
              {isLoadingCases && (
                <div className="text-text-muted text-sm py-2">Loading cases...</div>
              )}

              {!isLoadingCases && cases.length === 0 && (
                <div className="text-text-muted text-sm py-2">No surgical cases found.</div>
              )}

              {!isLoadingCases && grouped && (
                <div className="space-y-3">
                  <CaseGroup label="Today" cases={grouped.today} onCaseClick={onCaseClick} />
                  <CaseGroup label="Upcoming" cases={grouped.upcoming} onCaseClick={onCaseClick} />
                  <CaseGroup label="Past" cases={grouped.past} onCaseClick={onCaseClick} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
// Case Group
// ============================================================================

interface CaseGroupProps {
  label: string;
  cases: PatientCase[];
  onCaseClick: (c: PatientCase) => void;
}

function CaseGroup({ label, cases, onCaseClick }: CaseGroupProps) {
  if (cases.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="space-y-1">
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={(e) => { e.stopPropagation(); onCaseClick(c); }}
            className="w-full text-left px-3 py-2 rounded border border-border bg-surface-secondary hover:bg-surface-tertiary transition-colors flex items-center gap-3 text-sm"
          >
            <span className="text-text-primary font-medium min-w-[80px]">{c.caseNumber}</span>
            <span className="text-text-secondary">{c.procedureName}</span>
            <span className="text-text-muted text-xs">{c.surgeonName}</span>
            <span className="text-text-muted text-xs">{formatDate(c.scheduledDate)}</span>
            {c.scheduledTime && <span className="text-text-muted text-xs">{c.scheduledTime}</span>}
            {c.roomName && <span className="text-text-muted text-xs">Room: {c.roomName}</span>}
            <span className={getStatusBadgeClass(c.status)}>{c.status.replace('_', ' ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
