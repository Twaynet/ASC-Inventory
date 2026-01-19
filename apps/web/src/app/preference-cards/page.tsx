'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getCaseCards,
  getCaseCard,
  getCaseCardEditLog,
  createCaseCard,
  updateCaseCard,
  activateCaseCard,
  deprecateCaseCard,
  getCaseCardSurgeons,
  getCaseCardFeedback,
  reviewCaseCardFeedback,
  type CaseCardSummary,
  type CaseCardDetail,
  type CaseCardVersionData,
  type CaseCardEditLogEntry,
  type CaseCardCreateRequest,
  type CaseCardUpdateRequest,
  type CaseType,
  type CaseCardFeedback,
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

export default function PreferenceCardsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [cards, setCards] = useState<CaseCardSummary[]>([]);
  const [surgeons, setSurgeons] = useState<{ id: string; name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSurgeon, setFilterSurgeon] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
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

  // Collapsible sections
  const [sections, setSections] = useState<FormSection[]>([
    { id: 'patientFlags', label: 'Patient-Dependent Flags (Non-PHI)', expanded: false },
    { id: 'instrumentation', label: 'Instrumentation', expanded: false },
    { id: 'equipment', label: 'Equipment', expanded: false },
    { id: 'supplies', label: 'Supplies', expanded: false },
    { id: 'medications', label: 'Medications & Solutions', expanded: false },
    { id: 'setupPositioning', label: 'Setup & Positioning', expanded: false },
    { id: 'surgeonNotes', label: 'Surgeon Notes & Conditional Logic', expanded: false },
  ]);

  // Edit log modal
  const [viewingEditLog, setViewingEditLog] = useState<CaseCardSummary | null>(null);
  const [editLog, setEditLog] = useState<CaseCardEditLogEntry[]>([]);
  const [isLoadingEditLog, setIsLoadingEditLog] = useState(false);

  // Feedback modal
  const [viewingFeedback, setViewingFeedback] = useState<CaseCardSummary | null>(null);
  const [feedbackList, setFeedbackList] = useState<CaseCardFeedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<{ total: number; pending: number; reviewed: number }>({ total: 0, pending: 0, reviewed: 0 });
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [reviewingFeedback, setReviewingFeedback] = useState<CaseCardFeedback | null>(null);
  const [reviewAction, setReviewAction] = useState<'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED'>('ACKNOWLEDGED');
  const [reviewNotes, setReviewNotes] = useState('');

  // Print modal
  const [printingCard, setPrintingCard] = useState<{ card: CaseCardDetail; currentVersion: CaseCardVersionData | null } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [cardsResult, surgeonsResult] = await Promise.all([
        getCaseCards(token, {
          surgeonId: filterSurgeon || undefined,
          status: filterStatus || undefined,
          search: searchTerm || undefined,
        }),
        getCaseCardSurgeons(token),
      ]);
      setCards(cardsResult.cards);
      setSurgeons(surgeonsResult.surgeons);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preference cards');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, filterStatus, filterSurgeon, searchTerm]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, loadData]);

  const toggleSection = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, expanded: !s.expanded } : s
    ));
  };

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
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createCaseCard(token, formData);
      setSuccessMessage('Preference card created successfully');
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preference card');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingCard) return;

    if (!changeSummary.trim()) {
      setError('Change summary is required for updates');
      return;
    }

    try {
      const updateData: CaseCardUpdateRequest = {
        ...formData,
        changeSummary,
        reasonForChange: reasonForChange || undefined,
        versionBump: 'minor',
      };
      await updateCaseCard(token, editingCard.card.id, updateData);
      setSuccessMessage('Preference card updated successfully');
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preference card');
    }
  };

  const handleActivate = async (cardId: string) => {
    if (!token) return;
    try {
      await activateCaseCard(token, cardId);
      setSuccessMessage('Preference card activated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate preference card');
    }
  };

  const handleDeprecate = async (cardId: string) => {
    if (!token) return;
    const reason = prompt('Please enter a reason for deprecating this preference card:');
    if (reason === null) return;

    try {
      await deprecateCaseCard(token, cardId, reason);
      setSuccessMessage('Preference card deprecated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deprecate preference card');
    }
  };

  const startEdit = async (card: CaseCardSummary) => {
    if (!token) return;
    try {
      const result = await getCaseCard(token, card.id);
      setEditingCard(result);
      setFormData({
        surgeonId: result.card.surgeonId,
        procedureName: result.card.procedureName,
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
      setShowForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preference card details');
    }
  };

  const viewEditLog = async (card: CaseCardSummary) => {
    if (!token) return;
    setViewingEditLog(card);
    setIsLoadingEditLog(true);
    try {
      const result = await getCaseCardEditLog(token, card.id);
      setEditLog(result.editLog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load edit log');
    } finally {
      setIsLoadingEditLog(false);
    }
  };

  const viewFeedback = async (card: CaseCardSummary) => {
    if (!token) return;
    setViewingFeedback(card);
    setIsLoadingFeedback(true);
    try {
      const result = await getCaseCardFeedback(token, card.id);
      setFeedbackList(result.feedback);
      setFeedbackSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleReviewFeedback = async () => {
    if (!token || !viewingFeedback || !reviewingFeedback) return;
    try {
      await reviewCaseCardFeedback(token, viewingFeedback.id, reviewingFeedback.id, reviewAction, reviewNotes || undefined);
      setSuccessMessage('Feedback reviewed successfully');
      setReviewingFeedback(null);
      setReviewNotes('');
      // Reload feedback list
      const result = await getCaseCardFeedback(token, viewingFeedback.id);
      setFeedbackList(result.feedback);
      setFeedbackSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review feedback');
    }
  };

  const handlePrint = async (card: CaseCardSummary) => {
    if (!token) return;
    try {
      const result = await getCaseCard(token, card.id);
      setPrintingCard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preference card for printing');
    }
  };

  const executePrint = () => {
    window.print();
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

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      <Header title="Surgeon Preference Cards" />

      <main className="container preference-cards-page">
        {error && <div className="alert alert-error" onClick={() => setError('')}>{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">{cards.length}</div>
            <div className="summary-label">Total Cards</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{cards.filter(c => c.status === 'ACTIVE').length}</div>
            <div className="summary-label">Active</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{cards.filter(c => c.status === 'DRAFT').length}</div>
            <div className="summary-label">Draft</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{surgeons.length}</div>
            <div className="summary-label">Surgeons</div>
          </div>
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            + Create Preference Card
          </button>
          <div className="filters">
            <input
              type="text"
              placeholder="Search procedures..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterSurgeon}
              onChange={(e) => setFilterSurgeon(e.target.value)}
            >
              <option value="">All Surgeons</option>
              {surgeons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="form-card">
            <h2>{editingCard ? 'Edit Preference Card' : 'Create New Preference Card'}</h2>
            <form onSubmit={editingCard ? handleUpdate : handleCreate}>
              {/* Header Information Section (per spec Section 2) */}
              <div className="form-section">
                <h3>Header Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Surgeon *</label>
                    <select
                      value={formData.surgeonId}
                      onChange={(e) => setFormData({ ...formData, surgeonId: e.target.value })}
                      required
                      disabled={!!editingCard}
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Case Type</label>
                    <select
                      value={formData.caseType}
                      onChange={(e) => setFormData({ ...formData, caseType: e.target.value as CaseType })}
                    >
                      {CASE_TYPES.map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Default Duration (minutes)</label>
                    <input
                      type="number"
                      value={formData.defaultDurationMinutes || ''}
                      onChange={(e) => setFormData({ ...formData, defaultDurationMinutes: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="Estimated skin-to-skin time"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Procedure Codes (comma-separated)</label>
                  <input
                    type="text"
                    value={(formData.procedureCodes || []).join(', ')}
                    onChange={(e) => setFormData({
                      ...formData,
                      procedureCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    placeholder="CPT codes, e.g., 27130, 27447"
                  />
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

              {/* Collapsible Sections */}
              {sections.map(section => (
                <div key={section.id} className="collapsible-section">
                  <button
                    type="button"
                    className="section-header"
                    onClick={() => toggleSection(section.id)}
                  >
                    <span>{section.label}</span>
                    <span className="toggle-icon">{section.expanded ? '−' : '+'}</span>
                  </button>
                  {section.expanded && (
                    <div className="section-content">
                      {section.id === 'patientFlags' && (
                        <>
                          <p className="section-note">Checkbox-driven flags. No free-text patient data allowed.</p>
                          <div className="checkbox-grid">
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'latexAllergy')}
                                onChange={(e) => updateNestedField('patientFlags', 'latexAllergy', e.target.checked)}
                              />
                              Latex-Free Required
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'iodineAllergy')}
                                onChange={(e) => updateNestedField('patientFlags', 'iodineAllergy', e.target.checked)}
                              />
                              Iodine-Free Required
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'nickelFree')}
                                onChange={(e) => updateNestedField('patientFlags', 'nickelFree', e.target.checked)}
                              />
                              Nickel-Free Implants
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'anticoagulation')}
                                onChange={(e) => updateNestedField('patientFlags', 'anticoagulation', e.target.checked)}
                              />
                              Anticoagulation Consideration
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'infectionRisk')}
                                onChange={(e) => updateNestedField('patientFlags', 'infectionRisk', e.target.checked)}
                              />
                              Infection Risk
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('patientFlags', 'neuromonitoringRequired')}
                                onChange={(e) => updateNestedField('patientFlags', 'neuromonitoringRequired', e.target.checked)}
                              />
                              Neuromonitoring Required
                            </label>
                          </div>
                        </>
                      )}

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
                          <div className="checkbox-grid">
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!getNestedValue('instrumentation', 'flashAllowed')}
                                onChange={(e) => updateNestedField('instrumentation', 'flashAllowed', e.target.checked)}
                              />
                              Flash Sterilization Allowed
                            </label>
                            <label className="checkbox-item">
                              <input
                                type="checkbox"
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
                          <div className="form-row">
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
                          <div className="form-row">
                            <div className="form-group">
                              <label>Gloves</label>
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
                          <div className="form-row">
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
                          <div className="form-row">
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
                          <div className="form-row">
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
                          <p className="section-note">Free text allowed in this section only.</p>
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
              {editingCard && (
                <div className="form-section edit-metadata">
                  <h3>Change Details (Required)</h3>
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

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingCard ? 'Save Changes' : 'Create Preference Card'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
                {editingCard && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPrintingCard(editingCard)}
                  >
                    Print
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Cards Table */}
        {isLoadingData ? (
          <div className="loading">Loading preference cards...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Procedure Name</th>
                  <th>Surgeon</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      No preference cards found. Create your first card to get started.
                    </td>
                  </tr>
                ) : (
                  cards.map((card) => (
                    <tr key={card.id} className={card.status === 'DEPRECATED' ? 'deprecated-row' : ''}>
                      <td className="name-cell">{card.procedureName}</td>
                      <td>{card.surgeonName}</td>
                      <td>{card.caseType}</td>
                      <td>v{card.version}</td>
                      <td>
                        <span className={`status-badge ${card.status.toLowerCase()}`}>
                          {card.status}
                        </span>
                      </td>
                      <td>{new Date(card.updatedAt).toLocaleDateString()}</td>
                      <td className="actions-cell">
                        {card.status !== 'DEPRECATED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEdit(card)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handlePrint(card)}
                        >
                          Print
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => viewEditLog(card)}
                        >
                          History
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => viewFeedback(card)}
                        >
                          Feedback
                        </button>
                        {card.status === 'DRAFT' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(card.id)}
                          >
                            Activate
                          </button>
                        )}
                        {card.status === 'ACTIVE' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeprecate(card.id)}
                          >
                            Deprecate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Log Modal */}
        {viewingEditLog && (
          <div className="modal-overlay" onClick={() => setViewingEditLog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit History: {viewingEditLog.procedureName}</h2>
                <button className="close-btn" onClick={() => setViewingEditLog(null)}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                {isLoadingEditLog ? (
                  <div className="loading">Loading edit history...</div>
                ) : editLog.length === 0 ? (
                  <p className="empty-state">No edit history found.</p>
                ) : (
                  <div className="edit-log-list">
                    {editLog.map((entry) => (
                      <div key={entry.id} className="edit-log-entry">
                        <div className="edit-log-header">
                          <strong>{entry.changeSummary}</strong>
                          <span className="edit-log-date">
                            {new Date(entry.editedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="edit-log-details">
                          <span>By: {entry.editorName} ({entry.editorRole})</span>
                          {entry.reasonForChange && (
                            <span>Reason: {entry.reasonForChange}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Feedback Modal */}
        {viewingFeedback && (
          <div className="modal-overlay" onClick={() => { setViewingFeedback(null); setReviewingFeedback(null); }}>
            <div className="modal feedback-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Feedback: {viewingFeedback.procedureName}</h2>
                <button className="close-btn" onClick={() => { setViewingFeedback(null); setReviewingFeedback(null); }}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                {isLoadingFeedback ? (
                  <div className="loading">Loading feedback...</div>
                ) : (
                  <>
                    <div className="feedback-summary">
                      <span className="feedback-stat">
                        <strong>{feedbackSummary.total}</strong> Total
                      </span>
                      <span className="feedback-stat pending">
                        <strong>{feedbackSummary.pending}</strong> Pending
                      </span>
                      <span className="feedback-stat reviewed">
                        <strong>{feedbackSummary.reviewed}</strong> Reviewed
                      </span>
                    </div>
                    {feedbackList.length === 0 ? (
                      <p className="empty-state">No feedback submitted for this preference card.</p>
                    ) : (
                      <div className="feedback-list">
                        {feedbackList.map((fb) => (
                          <div key={fb.id} className={`feedback-entry ${fb.reviewedAt ? 'reviewed' : 'pending'}`}>
                            <div className="feedback-header">
                              <span className="feedback-case">
                                Case: {fb.procedureName} ({new Date(fb.scheduledDate).toLocaleDateString()})
                              </span>
                              <span className={`feedback-status ${fb.reviewedAt ? 'reviewed' : 'pending'}`}>
                                {fb.reviewedAt ? fb.reviewAction : 'Pending Review'}
                              </span>
                            </div>
                            <div className="feedback-content">
                              {fb.itemsUnused.length > 0 && (
                                <div className="feedback-field">
                                  <strong>Items Not Used:</strong> {fb.itemsUnused.join(', ')}
                                </div>
                              )}
                              {fb.itemsMissing.length > 0 && (
                                <div className="feedback-field">
                                  <strong>Items Missing:</strong> {fb.itemsMissing.join(', ')}
                                </div>
                              )}
                              {fb.setupIssues && (
                                <div className="feedback-field">
                                  <strong>Setup Issues:</strong> {fb.setupIssues}
                                </div>
                              )}
                              {fb.staffComments && (
                                <div className="feedback-field">
                                  <strong>Staff Comments:</strong> {fb.staffComments}
                                </div>
                              )}
                              {fb.suggestedEdits && (
                                <div className="feedback-field">
                                  <strong>Suggested Edits:</strong> {fb.suggestedEdits}
                                </div>
                              )}
                            </div>
                            <div className="feedback-meta">
                              <span>Submitted by {fb.submittedByName} on {new Date(fb.createdAt).toLocaleDateString()}</span>
                              {fb.reviewedAt && (
                                <span>Reviewed by {fb.reviewedByName} on {new Date(fb.reviewedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                            {!fb.reviewedAt && user?.role === 'ADMIN' && (
                              <div className="feedback-actions">
                                {reviewingFeedback?.id === fb.id ? (
                                  <div className="review-form">
                                    <select
                                      value={reviewAction}
                                      onChange={(e) => setReviewAction(e.target.value as 'ACKNOWLEDGED' | 'APPLIED' | 'DISMISSED')}
                                    >
                                      <option value="ACKNOWLEDGED">Acknowledge</option>
                                      <option value="APPLIED">Mark as Applied</option>
                                      <option value="DISMISSED">Dismiss</option>
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="Review notes (optional)"
                                      value={reviewNotes}
                                      onChange={(e) => setReviewNotes(e.target.value)}
                                    />
                                    <div className="review-buttons">
                                      <button className="btn btn-primary btn-sm" onClick={handleReviewFeedback}>
                                        Submit Review
                                      </button>
                                      <button className="btn btn-secondary btn-sm" onClick={() => setReviewingFeedback(null)}>
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                      setReviewingFeedback(fb);
                                      setReviewAction('ACKNOWLEDGED');
                                      setReviewNotes('');
                                    }}
                                  >
                                    Review
                                  </button>
                                )}
                              </div>
                            )}
                            {fb.reviewNotes && (
                              <div className="feedback-review-notes">
                                <strong>Review Notes:</strong> {fb.reviewNotes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Print Modal */}
        {printingCard && (
          <div className="modal-overlay print-modal-overlay" onClick={() => setPrintingCard(null)}>
            <div className="modal print-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header no-print">
                <h2>Print Preference Card</h2>
                <div className="print-actions">
                  <button className="btn btn-primary" onClick={executePrint}>
                    Print
                  </button>
                  <button className="close-btn" onClick={() => setPrintingCard(null)}>
                    &times;
                  </button>
                </div>
              </div>
              <div className="modal-body print-content">
                <div className="print-header">
                  <h1>{printingCard.card.procedureName}</h1>
                  <div className="print-meta">
                    <span><strong>Surgeon:</strong> {printingCard.card.surgeonName}</span>
                    <span><strong>Version:</strong> v{printingCard.card.version}</span>
                    <span><strong>Status:</strong> {printingCard.card.status}</span>
                  </div>
                  <div className="print-meta">
                    <span><strong>Case Type:</strong> {printingCard.card.caseType}</span>
                    {printingCard.card.defaultDurationMinutes && (
                      <span><strong>Est. Duration:</strong> {printingCard.card.defaultDurationMinutes} min</span>
                    )}
                    {printingCard.card.procedureCodes.length > 0 && (
                      <span><strong>CPT:</strong> {printingCard.card.procedureCodes.join(', ')}</span>
                    )}
                  </div>
                  {printingCard.card.turnoverNotes && (
                    <div className="print-notes">
                      <strong>Turnover Notes:</strong> {printingCard.card.turnoverNotes}
                    </div>
                  )}
                </div>

                {printingCard.currentVersion && (() => {
                  const pf = printingCard.currentVersion.patientFlags as Record<string, boolean> | undefined;
                  const inst = printingCard.currentVersion.instrumentation as Record<string, unknown> | undefined;
                  const equip = printingCard.currentVersion.equipment as Record<string, unknown> | undefined;
                  const supp = printingCard.currentVersion.supplies as Record<string, unknown> | undefined;
                  const meds = printingCard.currentVersion.medications as Record<string, unknown> | undefined;
                  const setup = printingCard.currentVersion.setupPositioning as Record<string, unknown> | undefined;
                  const notes = printingCard.currentVersion.surgeonNotes as Record<string, unknown> | undefined;
                  const hasPatientFlags = pf && Object.values(pf).some(v => v);
                  return (
                  <div className="print-sections">
                    {/* Patient Flags */}
                    <div className="print-section">
                      <h3>Patient-Dependent Flags</h3>
                      {hasPatientFlags ? (
                        <ul>
                          {pf.latexAllergy && <li>Latex-Free Required</li>}
                          {pf.iodineAllergy && <li>Iodine-Free Required</li>}
                          {pf.nickelFree && <li>Nickel-Free Implants</li>}
                          {pf.anticoagulation && <li>Anticoagulation Consideration</li>}
                          {pf.infectionRisk && <li>Infection Risk</li>}
                          {pf.neuromonitoringRequired && <li>Neuromonitoring Required</li>}
                        </ul>
                      ) : (
                        <p className="empty-section">No patient-specific flags documented</p>
                      )}
                    </div>

                    {/* Instrumentation */}
                    <div className="print-section">
                      <h3>Instrumentation</h3>
                      {inst && Object.values(inst).some(v => v) ? (
                        <>
                          {Boolean(inst.primaryTrays) && (
                            <div><strong>Primary Trays:</strong><pre>{String(inst.primaryTrays)}</pre></div>
                          )}
                          {Boolean(inst.supplementalTrays) && (
                            <div><strong>Supplemental Trays:</strong><pre>{String(inst.supplementalTrays)}</pre></div>
                          )}
                          {Boolean(inst.looseInstruments) && (
                            <div><strong>Loose Instruments:</strong><pre>{String(inst.looseInstruments)}</pre></div>
                          )}
                          <div className="print-flags">
                            {Boolean(inst.flashAllowed) && <span>Flash Sterilization Allowed</span>}
                            {Boolean(inst.peelPackOnly) && <span>Peel Pack Only</span>}
                          </div>
                        </>
                      ) : (
                        <p className="empty-section">No instrumentation documented</p>
                      )}
                    </div>

                    {/* Equipment */}
                    <div className="print-section">
                      <h3>Equipment</h3>
                      {equip && Object.values(equip).some(v => v) ? (
                        <>
                          {Boolean(equip.energyDevices) && (
                            <div><strong>Energy Devices:</strong><pre>{String(equip.energyDevices)}</pre></div>
                          )}
                          {Boolean(equip.tourniquetLocation || equip.tourniquetPressure) && (
                            <div><strong>Tourniquet:</strong> {String(equip.tourniquetLocation || '')} {equip.tourniquetPressure ? `@ ${equip.tourniquetPressure}` : ''}</div>
                          )}
                          {Boolean(equip.imaging) && (
                            <div><strong>Imaging:</strong> {String(equip.imaging)}</div>
                          )}
                          {Boolean(equip.specializedDevices) && (
                            <div><strong>Specialized Devices:</strong><pre>{String(equip.specializedDevices)}</pre></div>
                          )}
                        </>
                      ) : (
                        <p className="empty-section">No equipment documented</p>
                      )}
                    </div>

                    {/* Supplies */}
                    <div className="print-section">
                      <h3>Supplies</h3>
                      {supp && Object.values(supp).some(v => v) ? (
                        <>
                          {Boolean(supp.gloves) && (
                            <div><strong>Gloves:</strong><pre>{String(supp.gloves)}</pre></div>
                          )}
                          {Boolean(supp.drapes) && (
                            <div><strong>Drapes:</strong><pre>{String(supp.drapes)}</pre></div>
                          )}
                          {Boolean(supp.implants) && (
                            <div><strong>Implants:</strong><pre>{String(supp.implants)}</pre></div>
                          )}
                          {Boolean(supp.sutures) && (
                            <div><strong>Sutures:</strong><pre>{String(supp.sutures)}</pre></div>
                          )}
                          {Boolean(supp.disposables) && (
                            <div><strong>Disposables:</strong><pre>{String(supp.disposables)}</pre></div>
                          )}
                        </>
                      ) : (
                        <p className="empty-section">No supplies documented</p>
                      )}
                    </div>

                    {/* Medications */}
                    <div className="print-section">
                      <h3>Medications & Solutions</h3>
                      {meds && Object.values(meds).some(v => v) ? (
                        <>
                          {Boolean(meds.localAnesthetic) && (
                            <div><strong>Local Anesthetic:</strong><pre>{String(meds.localAnesthetic)}</pre></div>
                          )}
                          {Boolean(meds.antibiotics) && (
                            <div><strong>Antibiotics:</strong><pre>{String(meds.antibiotics)}</pre></div>
                          )}
                          {Boolean(meds.irrigation) && (
                            <div><strong>Irrigation:</strong><pre>{String(meds.irrigation)}</pre></div>
                          )}
                          {Boolean(meds.topicalAgents) && (
                            <div><strong>Topical Agents:</strong><pre>{String(meds.topicalAgents)}</pre></div>
                          )}
                        </>
                      ) : (
                        <p className="empty-section">No medications/solutions documented</p>
                      )}
                    </div>

                    {/* Setup & Positioning */}
                    <div className="print-section">
                      <h3>Setup & Positioning</h3>
                      {setup && Object.values(setup).some(v => v) ? (
                        <>
                          {Boolean(setup.patientPosition) && (
                            <div><strong>Patient Position:</strong> {String(setup.patientPosition)}</div>
                          )}
                          {Boolean(setup.tableConfiguration) && (
                            <div><strong>Table Configuration:</strong> {String(setup.tableConfiguration)}</div>
                          )}
                          {Boolean(setup.paddingRequirements) && (
                            <div><strong>Padding:</strong><pre>{String(setup.paddingRequirements)}</pre></div>
                          )}
                          {Boolean(setup.mayoStandCount || setup.mayoStandPlacement) && (
                            <div><strong>Mayo Stand:</strong> {setup.mayoStandCount ? `${setup.mayoStandCount}x` : ''} {String(setup.mayoStandPlacement || '')}</div>
                          )}
                          {Boolean(setup.backTableNotes) && (
                            <div><strong>Back Table:</strong><pre>{String(setup.backTableNotes)}</pre></div>
                          )}
                          {Boolean(setup.orFlowNotes) && (
                            <div><strong>OR Flow Notes:</strong><pre>{String(setup.orFlowNotes)}</pre></div>
                          )}
                        </>
                      ) : (
                        <p className="empty-section">No setup/positioning documented</p>
                      )}
                    </div>

                    {/* Surgeon Notes */}
                    <div className="print-section">
                      <h3>Surgeon Notes & Preferences</h3>
                      {notes && Object.values(notes).some(v => v) ? (
                        <>
                          {Boolean(notes.preferences) && (
                            <div><strong>Preferences:</strong><pre>{String(notes.preferences)}</pre></div>
                          )}
                          {Boolean(notes.holdPrnItems) && (
                            <div><strong>Hold / PRN Items:</strong><pre>{String(notes.holdPrnItems)}</pre></div>
                          )}
                          {Boolean(notes.decisionTriggers) && (
                            <div><strong>Decision Triggers:</strong><pre>{String(notes.decisionTriggers)}</pre></div>
                          )}
                          {Boolean(notes.teachingModifiers) && (
                            <div><strong>Teaching Case Modifiers:</strong><pre>{String(notes.teachingModifiers)}</pre></div>
                          )}
                          {Boolean(notes.revisionAddOns) && (
                            <div><strong>Revision-Only Add-Ons:</strong><pre>{String(notes.revisionAddOns)}</pre></div>
                          )}
                        </>
                      ) : (
                        <p className="empty-section">No surgeon notes/preferences documented</p>
                      )}
                    </div>
                  </div>
                  );
                })()}

                <div className="print-footer">
                  <span>Printed: {new Date().toLocaleString()}</span>
                  <span>Facility: {user?.facilityName}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .preference-cards-page {
          padding: 2rem 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .summary-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #2d3748;
        }

        .summary-label {
          font-size: 0.75rem;
          color: #718096;
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .search-input {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
          min-width: 200px;
        }

        .filters select {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .form-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .form-card h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .form-section {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .form-section h3 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: #4a5568;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
          font-family: inherit;
        }

        .form-group input:disabled,
        .form-group select:disabled {
          background: #f7fafc;
          color: #718096;
        }

        .form-group textarea {
          resize: vertical;
          min-height: 60px;
        }

        .collapsible-section {
          margin-bottom: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          text-align: left;
        }

        .section-header:hover {
          background: #edf2f7;
        }

        .toggle-icon {
          font-size: 1.25rem;
          color: #718096;
        }

        .section-content {
          padding: 1rem;
          background: white;
        }

        .section-note {
          font-size: 0.75rem;
          color: #718096;
          font-style: italic;
          margin: 0 0 1rem 0;
        }

        .checkbox-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .checkbox-item input {
          width: auto;
        }

        .edit-metadata {
          background: #fffbeb;
          border-left: 4px solid #f59e0b;
          padding-left: 1rem;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table th {
          background: #f8f9fa;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
        }

        .data-table tr:hover {
          background: #f8f9fa;
        }

        .data-table tr.deprecated-row {
          opacity: 0.5;
        }

        .name-cell {
          font-weight: 500;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.draft {
          background: #e2e8f0;
          color: #4a5568;
        }

        .status-badge.active {
          background: #c6f6d5;
          color: #276749;
        }

        .status-badge.deprecated {
          background: #fed7d7;
          color: #c53030;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

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

        .modal {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.125rem;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #718096;
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .edit-log-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .edit-log-entry {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 4px;
          border-left: 3px solid #3b82f6;
        }

        .edit-log-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .edit-log-date {
          font-size: 0.75rem;
          color: #718096;
        }

        .edit-log-details {
          font-size: 0.75rem;
          color: #4a5568;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .alert-success {
          background: #c6f6d5;
          border: 1px solid #9ae6b4;
          color: #276749;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          cursor: pointer;
        }

        .btn-success {
          background: #38a169;
          color: white;
        }

        .btn-success:hover {
          background: #2f855a;
        }

        .btn-danger {
          background: #e53e3e;
          color: white;
        }

        .btn-danger:hover {
          background: #c53030;
        }

        /* Feedback Modal Styles */
        .feedback-modal {
          max-width: 700px;
        }

        .feedback-summary {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .feedback-stat {
          font-size: 0.875rem;
        }

        .feedback-stat.pending strong {
          color: #d69e2e;
        }

        .feedback-stat.reviewed strong {
          color: #38a169;
        }

        .feedback-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .feedback-entry {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 4px;
          border-left: 3px solid #3b82f6;
        }

        .feedback-entry.pending {
          border-left-color: #d69e2e;
        }

        .feedback-entry.reviewed {
          border-left-color: #38a169;
        }

        .feedback-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .feedback-case {
          font-weight: 500;
        }

        .feedback-status {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .feedback-status.pending {
          background: #faf089;
          color: #744210;
        }

        .feedback-status.reviewed {
          background: #c6f6d5;
          color: #276749;
        }

        .feedback-content {
          margin-bottom: 0.75rem;
        }

        .feedback-field {
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }

        .feedback-meta {
          font-size: 0.75rem;
          color: #718096;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .feedback-actions {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #e2e8f0;
        }

        .review-form {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .review-form select,
        .review-form input {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .review-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .feedback-review-notes {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.875rem;
          font-style: italic;
        }

        /* Print Modal Styles */
        .print-modal {
          max-width: 800px;
          max-height: 90vh;
        }

        .print-modal .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .print-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .print-content {
          background: white;
        }

        .print-header {
          border-bottom: 2px solid #2d3748;
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .print-header h1 {
          margin: 0 0 0.25rem 0;
          font-size: 1.25rem;
          line-height: 1.2;
        }

        .print-meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.75rem;
          margin-bottom: 0.25rem;
          line-height: 1.4;
        }

        .print-notes {
          font-size: 0.75rem;
          margin-top: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: #f7fafc;
          border-radius: 2px;
          line-height: 1.4;
        }

        .print-sections {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .print-section {
          border: 1px solid #e2e8f0;
          border-radius: 2px;
          padding: 0.5rem;
          page-break-inside: avoid;
        }

        .print-section h3 {
          margin: 0 0 0.375rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #2d3748;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.25rem;
          line-height: 1.2;
        }

        .empty-section {
          color: #a0aec0;
          font-style: italic;
          font-size: 0.75rem;
          margin: 0;
          line-height: 1.4;
        }

        .print-section pre {
          margin: 0.125rem 0 0.25rem 0;
          font-family: inherit;
          white-space: pre-wrap;
          font-size: 0.75rem;
          background: #f7fafc;
          padding: 0.25rem 0.375rem;
          border-radius: 2px;
          line-height: 1.4;
        }

        .print-section ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .print-section li {
          font-size: 0.75rem;
          margin-bottom: 0.125rem;
          line-height: 1.4;
        }

        .print-flags {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.25rem;
          flex-wrap: wrap;
        }

        .print-flags span {
          background: #edf2f7;
          padding: 0.125rem 0.375rem;
          border-radius: 2px;
          font-size: 0.65rem;
          line-height: 1.3;
        }

        .print-footer {
          margin-top: 0.75rem;
          padding-top: 0.5rem;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 0.65rem;
          color: #718096;
          line-height: 1.3;
        }

        /* Print-specific styles */
        @media print {
          @page {
            margin: 0.5in;
            size: letter;
          }

          body {
            margin: 0;
            padding: 0;
          }

          /* Hide everything except print modal */
          body * {
            visibility: hidden;
          }

          body {
            background: white;
          }

          header {
            display: none !important;
          }

          .print-modal-overlay,
          .print-modal-overlay * {
            visibility: visible;
          }

          .print-modal-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            display: block !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            overflow: visible !important;
            z-index: 9999 !important;
          }

          .print-modal {
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }

          .modal-body {
            padding: 0 !important;
            overflow: visible !important;
          }

          .print-content {
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .print-header {
            margin-bottom: 0.5rem;
            padding-bottom: 0.375rem;
          }

          .print-sections {
            gap: 0.375rem;
          }
        }
      `}</style>
    </>
  );
}
