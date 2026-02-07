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
  checkInPreop,
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

  // Compute readiness summary once for consistent status across the dashboard
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

  const getStatusColor = () => {
    if (!dashboard.isActive) return 'var(--text-muted)';
    if (dashboard.attestationState === 'VOIDED') return 'var(--red)';
    if (dashboard.attestationState === 'ATTESTED') return 'var(--green)';
    // Use computed readiness to determine color
    if (readiness.overall === 'BLOCKED') {
      // Check if any blockers are critical
      const hasCritical = readiness.blockers.some(b => b.severity === 'critical');
      return hasCritical ? 'var(--red)' : 'var(--orange)';
    }
    if (readiness.overall === 'READY') return 'var(--green)';
    return 'var(--text-muted)';
  };

  const getStatusLabel = () => {
    if (!dashboard.isActive) return 'Inactive';
    if (dashboard.attestationState === 'VOIDED') return 'Voided';
    if (dashboard.attestationState === 'ATTESTED') return 'Ready (Attested)';
    // Use computed readiness to determine label
    if (readiness.overall === 'BLOCKED') return 'Needs Attention';
    if (readiness.overall === 'READY') return 'Ready';
    return 'Scheduled';
  };

  const getPrintStatusColor = () => {
    if (dashboard.attestationState === 'VOIDED') return '#e53e3e';
    if (dashboard.attestationState === 'ATTESTED') return '#38a169';
    // Use computed readiness for consistent status
    if (readiness.overall === 'BLOCKED') {
      const hasCritical = readiness.blockers.some(b => b.severity === 'critical');
      return hasCritical ? '#e53e3e' : '#dd6b20';
    }
    if (readiness.overall === 'READY') return '#38a169';
    return '#718096';
  };

  return (
    <div>
      {/* Messages */}
      {error && (
        <div className="error-message mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-4">Dismiss</button>
        </div>
      )}
      {successMessage && (
        <div className="success-message mb-4">
          {successMessage}
          <button onClick={() => setSuccessMessage('')} className="ml-4">Dismiss</button>
        </div>
      )}

      {/* Section 1: Case Identity & Status Banner */}
      <section className="dashboard-section" style={{ padding: '1.5rem', border: `3px solid ${getStatusColor()}` }}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            {/* Procedure Name - Editable */}
            {isEditingProcedure ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={editProcedureName}
                  onChange={e => setEditProcedureName(e.target.value)}
                  className="p-2 text-xl font-bold w-[300px]"
                  autoFocus
                />
                <button onClick={handleUpdateProcedure} className="btn-small btn-primary">Save</button>
                <button onClick={handleCancelProcedureEdit} className="btn-small btn-secondary">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingProcedure(true)}
                  className="btn-primary py-1 px-2 text-xs"
                >
                  <span>&#9998;</span> Edit
                </button>
                <h1 className="text-2xl">{dashboard.procedureName}</h1>
              </div>
            )}

            {/* Surgeon - Editable */}
            {isEditingSurgeon ? (
              <div className="flex items-center gap-2 my-2">
                <select
                  value={editSurgeonId}
                  onChange={e => setEditSurgeonId(e.target.value)}
                  className="py-1.5 text-sm"
                >
                  {surgeons.map(s => (
                    <option key={s.id} value={s.id}>Dr. {s.name}</option>
                  ))}
                </select>
                <span className="text-text-muted">| {dashboard.facility}</span>
                <button onClick={handleUpdateSurgeon} className="btn-small btn-primary">Save</button>
                <button onClick={handleCancelSurgeonEdit} className="btn-small btn-secondary">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 my-2">
                <button
                  onClick={() => setIsEditingSurgeon(true)}
                  className="btn-primary py-1 px-2 text-xs"
                >
                  <span>&#9998;</span> Edit
                </button>
                <p className="text-text-muted">
                  {dashboard.surgeon} | {dashboard.facility}
                </p>
              </div>
            )}

            {/* Scheduling - Editable */}
            {isEditingScheduling ? (
              <div className="my-2 flex items-center gap-2 flex-wrap">
                <strong>Scheduled:</strong>
                <input
                  type="date"
                  value={schedulingForm.scheduledDate}
                  onChange={e => setSchedulingForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="py-1 px-2 text-sm"
                />
                <span>at</span>
                <input
                  type="time"
                  value={schedulingForm.scheduledTime}
                  onChange={e => setSchedulingForm(f => ({ ...f, scheduledTime: e.target.value }))}
                  className="py-1 px-2 text-sm"
                />
                <span>| OR:</span>
                <input
                  type="text"
                  value={schedulingForm.orRoom}
                  onChange={e => setSchedulingForm(f => ({ ...f, orRoom: e.target.value }))}
                  placeholder="OR Room"
                  className="py-1 px-2 text-sm w-20"
                />
                <button onClick={handleUpdateScheduling} className="btn-small btn-primary">
                  Save
                </button>
                <button onClick={handleCancelSchedulingEdit} className="btn-small btn-secondary">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="my-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setIsEditingScheduling(true)}
                  className="btn-primary py-1 px-2 text-xs"
                >
                  <span>&#9998;</span> Edit
                </button>
                <p>
                  <strong>Scheduled:</strong> {new Date(dashboard.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {dashboard.scheduledTime && ` at ${dashboard.scheduledTime}`}
                  {dashboard.orRoom && ` | OR: ${dashboard.orRoom}`}
                </p>
              </div>
            )}
            <p className="my-2 text-[0.95rem]">
              <strong className="font-mono text-[1.1rem]">{dashboard.caseNumber}</strong>
              <span className="ml-2 text-xs text-text-muted">
                (ID: {dashboard.caseId.slice(0, 8)}...)
              </span>
            </p>
            {/* Deactivate/Reactivate button for ADMIN and SCHEDULER */}
            {((user.roles || [user.role]).includes('ADMIN') || (user.roles || [user.role]).includes('SCHEDULER')) && (
              <div className="my-2">
                <button
                  onClick={handleToggleActive}
                  className={`text-sm py-1.5 px-3 ${dashboard.isActive ? 'btn-secondary' : 'btn-primary'}`}
                >
                  {dashboard.isActive ? 'Deactivate Case' : 'Reactivate Case'}
                </button>
                {!dashboard.isActive && (
                  <span className="ml-2 text-xs text-text-muted">
                    Case is currently inactive
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div
              className="inline-block py-2 px-4 rounded font-bold text-[1.1rem] text-white"
              style={{ background: getStatusColor() }}
            >
              {getStatusLabel()}
            </div>
            <button onClick={handlePrint} className="btn-secondary text-sm py-1.5 px-3">
              Print Case Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Section 1.25: Case Progress Strip */}
      <CaseProgressStrip dashboard={dashboard} checklists={checklists} />

      {/* Section 1.5: Readiness Summary Panel */}
      <section
        className="dashboard-section"
        style={{
          background: readiness.overall === 'READY' ? '#f0fff4' : readiness.overall === 'BLOCKED' ? '#fffbeb' : undefined,
          borderColor: readiness.overall === 'READY' ? '#c6f6d5' : readiness.overall === 'BLOCKED' ? '#fde68a' : undefined,
        }}
      >
        <div className={`flex items-center gap-3 ${readiness.blockers.length > 0 ? 'mb-3' : ''}`}>
          <ReadinessBadge overall={readiness.overall} size="md" />
          <span className="text-base font-semibold">
            {readiness.overall === 'READY' ? 'All clear — this case is ready.'
              : readiness.overall === 'BLOCKED' ? `${readiness.blockers.length} blocker${readiness.blockers.length !== 1 ? 's' : ''} found`
              : 'Readiness status unavailable.'}
          </span>
        </div>
        {readiness.blockers.length > 0 && (
          <div className="flex flex-col gap-2">
            {readiness.blockers.map((blocker) => (
              <div
                key={blocker.code}
                className={`flex justify-between items-center py-2 px-3 bg-white rounded-md border ${
                  blocker.severity === 'critical' ? 'border-[#fc8181]' : 'border-[#fbd38d]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    blocker.severity === 'critical' ? 'bg-[#e53e3e]' : 'bg-[#dd6b20]'
                  }`} />
                  <span className="text-sm">{blocker.label}</span>
                </div>
                {blocker.capability && !hasCapability(blocker.capability as any) ? (
                  <span className="text-xs text-text-muted italic">
                    Requires {capabilityLabel(blocker.capability)}
                  </span>
                ) : (
                  <button
                    className="btn-small btn-primary text-xs whitespace-nowrap"
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

      {/* Section 2: Readiness Attestation Panel */}
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('attestation')}>
          {collapsedSections.has('attestation') ? '+ ' : '- '}Readiness Attestation
        </h2>
        {!collapsedSections.has('attestation') && (
          <div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
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
            <div className="flex gap-2">
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
      {(hasCapability('CASE_CHECKIN_PREOP') || hasCapability('VERIFY_SCAN') || hasCapability('OR_TIMEOUT') || hasCapability('OR_DEBRIEF') || hasCapability('INVENTORY_CHECKIN') || hasCapability('INVENTORY_MANAGE')) && (
        <section className="dashboard-section">
          <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('orWorkflow')}>
            {collapsedSections.has('orWorkflow') ? '+ ' : '- '}Workflow
          </h2>
          {!collapsedSections.has('orWorkflow') && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">

              {/* Check In to PreOp Card */}
              {hasCapability('CASE_CHECKIN_PREOP') && (() => {
                const isScheduled = dashboard.status === 'SCHEDULED';
                const isInPreop = dashboard.status === 'IN_PREOP';
                const preopEnabled = isScheduled;
                const preopStatus = isInPreop ? 'COMPLETED' : isScheduled ? null : 'COMPLETED';

                // Don't show if case has moved past PreOp stage
                if (!isScheduled && !isInPreop) return null;

                const handleCheckIn = async () => {
                  try {
                    await checkInPreop(token, caseId);
                    setSuccessMessage('Patient checked in to PreOp');
                    onDataChange();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to check in to PreOp');
                  }
                };

                return (
                  <div className={`border border-border rounded-lg p-4 ${
                    preopStatus === 'COMPLETED' ? 'bg-[var(--color-green-bg)]' : ''
                  } ${preopEnabled ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[1.1rem]">Check In to PreOp</h3>
                      <span className={`py-1 px-2 rounded text-xs font-bold ${
                        preopStatus === 'COMPLETED'
                          ? 'bg-[var(--color-green)] text-white'
                          : 'bg-[var(--color-gray-300)] text-text-muted'
                      }`}>
                        {preopStatus === 'COMPLETED' ? 'Checked In' : 'Pending'}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-text-muted">
                      Check the patient in to the preoperative area.
                    </p>
                    {isInPreop && (
                      <p className="mb-2 text-xs text-text-muted">
                        Patient is in PreOp.
                      </p>
                    )}
                    <button
                      onClick={handleCheckIn}
                      className={`w-full ${preopStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={!preopEnabled}
                    >
                      {preopStatus === 'COMPLETED' ? 'In PreOp' : 'Check In'}
                    </button>
                  </div>
                );
              })()}

              {/* Verify Scanning Card */}
              {hasCapability('VERIFY_SCAN') && (() => {
                const verifyStatus = dashboard.readinessState === 'GREEN' ? 'COMPLETED'
                  : dashboard.readinessState === 'ORANGE' ? 'IN_PROGRESS' : null;
                const verifyEnabled = dashboard.isActive;
                const verifyLabel = verifyStatus === 'COMPLETED' ? 'View Verification'
                  : verifyStatus === 'IN_PROGRESS' ? 'Continue Verification' : 'Start Verification';
                const verifyPillLabel = statusLabel(verifyStatus);
                return (
                  <div className={`border border-border rounded-lg p-4 ${
                    verifyStatus === 'COMPLETED' ? 'bg-[var(--color-green-bg)]' :
                    verifyStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange-bg)]' : ''
                  } ${verifyEnabled ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[1.1rem]">Verify Scanning</h3>
                      <span className={`py-1 px-2 rounded text-xs font-bold ${
                        verifyStatus === 'COMPLETED' ? 'bg-[var(--color-green)] text-white' :
                        verifyStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange)] text-white' :
                        'bg-[var(--color-gray-300)] text-text-muted'
                      }`}>
                        {verifyPillLabel}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-text-muted">
                      Scan and verify items required for this case.
                    </p>
                    {!verifyEnabled && (
                      <p className="mb-2 text-xs text-[var(--color-orange)]">
                        Case must be active to verify items.
                      </p>
                    )}
                    <button
                      onClick={handleVerifyItems}
                      className={`w-full ${verifyStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}`}
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
                  <div className={`border border-border rounded-lg p-4 ${
                    timeoutStatus === 'COMPLETED' ? 'bg-[var(--color-green-bg)]' :
                    timeoutStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange-bg)]' : ''
                  } ${timeoutEnabled ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[1.1rem]">OR Timeout</h3>
                      <span className={`py-1 px-2 rounded text-xs font-bold ${
                        timeoutStatus === 'COMPLETED' ? 'bg-[var(--color-green)] text-white' :
                        timeoutStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange)] text-white' :
                        'bg-[var(--color-gray-300)] text-text-muted'
                      }`}>
                        {statusLabel(timeoutStatus)}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-text-muted">
                      Pre-surgery safety checklist to verify patient, procedure, and site.
                    </p>
                    {checklists.timeout?.completedAt && (
                      <p className="mb-2 text-xs text-text-muted">
                        Completed: {new Date(checklists.timeout.completedAt).toLocaleString()}
                      </p>
                    )}
                    {!timeoutEnabled && (
                      <p className="mb-2 text-xs text-[var(--color-orange)]">
                        Case must be active to start timeout.
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/or/timeout/${caseId}`)}
                      className={`w-full ${timeoutStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}`}
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
                  <div className={`border border-border rounded-lg p-4 ${
                    debriefStatus === 'COMPLETED' ? 'bg-[var(--color-green-bg)]' :
                    debriefStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange-bg)]' : ''
                  } ${debriefEnabled ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[1.1rem]">{TERMS.DEBRIEF}</h3>
                      <span className={`py-1 px-2 rounded text-xs font-bold ${
                        debriefStatus === 'COMPLETED' ? 'bg-[var(--color-green)] text-white' :
                        debriefStatus === 'IN_PROGRESS' ? 'bg-[var(--color-orange)] text-white' :
                        'bg-[var(--color-gray-300)] text-text-muted'
                      }`}>
                        {statusLabel(debriefStatus)}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-text-muted">
                      Post-surgery review of counts, specimens, and improvement notes.
                    </p>
                    {checklists.debrief?.completedAt && (
                      <p className="mb-2 text-xs text-text-muted">
                        Completed: {new Date(checklists.debrief.completedAt).toLocaleString()}
                      </p>
                    )}
                    {disabledReason && (
                      <p className="mb-2 text-xs text-[var(--color-orange)]">
                        {disabledReason}
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/or/debrief/${caseId}`)}
                      className={`w-full ${debriefStatus === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'}`}
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
                  <div className={`border border-border rounded-lg p-4 ${
                    inventoryStatus === 'READY' ? 'bg-[var(--color-green-bg)]' :
                    inventoryStatus === 'ITEMS_NEEDED' ? 'bg-[var(--color-orange-bg)]' : ''
                  } ${inventoryEnabled ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[1.1rem]">Inventory Check-In</h3>
                      <span className={`py-1 px-2 rounded text-xs font-bold ${
                        inventoryStatus === 'READY' ? 'bg-[var(--color-green)] text-white' :
                        inventoryStatus === 'ITEMS_NEEDED' ? 'bg-[var(--color-orange)] text-white' :
                        'bg-[var(--color-gray-300)] text-text-muted'
                      }`}>
                        {inventoryPillLabel}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-text-muted">
                      Scan and check in inventory items for this case.
                    </p>
                    {!inventoryEnabled && (
                      <p className="mb-2 text-xs text-[var(--color-orange)]">
                        Case must be active to check in items.
                      </p>
                    )}
                    <button
                      onClick={() => router.push(`/admin/inventory/check-in?caseId=${caseId}`)}
                      className={`w-full ${inventoryStatus === 'READY' ? 'btn-secondary' : 'btn-primary'}`}
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
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('summary')}>
          {collapsedSections.has('summary') ? '+ ' : '- '}Case Summary
        </h2>
        {!collapsedSections.has('summary') && (
          <div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
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
            <div className="form-group mb-4">
              <label>Procedure Codes (CPT) - comma separated</label>
              <input
                type="text"
                value={summaryForm.procedureCodes.join(', ')}
                onChange={e => setSummaryForm(f => ({ ...f, procedureCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                placeholder="e.g., 27130, 27447"
              />
            </div>
            <div className="form-group mb-4">
              <label>Admission Type <span className="font-normal text-text-muted">(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
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
            <div className="form-group mb-4">
              <label>Patient-Specific Flags (Non-PHI) <span className="font-normal text-text-muted">(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
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
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('anesthesia')}>
          {collapsedSections.has('anesthesia') ? '+ ' : '- '}Anesthesia Plan
        </h2>
        {!collapsedSections.has('anesthesia') && (
          <div>
            <div className="form-group mb-4">
              <label>Modality * <span className="font-normal text-text-muted">(select all that apply – ADMIN edit in General Settings → Case Dashboard Settings)</span></label>
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
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
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
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('caseCard')}>
          {collapsedSections.has('caseCard') ? '+ ' : '- '}Linked {TERMS.PREFERENCE_CARD}
        </h2>
        {!collapsedSections.has('caseCard') && (
          <div>
            {dashboard.caseCard ? (
              <div className="mb-4">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
                  <div><strong>Name:</strong> {dashboard.caseCard.name}</div>
                  <div><strong>Version:</strong> {dashboard.caseCard.version}</div>
                  <div><strong>Status:</strong> {dashboard.caseCard.status}</div>
                </div>
              </div>
            ) : (
              <p className="text-[var(--red)] mb-4">No {TERMS.PREFERENCE_CARD} linked. Link a {TERMS.PREFERENCE_CARD} to enable attestation.</p>
            )}
            <div className="flex gap-2">
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
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('overrides')}>
          {collapsedSections.has('overrides') ? '+ ' : '- '}Case-Specific Overrides ({dashboard.overrides.length})
        </h2>
        {!collapsedSections.has('overrides') && (
          <div>
            {dashboard.overrides.length > 0 ? (
              <table className="data-table mb-4">
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
              <p className="mb-4 text-text-muted">No overrides applied.</p>
            )}
            <button onClick={() => setShowOverrideModal(true)} className="btn-secondary">
              Add Override
            </button>
          </div>
        )}
      </section>

      {/* Section 7: Event Log */}
      <section className="dashboard-section">
        <h2 className="mb-4 cursor-pointer" onClick={() => toggleSection('eventLog')}>
          {collapsedSections.has('eventLog') ? '+ ' : '- '}Event Log
        </h2>
        {!collapsedSections.has('eventLog') && (
          <div>
            {eventLog.slice(0, 5).map(e => (
              <div key={e.id} className="p-2 border-b border-border text-sm">
                <span className="text-text-muted">
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
                className="btn-link mt-2"
              >
                View all {eventLog.length} events
              </button>
            )}
            {eventLog.length === 0 && (
              <p className="text-text-muted">No events recorded yet.</p>
            )}
          </div>
        )}
      </section>

      {/* Close button */}
      <div className="mt-8 flex gap-2">
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
          <div className="modal-content max-w-[500px]" onClick={e => e.stopPropagation()}>
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
            <div className="flex gap-2 justify-end">
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
          <div className="modal-content max-w-[500px]" onClick={e => e.stopPropagation()}>
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
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowOverrideModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddOverride} className="btn-primary">Add Override</button>
            </div>
          </div>
        </div>
      )}

      {/* Link Case Card Modal */}
      {showLinkCaseCardModal && (
        <div className="modal-overlay nested-modal" onClick={() => setShowLinkCaseCardModal(false)}>
          <div className="modal-content max-w-[600px]" onClick={e => e.stopPropagation()}>
            <h3>Link {TERMS.PREFERENCE_CARD}</h3>
            <p>Select an active preference card to link to this case:</p>
            {availableCaseCards.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto">
                {availableCaseCards
                  .filter(c => c.surgeonId === dashboard.surgeonId)
                  .map(card => (
                    <div
                      key={card.currentVersionId}
                      className={`p-4 border border-border rounded mb-2 cursor-pointer ${
                        card.currentVersionId === dashboard.caseCard?.versionId ? 'bg-[var(--surface-hover)]' : ''
                      }`}
                      onClick={() => handleLinkCaseCard(card.currentVersionId!)}
                    >
                      <strong>{card.procedureName}</strong>
                      <br />
                      <span className="text-sm text-text-muted">
                        v{card.version} | {card.surgeonName}
                      </span>
                    </div>
                  ))}
                {availableCaseCards.filter(c => c.surgeonId === dashboard.surgeonId).length === 0 && (
                  <p className="text-text-muted">
                    No active preference cards found for this surgeon.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-text-muted">No active preference cards available.</p>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLinkCaseCardModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Event Log Modal */}
      {showEventLogModal && (
        <div className="modal-overlay nested-modal" onClick={() => setShowEventLogModal(false)}>
          <div className="modal-content max-w-[800px]" onClick={e => e.stopPropagation()}>
            <h3>Event Log</h3>
            <div className="max-h-[500px] overflow-y-auto">
              {eventLog.map(e => (
                <div key={e.id} className="py-3 px-0 border-b border-border text-sm">
                  <div className="flex justify-between">
                    <span>
                      <strong>{e.userName}</strong> ({e.userRole})
                    </span>
                    <span className="text-text-muted">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="bg-[var(--surface-hover)] py-0.5 px-2 rounded text-xs mr-2">
                      {e.eventType.replace(/_/g, ' ')}
                    </span>
                    {e.description}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
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
          <div className="modal-content print-modal max-w-[900px] max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print flex justify-between items-center mb-4">
              <h3>Print Preference Card</h3>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={executePrint}>Print</button>
                <button className="btn-secondary" onClick={() => setPrintingCard(null)}>Close</button>
              </div>
            </div>
            <div className="print-content">
              <div className="print-header border-b-2 border-[#3182ce] pb-4 mb-6">
                <h1 className="mb-2 text-[1.75rem]">{printingCard.card.procedureName}</h1>
                <div className="flex gap-6 flex-wrap text-sm">
                  <span><strong>Surgeon:</strong> {printingCard.card.surgeonName}</span>
                  <span><strong>Version:</strong> v{printingCard.card.version}</span>
                  <span><strong>Status:</strong> {printingCard.card.status}</span>
                </div>
                {printingCard.card.turnoverNotes && (
                  <div className="mt-2 p-2 bg-[#f7fafc] rounded text-sm">
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
                  <div className="flex flex-col gap-4">
                    {/* Instrumentation */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Instrumentation</h3>
                      {inst && Object.values(inst).some(v => v) ? (
                        <>
                          {Boolean(inst.primaryTrays) && <div className="mb-2"><strong>Primary Trays:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(inst.primaryTrays)}</pre></div>}
                          {Boolean(inst.supplementalTrays) && <div className="mb-2"><strong>Supplemental Trays:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(inst.supplementalTrays)}</pre></div>}
                          {Boolean(inst.looseInstruments) && <div className="mb-2"><strong>Loose Instruments:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(inst.looseInstruments)}</pre></div>}
                          <div className="flex gap-4 flex-wrap">
                            {Boolean(inst.flashAllowed) && <span className="bg-[#bee3f8] py-1 px-2 rounded text-xs">Flash Sterilization Allowed</span>}
                            {Boolean(inst.peelPackOnly) && <span className="bg-[#bee3f8] py-1 px-2 rounded text-xs">Peel Pack Only</span>}
                          </div>
                        </>
                      ) : <p className="text-[#718096] italic">No instrumentation documented</p>}
                    </div>

                    {/* Equipment */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Equipment</h3>
                      {equip && Object.values(equip).some(v => v) ? (
                        <>
                          {Boolean(equip.energyDevices) && <div className="mb-2"><strong>Energy Devices:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(equip.energyDevices)}</pre></div>}
                          {Boolean(equip.tourniquetLocation || equip.tourniquetPressure) && <div className="mb-2"><strong>Tourniquet:</strong> {String(equip.tourniquetLocation || '')} {equip.tourniquetPressure ? `@ ${equip.tourniquetPressure}` : ''}</div>}
                          {Boolean(equip.imaging) && <div className="mb-2"><strong>Imaging:</strong> {String(equip.imaging)}</div>}
                          {Boolean(equip.specializedDevices) && <div className="mb-2"><strong>Specialized Devices:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(equip.specializedDevices)}</pre></div>}
                        </>
                      ) : <p className="text-[#718096] italic">No equipment documented</p>}
                    </div>

                    {/* Supplies */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Supplies</h3>
                      {supp && Object.values(supp).some(v => v) ? (
                        <>
                          {Boolean(supp.gloves) && <div className="mb-2"><strong>Gloves:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(supp.gloves)}</pre></div>}
                          {Boolean(supp.drapes) && <div className="mb-2"><strong>Drapes:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(supp.drapes)}</pre></div>}
                          {Boolean(supp.implants) && <div className="mb-2"><strong>Implants:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(supp.implants)}</pre></div>}
                          {Boolean(supp.sutures) && <div className="mb-2"><strong>Sutures:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(supp.sutures)}</pre></div>}
                          {Boolean(supp.disposables) && <div className="mb-2"><strong>Disposables:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(supp.disposables)}</pre></div>}
                        </>
                      ) : <p className="text-[#718096] italic">No supplies documented</p>}
                    </div>

                    {/* Medications */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Medications & Solutions</h3>
                      {meds && Object.values(meds).some(v => v) ? (
                        <>
                          {Boolean(meds.localAnesthetic) && <div className="mb-2"><strong>Local Anesthetic:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(meds.localAnesthetic)}</pre></div>}
                          {Boolean(meds.antibiotics) && <div className="mb-2"><strong>Antibiotics:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(meds.antibiotics)}</pre></div>}
                          {Boolean(meds.irrigation) && <div className="mb-2"><strong>Irrigation:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(meds.irrigation)}</pre></div>}
                          {Boolean(meds.topicalAgents) && <div className="mb-2"><strong>Topical Agents:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(meds.topicalAgents)}</pre></div>}
                        </>
                      ) : <p className="text-[#718096] italic">No medications/solutions documented</p>}
                    </div>

                    {/* Setup & Positioning */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Setup & Positioning</h3>
                      {setup && Object.values(setup).some(v => v) ? (
                        <>
                          {Boolean(setup.patientPosition) && <div className="mb-2"><strong>Patient Position:</strong> {String(setup.patientPosition)}</div>}
                          {Boolean(setup.tableConfiguration) && <div className="mb-2"><strong>Table Configuration:</strong> {String(setup.tableConfiguration)}</div>}
                          {Boolean(setup.paddingRequirements) && <div className="mb-2"><strong>Padding:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(setup.paddingRequirements)}</pre></div>}
                          {Boolean(setup.mayoStandCount || setup.mayoStandPlacement) && <div className="mb-2"><strong>Mayo Stand:</strong> {setup.mayoStandCount ? `${setup.mayoStandCount}x` : ''} {String(setup.mayoStandPlacement || '')}</div>}
                          {Boolean(setup.backTableNotes) && <div className="mb-2"><strong>Back Table:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(setup.backTableNotes)}</pre></div>}
                          {Boolean(setup.orFlowNotes) && <div className="mb-2"><strong>OR Flow Notes:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(setup.orFlowNotes)}</pre></div>}
                        </>
                      ) : <p className="text-[#718096] italic">No setup/positioning documented</p>}
                    </div>

                    {/* Surgeon Notes */}
                    <div className="border border-[#e2e8f0] rounded p-4">
                      <h3 className="mb-2 text-base border-b border-[#e2e8f0] pb-2">Surgeon Notes & Preferences</h3>
                      {notes && Object.values(notes).some(v => v) ? (
                        <>
                          {Boolean(notes.preferences) && <div className="mb-2"><strong>Preferences:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(notes.preferences)}</pre></div>}
                          {Boolean(notes.holdPrnItems) && <div className="mb-2"><strong>Hold / PRN Items:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(notes.holdPrnItems)}</pre></div>}
                          {Boolean(notes.decisionTriggers) && <div className="mb-2"><strong>Decision Triggers:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(notes.decisionTriggers)}</pre></div>}
                          {Boolean(notes.teachingModifiers) && <div className="mb-2"><strong>Teaching Case Modifiers:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(notes.teachingModifiers)}</pre></div>}
                          {Boolean(notes.revisionAddOns) && <div className="mb-2"><strong>Revision-Only Add-Ons:</strong><pre className="my-1 whitespace-pre-wrap bg-[#f7fafc] p-2 rounded">{String(notes.revisionAddOns)}</pre></div>}
                        </>
                      ) : <p className="text-[#718096] italic">No surgeon notes/preferences documented</p>}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-6 pt-4 border-t border-[#e2e8f0] flex justify-between text-xs text-[#718096]">
                <span>Printed: {new Date().toLocaleString()}</span>
                <span>Facility: {user?.facilityName}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print styles - must use global style jsx for body * selectors */}
      <style jsx global>{`
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
