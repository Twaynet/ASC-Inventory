'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCaseDashboard,
  attestCaseReadiness,
  voidCaseAttestation,
  updateAnesthesiaPlan,
  addCaseOverride,
  removeCaseOverride,
  getCaseEventLog,
  updateCaseSummary,
  updateCaseScheduling,
  getCaseCards,
  linkCaseCard,
  type CaseDashboardData,
  type CaseDashboardEventLogEntry,
  type AnesthesiaModality,
  type CaseCardSummary,
} from '@/lib/api';

const ANESTHESIA_MODALITIES: { value: AnesthesiaModality; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'SPINAL', label: 'Spinal' },
  { value: 'REGIONAL', label: 'Regional' },
  { value: 'MAC', label: 'MAC' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'TIVA', label: 'TIVA' },
];

function CaseDashboardContent() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const caseId = params.caseId as string;

  // Dashboard state
  const [dashboard, setDashboard] = useState<CaseDashboardData | null>(null);
  const [eventLog, setEventLog] = useState<CaseDashboardEventLogEntry[]>([]);
  const [availableCaseCards, setAvailableCaseCards] = useState<CaseCardSummary[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Modal states
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showEventLogModal, setShowEventLogModal] = useState(false);
  const [showLinkCaseCardModal, setShowLinkCaseCardModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Inline editing states
  const [isEditingScheduling, setIsEditingScheduling] = useState(false);

  // Override form state
  const [overrideForm, setOverrideForm] = useState({
    target: '',
    originalValue: '',
    overrideValue: '',
    reason: '',
  });

  // Anesthesia form state
  const [anesthesiaForm, setAnesthesiaForm] = useState({
    modalities: [] as AnesthesiaModality[],
    airwayNotes: '',
    anticoagulationConsiderations: '',
  });

  // Case summary form state
  const [summaryForm, setSummaryForm] = useState({
    estimatedDurationMinutes: '' as string | number,
    laterality: '',
    orRoom: '',
    schedulerNotes: '',
  });

  // Scheduling form state
  const [schedulingForm, setSchedulingForm] = useState({
    scheduledDate: '',
    scheduledTime: '',
    orRoom: '',
  });

  const loadData = useCallback(async () => {
    if (!token || !caseId) return;

    setIsLoadingData(true);
    setError('');

    try {
      const [dashboardResult, eventLogResult, caseCardsResult] = await Promise.all([
        getCaseDashboard(token, caseId),
        getCaseEventLog(token, caseId),
        getCaseCards(token, { status: 'ACTIVE' }),
      ]);

      setDashboard(dashboardResult.dashboard);
      setEventLog(eventLogResult.eventLog);
      setAvailableCaseCards(caseCardsResult.cards);

      // Initialize forms from dashboard data
      const d = dashboardResult.dashboard;
      setAnesthesiaForm({
        modalities: d.anesthesiaPlan?.modalities || [],
        airwayNotes: d.anesthesiaPlan?.airwayNotes || '',
        anticoagulationConsiderations: d.anesthesiaPlan?.anticoagulationConsiderations || '',
      });
      setSummaryForm({
        estimatedDurationMinutes: d.estimatedDurationMinutes || '',
        laterality: d.laterality || '',
        orRoom: d.orRoom || '',
        schedulerNotes: d.schedulerNotes || '',
      });
      setSchedulingForm({
        scheduledDate: d.scheduledDate || '',
        scheduledTime: d.scheduledTime || '',
        orRoom: d.orRoom || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, caseId]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
      return;
    }
    loadData();
  }, [isLoading, user, router, loadData]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleAttest = async () => {
    if (!token || !caseId) return;

    try {
      await attestCaseReadiness(token, caseId);
      setSuccessMessage('Case readiness attested successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attest readiness');
    }
  };

  const handleVoid = async () => {
    if (!token || !caseId || !voidReason.trim()) return;

    try {
      await voidCaseAttestation(token, caseId, voidReason);
      setSuccessMessage('Attestation voided');
      setShowVoidModal(false);
      setVoidReason('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void attestation');
    }
  };

  const handleUpdateAnesthesia = async () => {
    if (!token || !caseId) return;

    try {
      await updateAnesthesiaPlan(token, caseId, {
        modalities: anesthesiaForm.modalities.length > 0 ? anesthesiaForm.modalities : undefined,
        airwayNotes: anesthesiaForm.airwayNotes || undefined,
        anticoagulationConsiderations: anesthesiaForm.anticoagulationConsiderations || undefined,
      });
      setSuccessMessage('Anesthesia plan updated');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update anesthesia plan');
    }
  };

  const toggleModality = (modality: AnesthesiaModality) => {
    setAnesthesiaForm(f => ({
      ...f,
      modalities: f.modalities.includes(modality)
        ? f.modalities.filter(m => m !== modality)
        : [...f.modalities, modality],
    }));
  };

  const handleUpdateSummary = async () => {
    if (!token || !caseId) return;

    try {
      await updateCaseSummary(token, caseId, {
        estimatedDurationMinutes: summaryForm.estimatedDurationMinutes ? Number(summaryForm.estimatedDurationMinutes) : undefined,
        laterality: summaryForm.laterality || undefined,
        orRoom: summaryForm.orRoom || undefined,
        schedulerNotes: summaryForm.schedulerNotes || undefined,
      });
      setSuccessMessage('Case summary updated');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case summary');
    }
  };

  const handleUpdateScheduling = async () => {
    if (!token || !caseId) return;

    try {
      await updateCaseScheduling(token, caseId, {
        scheduledDate: schedulingForm.scheduledDate || undefined,
        scheduledTime: schedulingForm.scheduledTime || null,
        orRoom: schedulingForm.orRoom || null,
      });
      setSuccessMessage('Scheduling updated');
      setIsEditingScheduling(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scheduling');
    }
  };

  const handleCancelSchedulingEdit = () => {
    // Reset form to current dashboard values
    if (dashboard) {
      setSchedulingForm({
        scheduledDate: dashboard.scheduledDate || '',
        scheduledTime: dashboard.scheduledTime || '',
        orRoom: dashboard.orRoom || '',
      });
    }
    setIsEditingScheduling(false);
  };

  const handleAddOverride = async () => {
    if (!token || !caseId) return;
    if (!overrideForm.target || !overrideForm.overrideValue || !overrideForm.reason) {
      setError('Target, override value, and reason are required');
      return;
    }

    try {
      await addCaseOverride(token, caseId, {
        target: overrideForm.target,
        originalValue: overrideForm.originalValue || undefined,
        overrideValue: overrideForm.overrideValue,
        reason: overrideForm.reason,
      });
      setSuccessMessage('Override added');
      setShowOverrideModal(false);
      setOverrideForm({ target: '', originalValue: '', overrideValue: '', reason: '' });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add override');
    }
  };

  const handleRemoveOverride = async (overrideId: string) => {
    if (!token || !caseId) return;

    if (!confirm('Are you sure you want to remove this override?')) return;

    try {
      await removeCaseOverride(token, caseId, overrideId);
      setSuccessMessage('Override removed');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove override');
    }
  };

  const handleLinkCaseCard = async (versionId: string) => {
    if (!token || !caseId) return;

    try {
      await linkCaseCard(token, caseId, versionId);
      setSuccessMessage('Case card linked');
      setShowLinkCaseCardModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link case card');
    }
  };

  const handlePrint = () => {
    setShowPrintModal(true);
  };

  const executePrint = () => {
    window.print();
  };

  if (isLoading || isLoadingData) {
    return (
      <>
        <Header title="Case Dashboard" />
        <main className="admin-main">
          <div className="loading">Loading case dashboard...</div>
        </main>
      </>
    );
  }

  if (!user || !dashboard) {
    return (
      <>
        <Header title="Case Dashboard" />
        <main className="admin-main">
          <div className="error-message">{error || 'Case not found'}</div>
        </main>
      </>
    );
  }

  const getStatusColor = () => {
    if (dashboard.attestationState === 'VOIDED') return 'var(--red)';
    if (dashboard.attestationState === 'ATTESTED') return 'var(--green)';
    if (dashboard.readinessState === 'RED') return 'var(--red)';
    if (dashboard.readinessState === 'ORANGE') return 'var(--orange)';
    return 'var(--text-muted)';
  };

  const getStatusLabel = () => {
    if (dashboard.attestationState === 'VOIDED') return 'Voided';
    if (dashboard.attestationState === 'ATTESTED') return 'Ready (Attested)';
    if (dashboard.readinessState === 'RED') return 'Needs Attention';
    if (dashboard.readinessState === 'ORANGE') return 'Needs Attention';
    return 'Scheduled';
  };

  // Print-specific functions that return hex colors instead of CSS variables
  const getPrintStatusColor = () => {
    if (dashboard.attestationState === 'VOIDED') return '#e53e3e';
    if (dashboard.attestationState === 'ATTESTED') return '#38a169';
    if (dashboard.readinessState === 'RED') return '#e53e3e';
    if (dashboard.readinessState === 'ORANGE') return '#dd6b20';
    return '#718096';
  };

  return (
    <>
      <Header title="Case Dashboard" />
      <main className="admin-main" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
        {/* Messages */}
        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: '1rem' }}>Dismiss</button>
          </div>
        )}
        {successMessage && (
          <div className="success-message" style={{ marginBottom: '1rem' }}>
            {successMessage}
            <button onClick={() => setSuccessMessage('')} style={{ marginLeft: '1rem' }}>Dismiss</button>
          </div>
        )}

        {/* Section 1: Case Identity & Status Banner */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          border: `3px solid ${getStatusColor()}`,
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{dashboard.procedureName}</h1>
              <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>
                {dashboard.surgeon} | {dashboard.facility}
              </p>
              {isEditingScheduling ? (
                <div style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>Scheduled:</strong>
                  <input
                    type="date"
                    value={schedulingForm.scheduledDate}
                    onChange={e => setSchedulingForm(f => ({ ...f, scheduledDate: e.target.value }))}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}
                  />
                  <span>at</span>
                  <input
                    type="time"
                    value={schedulingForm.scheduledTime}
                    onChange={e => setSchedulingForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}
                  />
                  <span>| OR:</span>
                  <input
                    type="text"
                    value={schedulingForm.orRoom}
                    onChange={e => setSchedulingForm(f => ({ ...f, orRoom: e.target.value }))}
                    placeholder="OR Room"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem', width: '80px' }}
                  />
                  <button onClick={handleUpdateScheduling} className="btn-small btn-primary" style={{ padding: '0.25rem 0.5rem' }}>
                    Save
                  </button>
                  <button onClick={handleCancelSchedulingEdit} className="btn-small btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <p
                  style={{ margin: '0.5rem 0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                  onClick={() => setIsEditingScheduling(true)}
                  title="Click to edit scheduling"
                >
                  <strong>Scheduled:</strong> {new Date(dashboard.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {dashboard.scheduledTime && ` at ${dashboard.scheduledTime}`}
                  {dashboard.orRoom && ` | OR: ${dashboard.orRoom}`}
                  <span style={{ fontSize: '1rem', color: '#3182ce', marginLeft: '0.25rem' }} title="Edit scheduling">✎</span>
                </p>
              )}
              <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Case ID: {dashboard.caseId}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                background: getStatusColor(),
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.1rem',
              }}>
                {getStatusLabel()}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Readiness Attestation Panel */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('attestation')}>
            {collapsedSections.has('attestation') ? '+ ' : '- '}Readiness Attestation
          </h2>
          {!collapsedSections.has('attestation') && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <strong>State:</strong> {dashboard.attestationState.replace('_', ' ')}
                </div>
                {dashboard.attestedBy && (
                  <div>
                    <strong>Attested By:</strong> {dashboard.attestedBy}
                  </div>
                )}
                {dashboard.attestedAt && (
                  <div>
                    <strong>Attested:</strong> {new Date(dashboard.attestedAt).toLocaleString()}
                  </div>
                )}
                {dashboard.voidReason && (
                  <div>
                    <strong>Void Reason:</strong> {dashboard.voidReason}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => router.push(`/case/${caseId}/verify`)}
                  className="btn-secondary"
                >
                  Verify Items
                </button>
                {dashboard.attestationState !== 'ATTESTED' && (
                  <button
                    onClick={handleAttest}
                    className="btn-primary"
                    disabled={!dashboard.caseCard || !dashboard.anesthesiaPlan?.modalities?.length}
                    title={!dashboard.caseCard ? 'Link a Case Card first' : !dashboard.anesthesiaPlan?.modalities?.length ? 'Select anesthesia modality first' : ''}
                  >
                    Attest Readiness
                  </button>
                )}
                {dashboard.attestationState === 'ATTESTED' && (
                  <button onClick={() => setShowVoidModal(true)} className="btn-danger">
                    Void Attestation
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Case Summary */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('summary')}>
            {collapsedSections.has('summary') ? '+ ' : '- '}Case Summary
          </h2>
          {!collapsedSections.has('summary') && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Estimated Duration (min)</label>
                  <input
                    type="number"
                    value={summaryForm.estimatedDurationMinutes}
                    onChange={e => setSummaryForm(f => ({ ...f, estimatedDurationMinutes: e.target.value }))}
                    placeholder="e.g., 120"
                  />
                </div>
                <div className="form-group">
                  <label>Laterality</label>
                  <select
                    value={summaryForm.laterality}
                    onChange={e => setSummaryForm(f => ({ ...f, laterality: e.target.value }))}
                  >
                    <option value="">-- Select --</option>
                    <option value="Left">Left</option>
                    <option value="Right">Right</option>
                    <option value="Bilateral">Bilateral</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Scheduler Notes (non-PHI)</label>
                <textarea
                  value={summaryForm.schedulerNotes}
                  onChange={e => setSummaryForm(f => ({ ...f, schedulerNotes: e.target.value }))}
                  rows={2}
                  placeholder="Notes visible to scheduling team..."
                />
              </div>
              <button onClick={handleUpdateSummary} className="btn-secondary">
                Save Summary
              </button>
            </div>
          )}
        </section>

        {/* Section 4: Anesthesia Plan */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('anesthesia')}>
            {collapsedSections.has('anesthesia') ? '+ ' : '- '}Anesthesia Plan
          </h2>
          {!collapsedSections.has('anesthesia') && (
            <div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Modality * <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(select all that apply)</span></label>
                <div className="modality-checkboxes">
                  {ANESTHESIA_MODALITIES.map(m => (
                    <label key={m.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={anesthesiaForm.modalities.includes(m.value)}
                        onChange={() => toggleModality(m.value)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Airway Notes</label>
                  <input
                    type="text"
                    value={anesthesiaForm.airwayNotes}
                    onChange={e => setAnesthesiaForm(f => ({ ...f, airwayNotes: e.target.value }))}
                    placeholder="Optional notes..."
                  />
                </div>
                <div className="form-group">
                  <label>Anticoagulation (non-PHI)</label>
                  <input
                    type="text"
                    value={anesthesiaForm.anticoagulationConsiderations}
                    onChange={e => setAnesthesiaForm(f => ({ ...f, anticoagulationConsiderations: e.target.value }))}
                    placeholder="e.g., Standard protocol..."
                  />
                </div>
              </div>
              <button onClick={handleUpdateAnesthesia} className="btn-secondary">
                Save Anesthesia Plan
              </button>
            </div>
          )}
        </section>

        {/* Section 5: Linked Case Card */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('caseCard')}>
            {collapsedSections.has('caseCard') ? '+ ' : '- '}Linked Case Card
          </h2>
          {!collapsedSections.has('caseCard') && (
            <div>
              {dashboard.caseCard ? (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div><strong>Name:</strong> {dashboard.caseCard.name}</div>
                    <div><strong>Version:</strong> {dashboard.caseCard.version}</div>
                    <div><strong>Status:</strong> {dashboard.caseCard.status}</div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--red)', marginBottom: '1rem' }}>No Case Card linked. Link a Case Card to enable attestation.</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowLinkCaseCardModal(true)} className="btn-secondary">
                  {dashboard.caseCard ? 'Change Case Card' : 'Link Case Card'}
                </button>
                {dashboard.caseCard && (
                  <button
                    onClick={() => router.push(`/case-cards?id=${dashboard.caseCard!.id}`)}
                    className="btn-secondary"
                  >
                    View Case Card
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Section 6: Case-Specific Overrides */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('overrides')}>
            {collapsedSections.has('overrides') ? '+ ' : '- '}Case-Specific Overrides ({dashboard.overrides.length})
          </h2>
          {!collapsedSections.has('overrides') && (
            <div>
              {dashboard.overrides.length > 0 ? (
                <table className="data-table" style={{ marginBottom: '1rem' }}>
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Original</th>
                      <th>Override</th>
                      <th>Reason</th>
                      <th>Created By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.overrides.map(o => (
                      <tr key={o.id}>
                        <td>{o.target}</td>
                        <td>{o.originalValue || '-'}</td>
                        <td>{o.overrideValue}</td>
                        <td>{o.reason}</td>
                        <td>{o.createdBy}</td>
                        <td>
                          <button
                            onClick={() => handleRemoveOverride(o.id)}
                            className="btn-small btn-danger"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>No overrides applied.</p>
              )}
              <button onClick={() => setShowOverrideModal(true)} className="btn-secondary">
                Add Override
              </button>
            </div>
          )}
        </section>

        {/* Section 7: Event Log */}
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('eventLog')}>
            {collapsedSections.has('eventLog') ? '+ ' : '- '}Event Log
          </h2>
          {!collapsedSections.has('eventLog') && (
            <div>
              {eventLog.slice(0, 5).map(e => (
                <div key={e.id} style={{
                  padding: '0.5rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.9rem',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  {' | '}
                  <strong>{e.userName}</strong> ({e.userRole})
                  {' - '}
                  {e.description}
                </div>
              ))}
              {eventLog.length > 5 && (
                <button
                  onClick={() => setShowEventLogModal(true)}
                  className="btn-link"
                  style={{ marginTop: '0.5rem' }}
                >
                  View all {eventLog.length} events
                </button>
              )}
              {eventLog.length === 0 && (
                <p style={{ color: 'var(--text-muted)' }}>No events recorded yet.</p>
              )}
            </div>
          )}
        </section>

        {/* Back and Print buttons */}
        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.back()} className="btn-secondary">
            Back
          </button>
          <button onClick={handlePrint} className="btn-secondary">
            Print Case Dashboard
          </button>
        </div>

        {/* Void Modal */}
        {showVoidModal && (
          <div className="modal-overlay" onClick={() => setShowVoidModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <h3>Void Attestation</h3>
              <p>This will void the current attestation. A reason is required.</p>
              <div className="form-group">
                <label>Reason *</label>
                <textarea
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="Enter reason for voiding..."
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowVoidModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleVoid} className="btn-danger" disabled={!voidReason.trim()}>
                  Void Attestation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Override Modal */}
        {showOverrideModal && (
          <div className="modal-overlay" onClick={() => setShowOverrideModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <h3>Add Override</h3>
              <div className="form-group">
                <label>Target *</label>
                <input
                  type="text"
                  value={overrideForm.target}
                  onChange={e => setOverrideForm(f => ({ ...f, target: e.target.value }))}
                  placeholder="e.g., instrumentation.primaryTrays"
                />
              </div>
              <div className="form-group">
                <label>Original Value</label>
                <input
                  type="text"
                  value={overrideForm.originalValue}
                  onChange={e => setOverrideForm(f => ({ ...f, originalValue: e.target.value }))}
                  placeholder="What was the original value?"
                />
              </div>
              <div className="form-group">
                <label>Override Value *</label>
                <input
                  type="text"
                  value={overrideForm.overrideValue}
                  onChange={e => setOverrideForm(f => ({ ...f, overrideValue: e.target.value }))}
                  placeholder="New value for this case"
                />
              </div>
              <div className="form-group">
                <label>Reason *</label>
                <textarea
                  value={overrideForm.reason}
                  onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  placeholder="Why is this override needed?"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowOverrideModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleAddOverride} className="btn-primary">Add Override</button>
              </div>
            </div>
          </div>
        )}

        {/* Link Case Card Modal */}
        {showLinkCaseCardModal && (
          <div className="modal-overlay" onClick={() => setShowLinkCaseCardModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <h3>Link Case Card</h3>
              <p>Select an active case card to link to this case:</p>
              {availableCaseCards.length > 0 ? (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {availableCaseCards
                    .filter(c => c.surgeonId === dashboard.surgeonId)
                    .map(card => (
                      <div
                        key={card.currentVersionId}
                        style={{
                          padding: '1rem',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          marginBottom: '0.5rem',
                          cursor: 'pointer',
                          background: card.currentVersionId === dashboard.caseCard?.versionId ? 'var(--surface-hover)' : 'transparent',
                        }}
                        onClick={() => handleLinkCaseCard(card.currentVersionId!)}
                      >
                        <strong>{card.procedureName}</strong>
                        <br />
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          v{card.version} | {card.surgeonName}
                        </span>
                      </div>
                    ))}
                  {availableCaseCards.filter(c => c.surgeonId === dashboard.surgeonId).length === 0 && (
                    <p style={{ color: 'var(--text-muted)' }}>
                      No active case cards found for this surgeon.
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No active case cards available.</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button onClick={() => setShowLinkCaseCardModal(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Full Event Log Modal */}
        {showEventLogModal && (
          <div className="modal-overlay" onClick={() => setShowEventLogModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
              <h3>Event Log</h3>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {eventLog.map(e => (
                  <div key={e.id} style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.9rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <strong>{e.userName}</strong> ({e.userRole})
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span style={{
                        background: 'var(--surface-hover)',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        marginRight: '0.5rem',
                      }}>
                        {e.eventType.replace(/_/g, ' ')}
                      </span>
                      {e.description}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button onClick={() => setShowEventLogModal(false)} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Print Case Dashboard Modal */}
        {showPrintModal && (
          <div className="modal-overlay print-modal-overlay" onClick={() => setShowPrintModal(false)}>
            <div className="modal-content print-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
              <div className="modal-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Print Case Dashboard</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={executePrint}>Print</button>
                  <button className="btn-secondary" onClick={() => setShowPrintModal(false)}>Close</button>
                </div>
              </div>
              <div className="print-content">
                {/* Case Identity Banner */}
                <div className="print-header" style={{
                  borderBottom: '3px solid ' + getPrintStatusColor(),
                  paddingBottom: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>{dashboard.procedureName}</h1>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <span><strong>Surgeon:</strong> {dashboard.surgeon}</span>
                    <span><strong>Facility:</strong> {dashboard.facility}</span>
                    <span><strong>Case ID:</strong> {dashboard.caseId}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <span><strong>Scheduled:</strong> {new Date(dashboard.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {dashboard.scheduledTime && ` at ${dashboard.scheduledTime}`}
                    {dashboard.orRoom && ` | OR: ${dashboard.orRoom}`}</span>
                  </div>
                  <div style={{
                    display: 'inline-block',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    background: getPrintStatusColor(),
                    color: 'white',
                    fontWeight: 'bold',
                    marginTop: '0.5rem'
                  }}>
                    {getStatusLabel()}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Case Summary */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Case Summary</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                      {dashboard.estimatedDurationMinutes && (
                        <div><strong>Estimated Duration:</strong> {dashboard.estimatedDurationMinutes} minutes</div>
                      )}
                      {dashboard.laterality && (
                        <div><strong>Laterality:</strong> {dashboard.laterality}</div>
                      )}
                    </div>
                    {dashboard.schedulerNotes && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                        <strong>Scheduler Notes:</strong> {dashboard.schedulerNotes}
                      </div>
                    )}
                  </div>

                  {/* Anesthesia Plan */}
                  {dashboard.anesthesiaPlan && (dashboard.anesthesiaPlan.modalities.length > 0 || dashboard.anesthesiaPlan.airwayNotes || dashboard.anesthesiaPlan.anticoagulationConsiderations) && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Anesthesia Plan</h4>
                      {dashboard.anesthesiaPlan.modalities.length > 0 && (
                        <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                          <strong>Modalities:</strong> {dashboard.anesthesiaPlan.modalities.join(', ')}
                        </div>
                      )}
                      {dashboard.anesthesiaPlan.airwayNotes && (
                        <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                          <strong>Airway Notes:</strong> {dashboard.anesthesiaPlan.airwayNotes}
                        </div>
                      )}
                      {dashboard.anesthesiaPlan.anticoagulationConsiderations && (
                        <div style={{ fontSize: '0.875rem' }}>
                          <strong>Anticoagulation:</strong> {dashboard.anesthesiaPlan.anticoagulationConsiderations}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linked Case Card */}
                  {dashboard.caseCard && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Linked Case Card</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <div><strong>Name:</strong> {dashboard.caseCard.name}</div>
                        <div><strong>Version:</strong> {dashboard.caseCard.version}</div>
                        <div><strong>Status:</strong> {dashboard.caseCard.status}</div>
                      </div>
                    </div>
                  )}

                  {/* Case-Specific Overrides */}
                  {dashboard.overrides.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Case-Specific Overrides ({dashboard.overrides.length})</h4>
                      <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Target</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Original</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Override</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard.overrides.map(o => (
                            <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '0.5rem' }}>{o.target}</td>
                              <td style={{ padding: '0.5rem' }}>{o.originalValue || '-'}</td>
                              <td style={{ padding: '0.5rem' }}>{o.overrideValue}</td>
                              <td style={{ padding: '0.5rem' }}>{o.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Readiness Attestation */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Readiness Attestation</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <div><strong>State:</strong> {dashboard.attestationState.replace('_', ' ')}</div>
                      {dashboard.attestedBy && <div><strong>Attested By:</strong> {dashboard.attestedBy}</div>}
                      {dashboard.attestedAt && <div><strong>Attested:</strong> {new Date(dashboard.attestedAt).toLocaleString()}</div>}
                    </div>
                    {dashboard.voidReason && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                        <strong>Void Reason:</strong> {dashboard.voidReason}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#718096' }}>
                  <span>Printed: {new Date().toLocaleString()}</span>
                  <span>Facility: {user?.facilityName}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-modal-overlay,
          .print-modal-overlay * {
            visibility: visible;
          }
          .print-modal-overlay {
            position: absolute;
            left: 0;
            top: 0;
            background: white;
          }
          .print-modal {
            width: 100%;
            max-width: none;
            max-height: none;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default function CaseDashboardPage() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <CaseDashboardContent />
    </Suspense>
  );
}
