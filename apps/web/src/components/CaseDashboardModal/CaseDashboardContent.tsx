'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  attestCaseReadiness,
  voidCaseAttestation,
  updateAnesthesiaPlan,
  addCaseOverride,
  removeCaseOverride,
  updateCaseSummary,
  updateCaseScheduling,
  updateCase,
  getCaseCard,
  linkCaseCard,
  activateCase,
  deactivateCase,
  type CaseDashboardData,
  type CaseDashboardEventLogEntry,
  type AnesthesiaModality,
  type CaseCardSummary,
  type CaseCardDetail,
  type CaseCardVersionData,
  type User,
  type ConfigItem,
  type CaseChecklistsResponse,
} from '@/lib/api';
import { CaseDashboardPrintView } from './CaseDashboardPrintView';
import { useAccessControl } from '@/lib/auth';
import { computeReadinessSummary, type ReadinessSummary } from '@/lib/readiness/summary';
import { ReadinessBadge } from '@/components/ReadinessBadge';
import { statusLabel, capabilityLabel, TERMS } from '@/lib/terminology';
import { CaseProgressStrip } from '@/components/CaseProgressStrip';
import { ExplainReadinessPanel } from '@/components/ExplainReadinessPanel';

const CASE_TYPES: { value: 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION'; label: string }[] = [
  { value: 'ELECTIVE', label: 'Elective' },
  { value: 'ADD_ON', label: 'Add-On' },
  { value: 'TRAUMA', label: 'Trauma' },
  { value: 'REVISION', label: 'Revision' },
];

export interface CaseDashboardContentProps {
  caseId: string;
  token: string;
  user: {
    id: string;
    name: string;
    role: string;
    roles?: string[];
    facilityName?: string;
  };
  dashboard: CaseDashboardData;
  eventLog: CaseDashboardEventLogEntry[];
  availableCaseCards: CaseCardSummary[];
  surgeons: User[];
  anesthesiaModalities: ConfigItem[];
  patientFlagOptions: ConfigItem[];
  checklists: CaseChecklistsResponse | null;
  onClose: () => void;
  onDataChange: () => void;
}

export function CaseDashboardContent({
  caseId,
  token,
  user,
  dashboard,
  eventLog,
  availableCaseCards,
  surgeons,
  anesthesiaModalities,
  patientFlagOptions,
  checklists,
  onClose,
  onDataChange,
}: CaseDashboardContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasCapability } = useAccessControl();

  // Messages
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
  const [printingCard, setPrintingCard] = useState<{ card: CaseCardDetail; currentVersion: CaseCardVersionData | null } | null>(null);

  // Inline editing states
  const [isEditingScheduling, setIsEditingScheduling] = useState(false);
  const [isEditingProcedure, setIsEditingProcedure] = useState(false);
  const [isEditingSurgeon, setIsEditingSurgeon] = useState(false);
  const [editProcedureName, setEditProcedureName] = useState(dashboard.procedureName);
  const [editSurgeonId, setEditSurgeonId] = useState(dashboard.surgeonId);

  // Override form state
  const [overrideForm, setOverrideForm] = useState({
    target: '',
    originalValue: '',
    overrideValue: '',
    reason: '',
  });

  // Anesthesia form state
  const [anesthesiaForm, setAnesthesiaForm] = useState({
    modalities: dashboard.anesthesiaPlan?.modalities || [] as AnesthesiaModality[],
    airwayNotes: dashboard.anesthesiaPlan?.airwayNotes || '',
    anticoagulationConsiderations: dashboard.anesthesiaPlan?.anticoagulationConsiderations || '',
  });

  // Case summary form state
  const [summaryForm, setSummaryForm] = useState({
    estimatedDurationMinutes: dashboard.estimatedDurationMinutes || '' as string | number,
    laterality: dashboard.laterality || '',
    orRoom: dashboard.orRoom || '',
    schedulerNotes: dashboard.schedulerNotes || '',
    caseType: ((dashboard as any).caseType || 'ELECTIVE') as 'ELECTIVE' | 'ADD_ON' | 'TRAUMA' | 'REVISION',
    procedureCodes: (dashboard as any).procedureCodes || [] as string[],
    patientFlags: (dashboard as any).patientFlags || {} as Record<string, boolean>,
    admissionTypes: (dashboard as any).admissionTypes || {} as Record<string, boolean>,
  });

  // Scheduling form state
  const [schedulingForm, setSchedulingForm] = useState({
    scheduledDate: dashboard.scheduledDate || '',
    scheduledTime: dashboard.scheduledTime || '',
    orRoom: dashboard.orRoom || '',
  });

  // Sync form state when dashboard changes
  useEffect(() => {
    setEditProcedureName(dashboard.procedureName);
    setEditSurgeonId(dashboard.surgeonId);
    setAnesthesiaForm({
      modalities: dashboard.anesthesiaPlan?.modalities || [],
      airwayNotes: dashboard.anesthesiaPlan?.airwayNotes || '',
      anticoagulationConsiderations: dashboard.anesthesiaPlan?.anticoagulationConsiderations || '',
    });
    setSummaryForm({
      estimatedDurationMinutes: dashboard.estimatedDurationMinutes || '',
      laterality: dashboard.laterality || '',
      orRoom: dashboard.orRoom || '',
      schedulerNotes: dashboard.schedulerNotes || '',
      caseType: (dashboard as any).caseType || 'ELECTIVE',
      procedureCodes: (dashboard as any).procedureCodes || [],
      patientFlags: (dashboard as any).patientFlags || {},
      admissionTypes: (dashboard as any).admissionTypes || {},
    });
    setSchedulingForm({
      scheduledDate: dashboard.scheduledDate || '',
      scheduledTime: dashboard.scheduledTime || '',
      orRoom: dashboard.orRoom || '',
    });
  }, [dashboard]);

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
    try {
      await attestCaseReadiness(token, caseId);
      setSuccessMessage('Case readiness attested successfully');
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attest readiness');
    }
  };

  const handleVoid = async () => {
    if (!voidReason.trim()) return;

    try {
      await voidCaseAttestation(token, caseId, voidReason);
      setSuccessMessage('Attestation voided');
      setShowVoidModal(false);
      setVoidReason('');
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void attestation');
    }
  };

  const handleUpdateAnesthesia = async () => {
    try {
      await updateAnesthesiaPlan(token, caseId, {
        modalities: anesthesiaForm.modalities.length > 0 ? anesthesiaForm.modalities : undefined,
        airwayNotes: anesthesiaForm.airwayNotes || undefined,
        anticoagulationConsiderations: anesthesiaForm.anticoagulationConsiderations || undefined,
      });
      setSuccessMessage('Anesthesia plan updated');
      onDataChange();
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
    try {
      await updateCaseSummary(token, caseId, {
        estimatedDurationMinutes: summaryForm.estimatedDurationMinutes ? Number(summaryForm.estimatedDurationMinutes) : undefined,
        laterality: summaryForm.laterality || undefined,
        orRoom: summaryForm.orRoom || undefined,
        schedulerNotes: summaryForm.schedulerNotes || undefined,
        caseType: summaryForm.caseType,
        procedureCodes: summaryForm.procedureCodes.length > 0 ? summaryForm.procedureCodes : undefined,
        patientFlags: summaryForm.patientFlags,
        admissionTypes: summaryForm.admissionTypes,
      });
      setSuccessMessage('Case summary updated');
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case summary');
    }
  };

  const handleUpdateScheduling = async () => {
    try {
      await updateCaseScheduling(token, caseId, {
        scheduledDate: schedulingForm.scheduledDate || undefined,
        scheduledTime: schedulingForm.scheduledTime || null,
        orRoom: schedulingForm.orRoom || null,
      });
      setSuccessMessage('Scheduling updated');
      setIsEditingScheduling(false);
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scheduling');
    }
  };

  const handleCancelSchedulingEdit = () => {
    setSchedulingForm({
      scheduledDate: dashboard.scheduledDate || '',
      scheduledTime: dashboard.scheduledTime || '',
      orRoom: dashboard.orRoom || '',
    });
    setIsEditingScheduling(false);
  };

  const handleUpdateProcedure = async () => {
    if (!editProcedureName.trim()) return;

    try {
      await updateCase(token, caseId, { procedureName: editProcedureName.trim() });
      setSuccessMessage('Procedure name updated');
      setIsEditingProcedure(false);
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update procedure');
    }
  };

  const handleCancelProcedureEdit = () => {
    setEditProcedureName(dashboard.procedureName);
    setIsEditingProcedure(false);
  };

  const handleUpdateSurgeon = async () => {
    if (!editSurgeonId) return;

    try {
      await updateCase(token, caseId, { surgeonId: editSurgeonId });
      setSuccessMessage('Surgeon updated');
      setIsEditingSurgeon(false);
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update surgeon');
    }
  };

  const handleCancelSurgeonEdit = () => {
    setEditSurgeonId(dashboard.surgeonId);
    setIsEditingSurgeon(false);
  };

  const handleAddOverride = async () => {
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
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add override');
    }
  };

  const handleRemoveOverride = async (overrideId: string) => {
    if (!confirm('Are you sure you want to remove this override?')) return;

    try {
      await removeCaseOverride(token, caseId, overrideId);
      setSuccessMessage('Override removed');
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove override');
    }
  };

  const handleLinkCaseCard = async (versionId: string) => {
    try {
      await linkCaseCard(token, caseId, versionId);
      setSuccessMessage('Case card linked');
      setShowLinkCaseCardModal(false);
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link preference card');
    }
  };

  const handleToggleActive = async () => {
    try {
      if (dashboard.isActive) {
        await deactivateCase(token, caseId);
        setSuccessMessage('Case deactivated');
      } else {
        await activateCase(token, caseId, {
          scheduledDate: dashboard.scheduledDate,
          scheduledTime: dashboard.scheduledTime || undefined,
        });
        setSuccessMessage('Case reactivated');
      }
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case status');
    }
  };

  const handlePrintPreferenceCard = async () => {
    if (!dashboard?.caseCard) return;

    try {
      const result = await getCaseCard(token, dashboard.caseCard.id);
      setPrintingCard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preference card for printing');
    }
  };

  const executePrint = () => {
    window.print();
  };

  const handlePrint = () => {
    setShowPrintModal(true);
  };

  const handleVerifyItems = () => {
    // Navigate to verify page with return params to re-open modal
    router.push(`/case/${caseId}/verify?returnTo=${encodeURIComponent(pathname || '/calendar')}&openModal=true`);
  };

  const getStatusColor = () => {
    if (!dashboard.isActive) return 'var(--text-muted)';
    if (dashboard.attestationState === 'VOIDED') return 'var(--red)';
    if (dashboard.attestationState === 'ATTESTED') return 'var(--green)';
    if (dashboard.readinessState === 'RED') return 'var(--red)';
    if (dashboard.readinessState === 'ORANGE') return 'var(--orange)';
    return 'var(--text-muted)';
  };

  const getStatusLabel = () => {
    if (!dashboard.isActive) return 'Inactive';
    if (dashboard.attestationState === 'VOIDED') return 'Voided';
    if (dashboard.attestationState === 'ATTESTED') return 'Ready (Attested)';
    if (dashboard.readinessState === 'RED') return 'Needs Attention';
    if (dashboard.readinessState === 'ORANGE') return 'Needs Attention';
    return 'Scheduled';
  };

  const getPrintStatusColor = () => {
    if (dashboard.attestationState === 'VOIDED') return '#e53e3e';
    if (dashboard.attestationState === 'ATTESTED') return '#38a169';
    if (dashboard.readinessState === 'RED') return '#e53e3e';
    if (dashboard.readinessState === 'ORANGE') return '#dd6b20';
    return '#718096';
  };

  return (
    <div className="case-dashboard-content">
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
            {/* Procedure Name - Editable */}
            {isEditingProcedure ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={editProcedureName}
                  onChange={e => setEditProcedureName(e.target.value)}
                  style={{ padding: '0.5rem', fontSize: '1.25rem', fontWeight: 'bold', width: '300px' }}
                  autoFocus
                />
                <button onClick={handleUpdateProcedure} className="btn-small btn-primary">Save</button>
                <button onClick={handleCancelProcedureEdit} className="btn-small btn-secondary">Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => setIsEditingProcedure(true)}
                  className="btn-primary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <span>&#9998;</span> Edit
                </button>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{dashboard.procedureName}</h1>
              </div>
            )}

            {/* Surgeon - Editable */}
            {isEditingSurgeon ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <select
                  value={editSurgeonId}
                  onChange={e => setEditSurgeonId(e.target.value)}
                  style={{ padding: '0.375rem', fontSize: '0.9rem' }}
                >
                  {surgeons.map(s => (
                    <option key={s.id} value={s.id}>Dr. {s.name}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)' }}>| {dashboard.facility}</span>
                <button onClick={handleUpdateSurgeon} className="btn-small btn-primary">Save</button>
                <button onClick={handleCancelSurgeonEdit} className="btn-small btn-secondary">Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <button
                  onClick={() => setIsEditingSurgeon(true)}
                  className="btn-primary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <span>&#9998;</span> Edit
                </button>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                  {dashboard.surgeon} | {dashboard.facility}
                </p>
              </div>
            )}

            {/* Scheduling - Editable */}
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
              <div style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setIsEditingScheduling(true)}
                  className="btn-primary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <span>&#9998;</span> Edit
                </button>
                <p style={{ margin: 0 }}>
                  <strong>Scheduled:</strong> {new Date(dashboard.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {dashboard.scheduledTime && ` at ${dashboard.scheduledTime}`}
                  {dashboard.orRoom && ` | OR: ${dashboard.orRoom}`}
                </p>
              </div>
            )}
            <p style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
              <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{dashboard.caseNumber}</strong>
              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                (ID: {dashboard.caseId.slice(0, 8)}...)
              </span>
            </p>
            {/* Deactivate/Reactivate button for ADMIN and SCHEDULER */}
            {((user.roles || [user.role]).includes('ADMIN') || (user.roles || [user.role]).includes('SCHEDULER')) && (
              <div style={{ margin: '0.5rem 0' }}>
                <button
                  onClick={handleToggleActive}
                  className={dashboard.isActive ? 'btn-secondary' : 'btn-primary'}
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                >
                  {dashboard.isActive ? 'Deactivate Case' : 'Reactivate Case'}
                </button>
                {!dashboard.isActive && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Case is currently inactive
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
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
            <button onClick={handlePrint} className="btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
              Print Case Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Section 1.25: Case Progress Strip */}
      <CaseProgressStrip dashboard={dashboard} checklists={checklists} />

      {/* Section 1.5: Readiness Summary Panel */}
      {(() => {
        const readiness: ReadinessSummary = computeReadinessSummary({
          caseId,
          readinessState: dashboard.readinessState as 'GREEN' | 'ORANGE' | 'RED' | undefined,
          missingItems: dashboard.missingItems,
          status: dashboard.status,
          isActive: dashboard.isActive,
          orRoom: dashboard.orRoom,
          scheduledDate: dashboard.scheduledDate,
          timeoutStatus: checklists?.timeout?.status || null,
          debriefStatus: checklists?.debrief?.status || null,
        });
        return (
          <section className="dashboard-section" style={{
            background: readiness.overall === 'READY' ? '#f0fff4' : readiness.overall === 'BLOCKED' ? '#fffbeb' : 'var(--surface)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            border: `1px solid ${readiness.overall === 'READY' ? '#c6f6d5' : readiness.overall === 'BLOCKED' ? '#fde68a' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: readiness.blockers.length > 0 ? '0.75rem' : 0 }}>
              <ReadinessBadge overall={readiness.overall} size="md" />
              <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                {readiness.overall === 'READY' ? 'All clear — this case is ready.'
                  : readiness.overall === 'BLOCKED' ? `${readiness.blockers.length} blocker${readiness.blockers.length !== 1 ? 's' : ''} found`
                  : 'Readiness status unavailable.'}
              </span>
            </div>
            {readiness.blockers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {readiness.blockers.map((blocker) => (
                  <div key={blocker.code} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    background: 'white',
                    borderRadius: '6px',
                    border: `1px solid ${blocker.severity === 'critical' ? '#fc8181' : '#fbd38d'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: blocker.severity === 'critical' ? '#e53e3e' : '#dd6b20',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: '0.875rem' }}>{blocker.label}</span>
                    </div>
                    {blocker.capability && !hasCapability(blocker.capability as any) ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Requires {capabilityLabel(blocker.capability)}
                      </span>
                    ) : (
                      <button
                        className="btn-small btn-primary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}
                        onClick={() => router.push(blocker.href)}
                      >
                        {blocker.actionLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ExplainReadinessPanel
              token={token}
              caseId={caseId}
              dashboard={dashboard}
              readiness={readiness}
            />
          </section>
        );
      })()}

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
                onClick={handleVerifyItems}
                className="btn-secondary"
              >
                Verify Items
              </button>
              {dashboard.attestationState !== 'ATTESTED' && (
                <button
                  onClick={handleAttest}
                  className="btn-primary"
                  disabled={!dashboard.caseCard || !dashboard.anesthesiaPlan?.modalities?.length}
                  title={!dashboard.caseCard ? 'Link a Preference Card first' : !dashboard.anesthesiaPlan?.modalities?.length ? 'Select anesthesia modality first' : ''}
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

      {/* Section 2.5: Workflow — capability-gated workflow entry points */}
      {(hasCapability('VERIFY_SCAN') || hasCapability('OR_TIMEOUT') || hasCapability('OR_DEBRIEF') || hasCapability('INVENTORY_CHECKIN') || hasCapability('INVENTORY_MANAGE')) && (
        <section className="dashboard-section" style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: '0 0 1rem 0', cursor: 'pointer' }} onClick={() => toggleSection('orWorkflow')}>
            {collapsedSections.has('orWorkflow') ? '+ ' : '- '}Workflow
          </h2>
          {!collapsedSections.has('orWorkflow') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

              {/* Verify Scanning Card */}
              {hasCapability('VERIFY_SCAN') && (() => {
                const verifyStatus = dashboard.readinessState === 'GREEN' ? 'COMPLETED'
                  : dashboard.readinessState === 'ORANGE' ? 'IN_PROGRESS' : null;
                const verifyEnabled = dashboard.isActive;
                const verifyLabel = verifyStatus === 'COMPLETED' ? 'View Verification'
                  : verifyStatus === 'IN_PROGRESS' ? 'Continue Verification' : 'Start Verification';
                const verifyPillLabel = statusLabel(verifyStatus);
                return (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    background: verifyStatus === 'COMPLETED' ? 'var(--color-green-bg)' :
                               verifyStatus === 'IN_PROGRESS' ? 'var(--color-orange-bg)' : 'transparent',
                    opacity: verifyEnabled ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Verify Scanning</h3>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: verifyStatus === 'COMPLETED' ? 'var(--color-green)' :
                                   verifyStatus === 'IN_PROGRESS' ? 'var(--color-orange)' : 'var(--color-gray-300)',
                        color: verifyStatus ? 'white' : 'var(--text-muted)',
                      }}>
                        {verifyPillLabel}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Scan and verify items required for this case.
                    </p>
                    {!verifyEnabled && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--color-orange)' }}>
                        Case must be active to verify items.
                      </p>
                    )}
                    <button
                      onClick={handleVerifyItems}
                      className={verifyStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}
                      style={{ width: '100%' }}
                      disabled={!verifyEnabled}
                    >
                      {verifyLabel}
                    </button>
                  </div>
                );
              })()}

              {/* OR Timeout Card */}
              {hasCapability('OR_TIMEOUT') && checklists?.featureEnabled && (() => {
                const timeoutEnabled = dashboard.isActive;
                const timeoutStatus = checklists.timeout?.status || null;
                const timeoutLabel = timeoutStatus === 'COMPLETED' ? 'View Timeout'
                  : timeoutStatus === 'IN_PROGRESS' ? 'Continue Timeout' : 'Start Timeout';
                return (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    background: timeoutStatus === 'COMPLETED' ? 'var(--color-green-bg)' :
                               timeoutStatus === 'IN_PROGRESS' ? 'var(--color-orange-bg)' : 'transparent',
                    opacity: timeoutEnabled ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>OR Timeout</h3>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: timeoutStatus === 'COMPLETED' ? 'var(--color-green)' :
                                   timeoutStatus === 'IN_PROGRESS' ? 'var(--color-orange)' : 'var(--color-gray-300)',
                        color: timeoutStatus ? 'white' : 'var(--text-muted)',
                      }}>
                        {statusLabel(timeoutStatus)}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Pre-surgery safety checklist to verify patient, procedure, and site.
                    </p>
                    {checklists.timeout?.completedAt && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Completed: {new Date(checklists.timeout.completedAt).toLocaleString()}
                      </p>
                    )}
                    {!timeoutEnabled && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--color-orange)' }}>
                        Case must be active to start timeout.
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/or/timeout/${caseId}`)}
                      className={timeoutStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}
                      style={{ width: '100%' }}
                      disabled={!timeoutEnabled}
                    >
                      {timeoutLabel}
                    </button>
                  </div>
                );
              })()}

              {/* OR Debrief Card */}
              {hasCapability('OR_DEBRIEF') && checklists?.featureEnabled && (() => {
                const debriefEnabled = dashboard.isActive && checklists.timeout?.status === 'COMPLETED';
                const debriefStatus = checklists.debrief?.status || null;
                const debriefLabel = debriefStatus === 'COMPLETED' ? 'View Debrief'
                  : debriefStatus === 'IN_PROGRESS' ? 'Continue Debrief' : 'Start Debrief';
                const disabledReason = !dashboard.isActive ? 'Case must be active to start debrief.'
                  : checklists.timeout?.status !== 'COMPLETED' ? 'Complete Timeout first.' : '';
                return (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    background: debriefStatus === 'COMPLETED' ? 'var(--color-green-bg)' :
                               debriefStatus === 'IN_PROGRESS' ? 'var(--color-orange-bg)' : 'transparent',
                    opacity: debriefEnabled ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{TERMS.DEBRIEF}</h3>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: debriefStatus === 'COMPLETED' ? 'var(--color-green)' :
                                   debriefStatus === 'IN_PROGRESS' ? 'var(--color-orange)' : 'var(--color-gray-300)',
                        color: debriefStatus ? 'white' : 'var(--text-muted)',
                      }}>
                        {statusLabel(debriefStatus)}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Post-surgery review of counts, specimens, and improvement notes.
                    </p>
                    {checklists.debrief?.completedAt && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Completed: {new Date(checklists.debrief.completedAt).toLocaleString()}
                      </p>
                    )}
                    {disabledReason && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--color-orange)' }}>
                        {disabledReason}
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/or/debrief/${caseId}`)}
                      className={debriefStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}
                      style={{ width: '100%' }}
                      disabled={!debriefEnabled}
                    >
                      {debriefLabel}
                    </button>
                  </div>
                );
              })()}

              {/* Inventory Check-In Card */}
              {(hasCapability('INVENTORY_CHECKIN') || hasCapability('INVENTORY_MANAGE')) && (() => {
                const inventoryEnabled = dashboard.isActive;
                const hasMissing = dashboard.missingItems && dashboard.missingItems.length > 0;
                const inventoryStatus = dashboard.readinessState === 'GREEN' && !hasMissing ? 'READY'
                  : hasMissing ? 'ITEMS_NEEDED' : null;
                const inventoryLabel = inventoryStatus === 'READY' ? 'View Inventory'
                  : inventoryStatus === 'ITEMS_NEEDED' ? 'Check-In Items' : 'Start Check-In';
                const inventoryPillLabel = inventoryStatus === 'READY' ? 'Ready'
                  : inventoryStatus === 'ITEMS_NEEDED' ? `${dashboard.missingItems.length} Needed` : statusLabel(null);
                return (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    background: inventoryStatus === 'READY' ? 'var(--color-green-bg)' :
                               inventoryStatus === 'ITEMS_NEEDED' ? 'var(--color-orange-bg)' : 'transparent',
                    opacity: inventoryEnabled ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Inventory Check-In</h3>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: inventoryStatus === 'READY' ? 'var(--color-green)' :
                                   inventoryStatus === 'ITEMS_NEEDED' ? 'var(--color-orange)' : 'var(--color-gray-300)',
                        color: inventoryStatus ? 'white' : 'var(--text-muted)',
                      }}>
                        {inventoryPillLabel}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Scan and check in inventory items for this case.
                    </p>
                    {!inventoryEnabled && (
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--color-orange)' }}>
                        Case must be active to check in items.
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/admin/inventory/check-in?caseId=${caseId}`)}
                      className={inventoryStatus === 'READY' ? 'btn-secondary' : 'btn-primary'}
                      style={{ width: '100%' }}
                      disabled={!inventoryEnabled}
                    >
                      {inventoryLabel}
                    </button>
                  </div>
                );
              })()}

            </div>
          )}
        </section>
      )}

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
                <label>Case Type</label>
                <select
                  value={summaryForm.caseType}
                  onChange={e => setSummaryForm(f => ({ ...f, caseType: e.target.value as typeof summaryForm.caseType }))}
                >
                  {CASE_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
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
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Procedure Codes (CPT) - comma separated</label>
              <input
                type="text"
                value={summaryForm.procedureCodes.join(', ')}
                onChange={e => setSummaryForm(f => ({ ...f, procedureCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                placeholder="e.g., 27130, 27447"
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Admission Type <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
              <div className="pill-toggle-group">
                {[
                  { key: 'outpatient', label: 'Outpatient' },
                  { key: 'twentyThreeHrObs', label: '23 HR Obs' },
                  { key: 'admin', label: 'Admin' },
                ].map(type => (
                  <label key={type.key} className="pill-toggle">
                    <input
                      type="checkbox"
                      checked={(summaryForm.admissionTypes as Record<string, boolean>)[type.key] || false}
                      onChange={e => setSummaryForm(f => ({ ...f, admissionTypes: { ...f.admissionTypes, [type.key]: e.target.checked } }))}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Patient-Specific Flags (Non-PHI) <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
              <div className="pill-toggle-group">
                {patientFlagOptions.map(flag => (
                  <label key={flag.itemKey} className="pill-toggle">
                    <input
                      type="checkbox"
                      checked={(summaryForm.patientFlags as Record<string, boolean>)[flag.itemKey] || false}
                      onChange={e => setSummaryForm(f => ({ ...f, patientFlags: { ...f.patientFlags, [flag.itemKey]: e.target.checked } }))}
                    />
                    {flag.displayLabel}
                  </label>
                ))}
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
              <label>Modality * <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
              <div className="pill-toggle-group">
                {anesthesiaModalities.map(m => (
                  <label key={m.itemKey} className="pill-toggle">
                    <input
                      type="checkbox"
                      checked={anesthesiaForm.modalities.includes(m.itemKey as AnesthesiaModality)}
                      onChange={() => toggleModality(m.itemKey as AnesthesiaModality)}
                    />
                    {m.displayLabel}
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
          {collapsedSections.has('caseCard') ? '+ ' : '- '}Linked {TERMS.PREFERENCE_CARD}
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
              <p style={{ color: 'var(--red)', marginBottom: '1rem' }}>No {TERMS.PREFERENCE_CARD} linked. Link a {TERMS.PREFERENCE_CARD} to enable attestation.</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowLinkCaseCardModal(true)} className="btn-secondary">
                {dashboard.caseCard ? `Change ${TERMS.PREFERENCE_CARD}` : `Link ${TERMS.PREFERENCE_CARD}`}
              </button>
              {dashboard.caseCard && (
                <button
                  onClick={handlePrintPreferenceCard}
                  className="btn-secondary"
                >
                  Print Active {TERMS.PREFERENCE_CARD}
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

      {/* Close button */}
      <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={onClose} className="btn-secondary">
          Close
        </button>
        <button onClick={handlePrint} className="btn-secondary">
          Print Case Dashboard
        </button>
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="modal-overlay nested-modal" onClick={() => setShowVoidModal(false)}>
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
        <div className="modal-overlay nested-modal" onClick={() => setShowOverrideModal(false)}>
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
        <div className="modal-overlay nested-modal" onClick={() => setShowLinkCaseCardModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h3>Link {TERMS.PREFERENCE_CARD}</h3>
            <p>Select an active preference card to link to this case:</p>
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
                    No active preference cards found for this surgeon.
                  </p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No active preference cards available.</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowLinkCaseCardModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Event Log Modal */}
      {showEventLogModal && (
        <div className="modal-overlay nested-modal" onClick={() => setShowEventLogModal(false)}>
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
        <CaseDashboardPrintView
          dashboard={dashboard}
          patientFlagOptions={patientFlagOptions}
          anesthesiaModalities={anesthesiaModalities}
          facilityName={user?.facilityName}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Print Preference Card Modal */}
      {printingCard && (
        <div className="modal-overlay print-modal-overlay" onClick={() => setPrintingCard(null)}>
          <div className="modal-content print-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Print Preference Card</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={executePrint}>Print</button>
                <button className="btn-secondary" onClick={() => setPrintingCard(null)}>Close</button>
              </div>
            </div>
            <div className="print-content">
              <div className="print-header" style={{ borderBottom: '2px solid #3182ce', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>{printingCard.card.procedureName}</h1>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                  <span><strong>Surgeon:</strong> {printingCard.card.surgeonName}</span>
                  <span><strong>Version:</strong> v{printingCard.card.version}</span>
                  <span><strong>Status:</strong> {printingCard.card.status}</span>
                </div>
                {printingCard.card.turnoverNotes && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f7fafc', borderRadius: '4px', fontSize: '0.875rem' }}>
                    <strong>Turnover Notes:</strong> {printingCard.card.turnoverNotes}
                  </div>
                )}
              </div>

              {printingCard.currentVersion && (() => {
                const inst = printingCard.currentVersion.instrumentation as Record<string, unknown> | undefined;
                const equip = printingCard.currentVersion.equipment as Record<string, unknown> | undefined;
                const supp = printingCard.currentVersion.supplies as Record<string, unknown> | undefined;
                const meds = printingCard.currentVersion.medications as Record<string, unknown> | undefined;
                const setup = printingCard.currentVersion.setupPositioning as Record<string, unknown> | undefined;
                const notes = printingCard.currentVersion.surgeonNotes as Record<string, unknown> | undefined;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Instrumentation */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Instrumentation</h3>
                      {inst && Object.values(inst).some(v => v) ? (
                        <>
                          {Boolean(inst.primaryTrays) && <div style={{ marginBottom: '0.5rem' }}><strong>Primary Trays:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(inst.primaryTrays)}</pre></div>}
                          {Boolean(inst.supplementalTrays) && <div style={{ marginBottom: '0.5rem' }}><strong>Supplemental Trays:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(inst.supplementalTrays)}</pre></div>}
                          {Boolean(inst.looseInstruments) && <div style={{ marginBottom: '0.5rem' }}><strong>Loose Instruments:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(inst.looseInstruments)}</pre></div>}
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {Boolean(inst.flashAllowed) && <span style={{ background: '#bee3f8', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Flash Sterilization Allowed</span>}
                            {Boolean(inst.peelPackOnly) && <span style={{ background: '#bee3f8', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Peel Pack Only</span>}
                          </div>
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No instrumentation documented</p>}
                    </div>

                    {/* Equipment */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Equipment</h3>
                      {equip && Object.values(equip).some(v => v) ? (
                        <>
                          {Boolean(equip.energyDevices) && <div style={{ marginBottom: '0.5rem' }}><strong>Energy Devices:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(equip.energyDevices)}</pre></div>}
                          {Boolean(equip.tourniquetLocation || equip.tourniquetPressure) && <div style={{ marginBottom: '0.5rem' }}><strong>Tourniquet:</strong> {String(equip.tourniquetLocation || '')} {equip.tourniquetPressure ? `@ ${equip.tourniquetPressure}` : ''}</div>}
                          {Boolean(equip.imaging) && <div style={{ marginBottom: '0.5rem' }}><strong>Imaging:</strong> {String(equip.imaging)}</div>}
                          {Boolean(equip.specializedDevices) && <div style={{ marginBottom: '0.5rem' }}><strong>Specialized Devices:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(equip.specializedDevices)}</pre></div>}
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No equipment documented</p>}
                    </div>

                    {/* Supplies */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Supplies</h3>
                      {supp && Object.values(supp).some(v => v) ? (
                        <>
                          {Boolean(supp.gloves) && <div style={{ marginBottom: '0.5rem' }}><strong>Gloves:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(supp.gloves)}</pre></div>}
                          {Boolean(supp.drapes) && <div style={{ marginBottom: '0.5rem' }}><strong>Drapes:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(supp.drapes)}</pre></div>}
                          {Boolean(supp.implants) && <div style={{ marginBottom: '0.5rem' }}><strong>Implants:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(supp.implants)}</pre></div>}
                          {Boolean(supp.sutures) && <div style={{ marginBottom: '0.5rem' }}><strong>Sutures:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(supp.sutures)}</pre></div>}
                          {Boolean(supp.disposables) && <div style={{ marginBottom: '0.5rem' }}><strong>Disposables:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(supp.disposables)}</pre></div>}
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No supplies documented</p>}
                    </div>

                    {/* Medications */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Medications & Solutions</h3>
                      {meds && Object.values(meds).some(v => v) ? (
                        <>
                          {Boolean(meds.localAnesthetic) && <div style={{ marginBottom: '0.5rem' }}><strong>Local Anesthetic:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(meds.localAnesthetic)}</pre></div>}
                          {Boolean(meds.antibiotics) && <div style={{ marginBottom: '0.5rem' }}><strong>Antibiotics:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(meds.antibiotics)}</pre></div>}
                          {Boolean(meds.irrigation) && <div style={{ marginBottom: '0.5rem' }}><strong>Irrigation:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(meds.irrigation)}</pre></div>}
                          {Boolean(meds.topicalAgents) && <div style={{ marginBottom: '0.5rem' }}><strong>Topical Agents:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(meds.topicalAgents)}</pre></div>}
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No medications/solutions documented</p>}
                    </div>

                    {/* Setup & Positioning */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Setup & Positioning</h3>
                      {setup && Object.values(setup).some(v => v) ? (
                        <>
                          {Boolean(setup.patientPosition) && <div style={{ marginBottom: '0.5rem' }}><strong>Patient Position:</strong> {String(setup.patientPosition)}</div>}
                          {Boolean(setup.tableConfiguration) && <div style={{ marginBottom: '0.5rem' }}><strong>Table Configuration:</strong> {String(setup.tableConfiguration)}</div>}
                          {Boolean(setup.paddingRequirements) && <div style={{ marginBottom: '0.5rem' }}><strong>Padding:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(setup.paddingRequirements)}</pre></div>}
                          {Boolean(setup.mayoStandCount || setup.mayoStandPlacement) && <div style={{ marginBottom: '0.5rem' }}><strong>Mayo Stand:</strong> {setup.mayoStandCount ? `${setup.mayoStandCount}x` : ''} {String(setup.mayoStandPlacement || '')}</div>}
                          {Boolean(setup.backTableNotes) && <div style={{ marginBottom: '0.5rem' }}><strong>Back Table:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(setup.backTableNotes)}</pre></div>}
                          {Boolean(setup.orFlowNotes) && <div style={{ marginBottom: '0.5rem' }}><strong>OR Flow Notes:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(setup.orFlowNotes)}</pre></div>}
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No setup/positioning documented</p>}
                    </div>

                    {/* Surgeon Notes */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Surgeon Notes & Preferences</h3>
                      {notes && Object.values(notes).some(v => v) ? (
                        <>
                          {Boolean(notes.preferences) && <div style={{ marginBottom: '0.5rem' }}><strong>Preferences:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(notes.preferences)}</pre></div>}
                          {Boolean(notes.holdPrnItems) && <div style={{ marginBottom: '0.5rem' }}><strong>Hold / PRN Items:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(notes.holdPrnItems)}</pre></div>}
                          {Boolean(notes.decisionTriggers) && <div style={{ marginBottom: '0.5rem' }}><strong>Decision Triggers:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(notes.decisionTriggers)}</pre></div>}
                          {Boolean(notes.teachingModifiers) && <div style={{ marginBottom: '0.5rem' }}><strong>Teaching Case Modifiers:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(notes.teachingModifiers)}</pre></div>}
                          {Boolean(notes.revisionAddOns) && <div style={{ marginBottom: '0.5rem' }}><strong>Revision-Only Add-Ons:</strong><pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', background: '#f7fafc', padding: '0.5rem', borderRadius: '4px' }}>{String(notes.revisionAddOns)}</pre></div>}
                        </>
                      ) : <p style={{ color: '#718096', fontStyle: 'italic' }}>No surgeon notes/preferences documented</p>}
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#718096' }}>
                <span>Printed: {new Date().toLocaleString()}</span>
                <span>Facility: {user?.facilityName}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .case-dashboard-content {
          padding: 0;
        }

        .nested-modal {
          z-index: 1100;
        }

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
            padding: 0;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
          .print-content > div > div {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-header {
            break-after: avoid;
            page-break-after: avoid;
          }
          .print-content {
            font-size: 11pt;
          }
          .print-content h1 {
            font-size: 16pt;
          }
          .print-content h3, .print-content h4 {
            font-size: 12pt;
          }
          .print-content span[style*="background"] {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
