'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  createCaseCard,
  updateCaseCard,
  getCaseCard,
  type CaseCardSummary,
  type CaseCardDetail,
  type CaseCardVersionData,
  type CaseCardCreateRequest,
  type CaseCardUpdateRequest,
  type CaseType,
} from '@/lib/api';

const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: 'ELECTIVE', label: 'Elective' },
  { value: 'ADD_ON', label: 'Add-On' },
  { value: 'TRAUMA', label: 'Trauma' },
  { value: 'REVISION', label: 'Revision' },
];

interface FormSection {
  id: string;
  label: string;
  expanded: boolean;
}

export type DialogMode = 'create' | 'edit' | 'clone';

export interface PreferenceCardDialogProps {
  isOpen: boolean;
  mode: DialogMode;
  token: string;
  surgeons: { id: string; name: string }[];
  /** Card to edit or clone (required for 'edit' and 'clone' modes) */
  card?: CaseCardSummary | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  /** Optional callback for printing (only shown in edit mode) */
  onPrint?: (card: { card: CaseCardDetail; currentVersion: CaseCardVersionData | null }) => void;
}

export function PreferenceCardDialog({
  isOpen,
  mode,
  token,
  surgeons,
  card,
  onClose,
  onSuccess,
  onError,
  onPrint,
}: PreferenceCardDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<{ card: CaseCardDetail; currentVersion: CaseCardVersionData | null } | null>(null);
  const [formData, setFormData] = useState<CaseCardCreateRequest>({
    surgeonId: '',
    procedureName: '',
    procedureCodes: [],
    caseType: 'ELECTIVE',
    defaultDurationMinutes: undefined,
    turnoverNotes: '',
    headerInfo: {},
    patientFlags: {},
    instrumentation: {},
    equipment: {},
    supplies: {},
    medications: {},
    setupPositioning: {},
    surgeonNotes: {},
  });
  const [changeSummary, setChangeSummary] = useState('');
  const [reasonForChange, setReasonForChange] = useState('');

  const [sections, setSections] = useState<FormSection[]>([
    { id: 'setupPositioning', label: 'Setup & Positioning', expanded: false },
    { id: 'instrumentation', label: 'Instrumentation', expanded: false },
    { id: 'equipment', label: 'Equipment', expanded: false },
    { id: 'supplies', label: 'Supplies', expanded: false },
    { id: 'medications', label: 'Medications & Solutions', expanded: false },
    { id: 'surgeonNotes', label: 'Surgeon Notes & Conditional Logic', expanded: false },
  ]);

  const loadCardData = useCallback(async () => {
    if (!token || !card) return;
    setIsLoading(true);
    try {
      const result = await getCaseCard(token, card.id);
      setEditingCard(result);

      const procedureName = mode === 'clone'
        ? `${result.card.procedureName} - Cloned`
        : result.card.procedureName;

      setFormData({
        surgeonId: mode === 'clone' ? '' : result.card.surgeonId,
        procedureName,
        procedureCodes: result.card.procedureCodes,
        caseType: result.card.caseType,
        defaultDurationMinutes: result.card.defaultDurationMinutes || undefined,
        turnoverNotes: result.card.turnoverNotes || '',
        headerInfo: result.currentVersion?.headerInfo || {},
        patientFlags: result.currentVersion?.patientFlags || {},
        instrumentation: result.currentVersion?.instrumentation || {},
        equipment: result.currentVersion?.equipment || {},
        supplies: result.currentVersion?.supplies || {},
        medications: result.currentVersion?.medications || {},
        setupPositioning: result.currentVersion?.setupPositioning || {},
        surgeonNotes: result.currentVersion?.surgeonNotes || {},
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load preference card details');
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [token, card, mode, onError, onClose]);

  // Load card data when dialog opens for edit or clone
  useEffect(() => {
    if (isOpen && card && (mode === 'edit' || mode === 'clone')) {
      loadCardData();
    } else if (isOpen && mode === 'create') {
      resetForm();
    }
  }, [isOpen, card, mode, loadCardData]);

  const resetForm = () => {
    setFormData({
      surgeonId: '',
      procedureName: '',
      procedureCodes: [],
      caseType: 'ELECTIVE',
      defaultDurationMinutes: undefined,
      turnoverNotes: '',
      headerInfo: {},
      patientFlags: {},
      instrumentation: {},
      equipment: {},
      supplies: {},
      medications: {},
      setupPositioning: {},
      surgeonNotes: {},
    });
    setChangeSummary('');
    setReasonForChange('');
    setEditingCard(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleSection = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, expanded: !s.expanded } : s
    ));
  };

  const updateNestedField = (section: string, key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof CaseCardCreateRequest] as Record<string, unknown> || {}),
        [key]: value,
      },
    }));
  };

  const getNestedValue = (section: string, key: string): unknown => {
    const sectionData = formData[section as keyof CaseCardCreateRequest] as Record<string, unknown> | undefined;
    return sectionData?.[key];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // For edit mode, require change summary
    if (mode === 'edit' && !changeSummary.trim()) {
      onError('Change summary is required for updates');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'edit' && editingCard) {
        const updateData: CaseCardUpdateRequest = {
          ...formData,
          changeSummary,
          reasonForChange: reasonForChange || undefined,
          versionBump: 'minor',
        };
        await updateCaseCard(token, editingCard.card.id, updateData);
        onSuccess('Preference card updated successfully');
      } else {
        // Create or Clone (both create new cards)
        await createCaseCard(token, formData);
        onSuccess(mode === 'clone' ? 'Preference card cloned successfully' : 'Preference card created successfully');
      }
      handleClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to ${mode === 'edit' ? 'update' : 'create'} preference card`);
    } finally {
      setIsLoading(false);
    }
  };

  const getDialogTitle = () => {
    switch (mode) {
      case 'edit': return 'Edit Preference Card';
      case 'clone': return 'Clone Preference Card';
      default: return 'Create New Preference Card';
    }
  };

  if (!isOpen) return null;

  const getSubmitButtonText = () => {
    if (isLoading) return 'Saving...';
    switch (mode) {
      case 'edit': return 'Save Changes';
      case 'clone': return 'Clone Card';
      default: return 'Create';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={handleClose}>
      <div className="bg-surface-secondary rounded-lg w-[90%] max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
          <h2 className="m-0 text-xl text-text-primary">{getDialogTitle()}</h2>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="preference-card-form"
              className="btn btn-primary btn-sm"
              disabled={isLoading || ((mode === 'edit' || mode === 'clone') && !editingCard)}
            >
              {getSubmitButtonText()}
            </button>
            <button className="bg-transparent border-none text-2xl cursor-pointer text-text-muted p-0 leading-none hover:text-text-primary" onClick={handleClose} type="button">
              &times;
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading && (mode === 'edit' || mode === 'clone') && !editingCard ? (
            <div className="text-center p-8 text-text-muted">Loading preference card...</div>
          ) : (
            <form id="preference-card-form" onSubmit={handleSubmit} autoComplete="off">
              {/* Clone mode: simplified form with just Surgeon and Procedure Name */}
              {mode === 'clone' ? (
                <div className="mb-6 pb-4 border-b border-border">
                  <p className="bg-[var(--color-blue-50)] border border-[var(--color-blue-500)] rounded py-3 px-4 mb-4 text-sm text-[var(--color-blue-500)]">
                    Select a surgeon and update the procedure name. All other card details will be copied from the original.
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                    <div className="form-group">
                      <label>Surgeon *</label>
                      <select
                        value={formData.surgeonId}
                        onChange={(e) => setFormData({ ...formData, surgeonId: e.target.value })}
                        required
                        autoComplete="off"
                      >
                        <option value="">Select surgeon...</option>
                        {surgeons.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Procedure Name *</label>
                      <input
                        type="text"
                        value={formData.procedureName}
                        onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
                        required
                        placeholder="e.g., Total Hip Replacement"
                      />
                    </div>
                  </div>
                </div>
              ) : (
              /* Create/Edit mode: full form */
              <div className="mb-6 pb-4 border-b border-border">
                <h3 className="m-0 mb-4 text-base text-text-secondary">Header Information</h3>
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div className="form-group">
                    <label>Surgeon *</label>
                    <select
                      value={formData.surgeonId}
                      onChange={(e) => setFormData({ ...formData, surgeonId: e.target.value })}
                      required
                      disabled={mode === 'edit'}
                      autoComplete="off"
                    >
                      <option value="">Select surgeon...</option>
                      {surgeons.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Procedure Name *</label>
                    <input
                      type="text"
                      value={formData.procedureName}
                      onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
                      required
                      placeholder="e.g., Total Hip Replacement"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Turnover Notes</label>
                  <textarea
                    value={formData.turnoverNotes}
                    onChange={(e) => setFormData({ ...formData, turnoverNotes: e.target.value })}
                    placeholder="Turnover considerations..."
                    rows={2}
                  />
                </div>
              </div>
              )}

              {/* Collapsible Sections - only show for create/edit modes */}
              {mode !== 'clone' && sections.map(section => (
                <div key={section.id} className="mb-2 border border-border rounded overflow-hidden">
                  <button
                    type="button"
                    className="flex justify-between items-center w-full py-3 px-4 bg-surface-tertiary border-none cursor-pointer text-sm font-semibold text-left text-text-primary hover:brightness-95 transition-colors"
                    onClick={() => toggleSection(section.id)}
                  >
                    <span>{section.label}</span>
                    <span className="text-xl text-text-muted">{section.expanded ? '−' : '+'}</span>
                  </button>
                  {section.expanded && (
                    <div className="p-4 bg-surface-secondary">
                      {section.id === 'instrumentation' && (
                        <>
                          <div className="form-group">
                            <label>Primary Trays (one per line)</label>
                            <textarea
                              value={getNestedValue('instrumentation', 'primaryTrays') as string || ''}
                              onChange={(e) => updateNestedField('instrumentation', 'primaryTrays', e.target.value)}
                              placeholder="Tray Name | Required (Yes/No)"
                              rows={4}
                            />
                          </div>
                          <div className="form-group">
                            <label>Supplemental Trays (one per line)</label>
                            <textarea
                              value={getNestedValue('instrumentation', 'supplementalTrays') as string || ''}
                              onChange={(e) => updateNestedField('instrumentation', 'supplementalTrays', e.target.value)}
                              placeholder="Tray Name | Indication"
                              rows={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>Loose Instruments (one per line)</label>
                            <textarea
                              value={getNestedValue('instrumentation', 'looseInstruments') as string || ''}
                              onChange={(e) => updateNestedField('instrumentation', 'looseInstruments', e.target.value)}
                              placeholder="Instrument Name | Size | Quantity"
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                              <input
                                type="checkbox"
                                className="w-auto"
                                checked={!!getNestedValue('instrumentation', 'flashAllowed')}
                                onChange={(e) => updateNestedField('instrumentation', 'flashAllowed', e.target.checked)}
                              />
                              Flash Sterilization Allowed
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
                              <input
                                type="checkbox"
                                className="w-auto"
                                checked={!!getNestedValue('instrumentation', 'peelPackOnly')}
                                onChange={(e) => updateNestedField('instrumentation', 'peelPackOnly', e.target.checked)}
                              />
                              Peel Pack Only
                            </label>
                          </div>
                        </>
                      )}

                      {section.id === 'equipment' && (
                        <>
                          <div className="form-group">
                            <label>Energy Devices (one per line)</label>
                            <textarea
                              value={getNestedValue('equipment', 'energyDevices') as string || ''}
                              onChange={(e) => updateNestedField('equipment', 'energyDevices', e.target.value)}
                              placeholder="Device Name | Default Settings | Required/Optional | Open at Setup/PRN"
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                            <div className="form-group">
                              <label>Tourniquet Location</label>
                              <input
                                type="text"
                                value={getNestedValue('equipment', 'tourniquetLocation') as string || ''}
                                onChange={(e) => updateNestedField('equipment', 'tourniquetLocation', e.target.value)}
                                placeholder="e.g., Upper thigh"
                              />
                            </div>
                            <div className="form-group">
                              <label>Tourniquet Pressure</label>
                              <input
                                type="text"
                                value={getNestedValue('equipment', 'tourniquetPressure') as string || ''}
                                onChange={(e) => updateNestedField('equipment', 'tourniquetPressure', e.target.value)}
                                placeholder="e.g., 300 mmHg"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Imaging (C-arm orientation, etc.)</label>
                            <input
                              type="text"
                              value={getNestedValue('equipment', 'imaging') as string || ''}
                              onChange={(e) => updateNestedField('equipment', 'imaging', e.target.value)}
                              placeholder="C-arm orientation, positioning requirements"
                            />
                          </div>
                          <div className="form-group">
                            <label>Specialized Devices</label>
                            <textarea
                              value={getNestedValue('equipment', 'specializedDevices') as string || ''}
                              onChange={(e) => updateNestedField('equipment', 'specializedDevices', e.target.value)}
                              placeholder="Navigation, Robotics, Custom jigs - one per line"
                              rows={3}
                            />
                          </div>
                        </>
                      )}

                      {section.id === 'supplies' && (
                        <>
                          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                            <div className="form-group">
                              <label>Gloves/Gown Sizes</label>
                              <textarea
                                value={getNestedValue('supplies', 'gloves') as string || ''}
                                onChange={(e) => updateNestedField('supplies', 'gloves', e.target.value)}
                                placeholder="Size | Sterile/Exam | Quantity"
                                rows={2}
                              />
                            </div>
                            <div className="form-group">
                              <label>Drapes</label>
                              <textarea
                                value={getNestedValue('supplies', 'drapes') as string || ''}
                                onChange={(e) => updateNestedField('supplies', 'drapes', e.target.value)}
                                placeholder="Drape type and quantity"
                                rows={2}
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Implants (one per line)</label>
                            <textarea
                              value={getNestedValue('supplies', 'implants') as string || ''}
                              onChange={(e) => updateNestedField('supplies', 'implants', e.target.value)}
                              placeholder="Vendor | System | Size Range Required"
                              rows={4}
                            />
                          </div>
                          <div className="form-group">
                            <label>Sutures (one per line)</label>
                            <textarea
                              value={getNestedValue('supplies', 'sutures') as string || ''}
                              onChange={(e) => updateNestedField('supplies', 'sutures', e.target.value)}
                              placeholder="Type | Size | Needle"
                              rows={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>Disposables / Single-use Devices</label>
                            <textarea
                              value={getNestedValue('supplies', 'disposables') as string || ''}
                              onChange={(e) => updateNestedField('supplies', 'disposables', e.target.value)}
                              placeholder="Item | Quantity"
                              rows={3}
                            />
                          </div>
                        </>
                      )}

                      {section.id === 'medications' && (
                        <>
                          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                            <div className="form-group">
                              <label>Local Anesthetic</label>
                              <textarea
                                value={getNestedValue('medications', 'localAnesthetic') as string || ''}
                                onChange={(e) => updateNestedField('medications', 'localAnesthetic', e.target.value)}
                                placeholder="Drug | Concentration | Volume"
                                rows={2}
                              />
                            </div>
                            <div className="form-group">
                              <label>Antibiotics</label>
                              <textarea
                                value={getNestedValue('medications', 'antibiotics') as string || ''}
                                onChange={(e) => updateNestedField('medications', 'antibiotics', e.target.value)}
                                placeholder="Drug | Dose | Timing"
                                rows={2}
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Irrigation</label>
                            <textarea
                              value={getNestedValue('medications', 'irrigation') as string || ''}
                              onChange={(e) => updateNestedField('medications', 'irrigation', e.target.value)}
                              placeholder="Type | Volume | Additives"
                              rows={2}
                            />
                          </div>
                          <div className="form-group">
                            <label>Topical Agents (TXA, Hemostatic agents, etc.)</label>
                            <textarea
                              value={getNestedValue('medications', 'topicalAgents') as string || ''}
                              onChange={(e) => updateNestedField('medications', 'topicalAgents', e.target.value)}
                              placeholder="Agent | Open by Default / Do Not Open Unless Requested"
                              rows={3}
                            />
                          </div>
                        </>
                      )}

                      {section.id === 'setupPositioning' && (
                        <>
                          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                            <div className="form-group">
                              <label>Patient Position</label>
                              <input
                                type="text"
                                value={getNestedValue('setupPositioning', 'patientPosition') as string || ''}
                                onChange={(e) => updateNestedField('setupPositioning', 'patientPosition', e.target.value)}
                                placeholder="e.g., Supine, Lateral, Prone"
                              />
                            </div>
                            <div className="form-group">
                              <label>Table Configuration</label>
                              <input
                                type="text"
                                value={getNestedValue('setupPositioning', 'tableConfiguration') as string || ''}
                                onChange={(e) => updateNestedField('setupPositioning', 'tableConfiguration', e.target.value)}
                                placeholder="Table setup requirements"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Padding Requirements</label>
                            <textarea
                              value={getNestedValue('setupPositioning', 'paddingRequirements') as string || ''}
                              onChange={(e) => updateNestedField('setupPositioning', 'paddingRequirements', e.target.value)}
                              placeholder="Specific padding requirements"
                              rows={2}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                            <div className="form-group">
                              <label>Mayo Stand Count</label>
                              <input
                                type="number"
                                value={getNestedValue('setupPositioning', 'mayoStandCount') as number || ''}
                                onChange={(e) => updateNestedField('setupPositioning', 'mayoStandCount', parseInt(e.target.value) || 0)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Mayo Stand Placement</label>
                              <input
                                type="text"
                                value={getNestedValue('setupPositioning', 'mayoStandPlacement') as string || ''}
                                onChange={(e) => updateNestedField('setupPositioning', 'mayoStandPlacement', e.target.value)}
                                placeholder="Placement instructions"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Back Table Layout Notes</label>
                            <textarea
                              value={getNestedValue('setupPositioning', 'backTableNotes') as string || ''}
                              onChange={(e) => updateNestedField('setupPositioning', 'backTableNotes', e.target.value)}
                              placeholder="Back table organization notes"
                              rows={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>OR Flow Notes (Implant timing, Imaging timing)</label>
                            <textarea
                              value={getNestedValue('setupPositioning', 'orFlowNotes') as string || ''}
                              onChange={(e) => updateNestedField('setupPositioning', 'orFlowNotes', e.target.value)}
                              placeholder="Timing and workflow notes"
                              rows={3}
                            />
                          </div>
                        </>
                      )}

                      {section.id === 'surgeonNotes' && (
                        <>
                          <p className="text-xs text-text-muted italic m-0 mb-4">Free text allowed in this section only.</p>
                          <div className="form-group">
                            <label>Surgeon Preferences</label>
                            <textarea
                              value={getNestedValue('surgeonNotes', 'preferences') as string || ''}
                              onChange={(e) => updateNestedField('surgeonNotes', 'preferences', e.target.value)}
                              placeholder="Specific surgeon preferences"
                              rows={4}
                            />
                          </div>
                          <div className="form-group">
                            <label>Hold / PRN Items</label>
                            <textarea
                              value={getNestedValue('surgeonNotes', 'holdPrnItems') as string || ''}
                              onChange={(e) => updateNestedField('surgeonNotes', 'holdPrnItems', e.target.value)}
                              placeholder="Items to hold unless requested"
                              rows={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>Decision Triggers</label>
                            <textarea
                              value={getNestedValue('surgeonNotes', 'decisionTriggers') as string || ''}
                              onChange={(e) => updateNestedField('surgeonNotes', 'decisionTriggers', e.target.value)}
                              placeholder='e.g., "Open implant X only if condition Y"'
                              rows={3}
                            />
                          </div>
                          <div className="form-group">
                            <label>Teaching Case Modifiers</label>
                            <textarea
                              value={getNestedValue('surgeonNotes', 'teachingModifiers') as string || ''}
                              onChange={(e) => updateNestedField('surgeonNotes', 'teachingModifiers', e.target.value)}
                              placeholder="Modifications for teaching cases"
                              rows={2}
                            />
                          </div>
                          <div className="form-group">
                            <label>Revision-Only Add-Ons</label>
                            <textarea
                              value={getNestedValue('surgeonNotes', 'revisionAddOns') as string || ''}
                              onChange={(e) => updateNestedField('surgeonNotes', 'revisionAddOns', e.target.value)}
                              placeholder="Items needed only for revision cases"
                              rows={2}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Edit-specific fields */}
              {mode === 'edit' && (
                <div className="mb-6 pb-4 border-b border-border bg-[var(--color-orange-bg)] border-l-4 border-l-[var(--color-orange)] pl-4">
                  <h3 className="m-0 mb-4 text-base text-text-secondary">Change Details (Required)</h3>
                  <div className="form-group">
                    <label>Change Summary *</label>
                    <input
                      type="text"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      required
                      placeholder="Brief description of changes made"
                    />
                  </div>
                  <div className="form-group">
                    <label>Reason for Change</label>
                    <textarea
                      value={reasonForChange}
                      onChange={(e) => setReasonForChange(e.target.value)}
                      placeholder="Why these changes were necessary"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-4 mt-6 pt-4 border-t border-border">
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Saving...' : mode === 'edit' ? 'Save Changes' : mode === 'clone' ? 'Clone Card' : 'Create Preference Card'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                {mode === 'edit' && editingCard && onPrint && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onPrint(editingCard)}
                  >
                    Print
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
