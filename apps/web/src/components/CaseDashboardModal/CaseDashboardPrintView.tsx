'use client';

import { type CaseDashboardData, type ConfigItem } from '@/lib/api';
import './CaseDashboardPrintView.css';

interface CaseDashboardPrintViewProps {
  dashboard: CaseDashboardData;
  patientFlagOptions: ConfigItem[];
  anesthesiaModalities: ConfigItem[];
  facilityName?: string;
  onClose: () => void;
}

const ADMISSION_TYPE_LABELS: Record<string, string> = {
  outpatient: 'Outpatient',
  twentyThreeHrObs: '23 HR Obs',
  admin: 'Admin',
};

export function CaseDashboardPrintView({
  dashboard,
  patientFlagOptions,
  anesthesiaModalities,
  facilityName,
  onClose,
}: CaseDashboardPrintViewProps) {
  const executePrint = () => {
    window.print();
  };

  const getStatusColor = () => {
    switch (dashboard.attestationState) {
      case 'ATTESTED': return 'var(--color-green-700)';
      case 'VOIDED': return 'var(--color-red)';
      default: return 'var(--color-gray-500)';
    }
  };

  const getStatusLabel = () => {
    if (!dashboard.isActive) return 'INACTIVE';
    switch (dashboard.attestationState) {
      case 'ATTESTED': return 'ATTESTED';
      case 'VOIDED': return 'VOIDED';
      default: return 'NOT ATTESTED';
    }
  };

  const activePatientFlags = Object.entries(dashboard.patientFlags || {}).filter(([_, v]) => v);
  const activeAdmissionTypes = Object.entries(dashboard.admissionTypes || {}).filter(([_, v]) => v);
  const hasPatientFlags = activePatientFlags.length > 0;

  return (
    <div className="print-overlay" onClick={onClose}>
      <div className="print-container" onClick={e => e.stopPropagation()}>
        {/* Screen-only controls */}
        <div className="print-controls no-print">
          <h3>Print Case Dashboard</h3>
          <div className="print-controls-buttons">
            <button className="btn-primary" onClick={executePrint}>Print</button>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Printable content */}
        <div className="print-page">
          {/* Header with case identity */}
          <header className="print-header" style={{ borderBottomColor: getStatusColor() }}>
            <div className="print-header-top">
              <div className="print-header-title">
                <h1>{dashboard.procedureName}</h1>
                <div className="print-header-surgeon">Dr. {dashboard.surgeon}</div>
              </div>
              <div className="print-header-case-number">
                <div className="case-number">{dashboard.caseNumber}</div>
                <div className="case-number-label">Case #</div>
              </div>
            </div>

            <div className="print-header-details">
              <div className="print-header-row">
                <span><strong>Facility:</strong> {dashboard.facility}</span>
                <span><strong>Case Type:</strong> {dashboard.caseType?.replace('_', ' ') || 'Elective'}</span>
                <span><strong>OR Room:</strong> {dashboard.orRoom || '—'}</span>
              </div>
              <div className="print-header-row">
                <span>
                  <strong>Scheduled:</strong>{' '}
                  {new Date(dashboard.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                  {dashboard.scheduledTime && ` at ${dashboard.scheduledTime}`}
                </span>
              </div>
            </div>

            <div className="print-status-badge" style={{ backgroundColor: getStatusColor() }}>
              {getStatusLabel()}
            </div>
          </header>

          {/* Two-column layout for compact sections */}
          <div className="print-two-column">
            {/* Case Summary */}
            <section className="print-section">
              <h2>Case Summary</h2>
              <div className="print-field-grid">
                <div className="print-field">
                  <label>Estimated Duration</label>
                  <span>{dashboard.estimatedDurationMinutes ? `${dashboard.estimatedDurationMinutes} min` : '—'}</span>
                </div>
                <div className="print-field">
                  <label>Laterality</label>
                  <span>{dashboard.laterality || '—'}</span>
                </div>
              </div>
              <div className="print-field full-width">
                <label>Procedure Codes (CPT)</label>
                <span>{dashboard.procedureCodes?.length > 0 ? dashboard.procedureCodes.join(', ') : '—'}</span>
              </div>
              {activeAdmissionTypes.length > 0 && (
                <div className="print-field full-width">
                  <label>Admission Type</label>
                  <span>{activeAdmissionTypes.map(([key]) => ADMISSION_TYPE_LABELS[key] || key).join(', ')}</span>
                </div>
              )}
              {dashboard.schedulerNotes && (
                <div className="print-field full-width">
                  <label>Scheduler Notes</label>
                  <span>{dashboard.schedulerNotes}</span>
                </div>
              )}
            </section>

            {/* Anesthesia Plan */}
            <section className="print-section">
              <h2>Anesthesia Plan</h2>
              <div className="print-field full-width">
                <label>Modalities</label>
                <span>
                  {dashboard.anesthesiaPlan?.modalities?.length
                    ? dashboard.anesthesiaPlan.modalities.map(m => {
                        const opt = anesthesiaModalities.find(o => o.itemKey === m);
                        return opt?.displayLabel || m;
                      }).join(', ')
                    : '—'}
                </span>
              </div>
              {dashboard.anesthesiaPlan?.airwayNotes && (
                <div className="print-field full-width">
                  <label>Airway Notes</label>
                  <span>{dashboard.anesthesiaPlan.airwayNotes}</span>
                </div>
              )}
              {dashboard.anesthesiaPlan?.anticoagulationConsiderations && (
                <div className="print-field full-width">
                  <label>Anticoagulation</label>
                  <span>{dashboard.anesthesiaPlan.anticoagulationConsiderations}</span>
                </div>
              )}
            </section>
          </div>

          {/* Patient Flags - Full width, highlighted if present */}
          <section className={`print-section print-section-full ${hasPatientFlags ? 'print-section-alert' : ''}`}>
            <h2>{hasPatientFlags ? '⚠ Patient-Specific Flags' : 'Patient-Specific Flags'}</h2>
            {hasPatientFlags ? (
              <div className="print-flags">
                {activePatientFlags.map(([key]) => {
                  const flagOption = patientFlagOptions.find(f => f.itemKey === key);
                  return (
                    <span key={key} className="print-flag-badge">
                      {flagOption?.displayLabel || key}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="print-none">None</div>
            )}
          </section>

          {/* Linked Preference Card */}
          <section className="print-section print-section-full">
            <h2>Linked Preference Card</h2>
            {dashboard.caseCard ? (
              <div className="print-field-row">
                <div className="print-field">
                  <label>Name</label>
                  <span>{dashboard.caseCard.name}</span>
                </div>
                <div className="print-field">
                  <label>Version</label>
                  <span>{dashboard.caseCard.version}</span>
                </div>
                <div className="print-field">
                  <label>Status</label>
                  <span>{dashboard.caseCard.status}</span>
                </div>
              </div>
            ) : (
              <div className="print-none print-warning">No preference card linked</div>
            )}
          </section>

          {/* Case-Specific Overrides */}
          <section className="print-section print-section-full">
            <h2>Case-Specific Overrides ({dashboard.overrides.length})</h2>
            {dashboard.overrides.length > 0 ? (
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Original</th>
                    <th>Override</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.overrides.map(o => (
                    <tr key={o.id}>
                      <td>{o.target}</td>
                      <td>{o.originalValue || '—'}</td>
                      <td>{o.overrideValue}</td>
                      <td>{o.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="print-none">None</div>
            )}
          </section>

          {/* Readiness Attestation */}
          <section className="print-section print-section-full">
            <h2>Readiness Attestation</h2>
            <div className="print-field-row">
              <div className="print-field">
                <label>State</label>
                <span className={`print-attestation-state print-attestation-${dashboard.attestationState.toLowerCase()}`}>
                  {dashboard.attestationState.replace('_', ' ')}
                </span>
              </div>
              {dashboard.attestedBy && (
                <div className="print-field">
                  <label>Attested By</label>
                  <span>{dashboard.attestedBy}</span>
                </div>
              )}
              {dashboard.attestedAt && (
                <div className="print-field">
                  <label>Attested At</label>
                  <span>{new Date(dashboard.attestedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
            {dashboard.voidReason && (
              <div className="print-field full-width">
                <label>Void Reason</label>
                <span className="print-warning">{dashboard.voidReason}</span>
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="print-footer">
            <span>Printed: {new Date().toLocaleString()}</span>
            <span>{facilityName || dashboard.facility}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
