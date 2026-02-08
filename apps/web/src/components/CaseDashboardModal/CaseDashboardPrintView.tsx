'use client';

import { type CaseDashboardData, type ConfigItem } from '@/lib/api';

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

  const getAttestationClass = () => {
    switch (dashboard.attestationState) {
      case 'ATTESTED': return 'text-[var(--color-green-700)]';
      case 'VOIDED': return 'text-[var(--color-red)]';
      default: return 'text-text-muted';
    }
  };

  const activePatientFlags = Object.entries(dashboard.patientFlags || {}).filter(([_, v]) => v);
  const activeAdmissionTypes = Object.entries(dashboard.admissionTypes || {}).filter(([_, v]) => v);
  const hasPatientFlags = activePatientFlags.length > 0;

  return (
    <div className="cdpv-overlay fixed inset-0 bg-[var(--shadow-overlay)] flex items-center justify-center z-[1000] p-4" onClick={onClose}>
      <div className="cdpv-container bg-surface-primary rounded-lg shadow-[0_20px_40px_var(--shadow-md)] max-w-[8.5in] max-h-[90vh] overflow-auto w-full" onClick={e => e.stopPropagation()}>
        {/* Screen-only controls */}
        <div className="no-print flex justify-between items-center px-6 py-4 border-b border-border bg-surface-secondary sticky top-0 z-10">
          <h3 className="m-0 text-lg text-text-primary">Print Case Dashboard</h3>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={executePrint}>Print</button>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Printable content */}
        <div className="cdpv-page p-[0.75in] bg-surface-primary">
          {/* Header with case identity */}
          <header className="border-b-4 pb-4 mb-6" style={{ borderBottomColor: getStatusColor() }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h1 className="m-0 text-2xl font-bold text-text-primary leading-tight">{dashboard.procedureName}</h1>
                <div className="text-lg text-text-secondary mt-1">Dr. {dashboard.surgeon}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-xl font-bold text-text-primary">{dashboard.caseNumber}</div>
                <div className="text-xs text-text-muted uppercase tracking-wide">Case #</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex flex-wrap gap-6 text-sm text-text-secondary mb-1">
                <span><strong className="text-text-primary">Facility:</strong> {dashboard.facility}</span>
                <span><strong className="text-text-primary">Case Type:</strong> {dashboard.caseType?.replace('_', ' ') || 'Elective'}</span>
                <span><strong className="text-text-primary">OR Room:</strong> {dashboard.orRoom || '—'}</span>
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-text-secondary mb-1">
                <span>
                  <strong className="text-text-primary">Scheduled:</strong>{' '}
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

            <div
              className="cdpv-status-badge inline-block py-1.5 px-4 rounded text-white font-semibold text-sm mt-3 tracking-wide"
              style={{ backgroundColor: getStatusColor() }}
            >
              {getStatusLabel()}
            </div>
          </header>

          {/* Two-column layout for compact sections */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Case Summary */}
            <section className="cdpv-section border border-border rounded-md p-3.5 break-inside-avoid">
              <h2 className="m-0 mb-3 text-[0.9375rem] font-semibold text-text-secondary border-b border-border pb-2">Case Summary</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Estimated Duration</label>
                  <span className="text-text-primary">{dashboard.estimatedDurationMinutes ? `${dashboard.estimatedDurationMinutes} min` : '—'}</span>
                </div>
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Laterality</label>
                  <span className="text-text-primary">{dashboard.laterality || '—'}</span>
                </div>
              </div>
              <div className="text-sm mt-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Procedure Codes (CPT)</label>
                <span className="text-text-primary">{dashboard.procedureCodes?.length > 0 ? dashboard.procedureCodes.join(', ') : '—'}</span>
              </div>
              {activeAdmissionTypes.length > 0 && (
                <div className="text-sm mt-2">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Admission Type</label>
                  <span className="text-text-primary">{activeAdmissionTypes.map(([key]) => ADMISSION_TYPE_LABELS[key] || key).join(', ')}</span>
                </div>
              )}
              {dashboard.schedulerNotes && (
                <div className="text-sm mt-2">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Scheduler Notes</label>
                  <span className="text-text-primary">{dashboard.schedulerNotes}</span>
                </div>
              )}
            </section>

            {/* Anesthesia Plan */}
            <section className="cdpv-section border border-border rounded-md p-3.5 break-inside-avoid">
              <h2 className="m-0 mb-3 text-[0.9375rem] font-semibold text-text-secondary border-b border-border pb-2">Anesthesia Plan</h2>
              <div className="text-sm mt-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Modalities</label>
                <span className="text-text-primary">
                  {dashboard.anesthesiaPlan?.modalities?.length
                    ? dashboard.anesthesiaPlan.modalities.map(m => {
                        const opt = anesthesiaModalities.find(o => o.itemKey === m);
                        return opt?.displayLabel || m;
                      }).join(', ')
                    : '—'}
                </span>
              </div>
              {dashboard.anesthesiaPlan?.airwayNotes && (
                <div className="text-sm mt-2">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Airway Notes</label>
                  <span className="text-text-primary">{dashboard.anesthesiaPlan.airwayNotes}</span>
                </div>
              )}
              {dashboard.anesthesiaPlan?.anticoagulationConsiderations && (
                <div className="text-sm mt-2">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Anticoagulation</label>
                  <span className="text-text-primary">{dashboard.anesthesiaPlan.anticoagulationConsiderations}</span>
                </div>
              )}
            </section>
          </div>

          {/* Patient Flags - Full width, highlighted if present */}
          <section className={`cdpv-section border rounded-md p-3.5 break-inside-avoid mb-4 ${
            hasPatientFlags ? 'border-2 border-[var(--color-red)] bg-[var(--color-red-50)]' : 'border-border'
          }`}>
            <h2 className={`m-0 mb-3 text-[0.9375rem] font-semibold border-b pb-2 ${
              hasPatientFlags ? 'text-[var(--color-red-700)] border-[var(--color-red-100)]' : 'text-text-secondary border-border'
            }`}>
              {hasPatientFlags ? '⚠ Patient-Specific Flags' : 'Patient-Specific Flags'}
            </h2>
            {hasPatientFlags ? (
              <div className="flex flex-wrap gap-2">
                {activePatientFlags.map(([key]) => {
                  const flagOption = patientFlagOptions.find(f => f.itemKey === key);
                  return (
                    <span key={key} className="cdpv-flag-badge inline-block bg-[var(--color-red-100)] text-[var(--color-red-700)] py-1 px-3 rounded-full text-[0.8125rem] font-medium">
                      {flagOption?.displayLabel || key}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-gray-400)] italic">None</div>
            )}
          </section>

          {/* Linked Preference Card */}
          <section className="cdpv-section border border-border rounded-md p-3.5 break-inside-avoid mb-4">
            <h2 className="m-0 mb-3 text-[0.9375rem] font-semibold text-text-secondary border-b border-border pb-2">Linked Preference Card</h2>
            {dashboard.caseCard ? (
              <div className="flex flex-wrap gap-6">
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Name</label>
                  <span className="text-text-primary">{dashboard.caseCard.name}</span>
                </div>
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Version</label>
                  <span className="text-text-primary">{dashboard.caseCard.version}</span>
                </div>
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Status</label>
                  <span className="text-text-primary">{dashboard.caseCard.status}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--color-red-700)] italic">No preference card linked</div>
            )}
          </section>

          {/* Case-Specific Overrides */}
          <section className="cdpv-section border border-border rounded-md p-3.5 break-inside-avoid mb-4">
            <h2 className="m-0 mb-3 text-[0.9375rem] font-semibold text-text-secondary border-b border-border pb-2">Case-Specific Overrides ({dashboard.overrides.length})</h2>
            {dashboard.overrides.length > 0 ? (
              <table className="w-full text-[0.8125rem] border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left border-b border-border font-semibold text-text-secondary bg-surface-secondary">Target</th>
                    <th className="p-2 text-left border-b border-border font-semibold text-text-secondary bg-surface-secondary">Original</th>
                    <th className="p-2 text-left border-b border-border font-semibold text-text-secondary bg-surface-secondary">Override</th>
                    <th className="p-2 text-left border-b border-border font-semibold text-text-secondary bg-surface-secondary">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.overrides.map(o => (
                    <tr key={o.id}>
                      <td className="p-2 border-b border-border text-text-primary">{o.target}</td>
                      <td className="p-2 border-b border-border text-text-primary">{o.originalValue || '—'}</td>
                      <td className="p-2 border-b border-border text-text-primary">{o.overrideValue}</td>
                      <td className="p-2 border-b border-border text-text-primary">{o.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-[var(--color-gray-400)] italic">None</div>
            )}
          </section>

          {/* Readiness Attestation */}
          <section className="cdpv-section border border-border rounded-md p-3.5 break-inside-avoid mb-4">
            <h2 className="m-0 mb-3 text-[0.9375rem] font-semibold text-text-secondary border-b border-border pb-2">Readiness Attestation</h2>
            <div className="flex flex-wrap gap-6">
              <div className="text-sm">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">State</label>
                <span className={`font-semibold ${getAttestationClass()}`}>
                  {dashboard.attestationState.replace('_', ' ')}
                </span>
              </div>
              {dashboard.attestedBy && (
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Attested By</label>
                  <span className="text-text-primary">{dashboard.attestedBy}</span>
                </div>
              )}
              {dashboard.attestedAt && (
                <div className="text-sm">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Attested At</label>
                  <span className="text-text-primary">{new Date(dashboard.attestedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
            {dashboard.voidReason && (
              <div className="text-sm mt-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">Void Reason</label>
                <span className="text-[var(--color-red-700)]">{dashboard.voidReason}</span>
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="mt-6 pt-4 border-t border-border flex justify-between text-xs text-text-muted">
            <span>Printed: {new Date().toLocaleString()}</span>
            <span>{facilityName || dashboard.facility}</span>
          </footer>
        </div>
      </div>

      {/* Print styles — requires global style jsx for body * and @page */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .cdpv-overlay,
          .cdpv-overlay * {
            visibility: visible;
          }
          .cdpv-overlay {
            position: absolute;
            inset: 0;
            background: white;
            padding: 0;
          }
          .cdpv-container {
            box-shadow: none;
            border-radius: 0;
            max-height: none;
            overflow: visible;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: letter;
            margin: 0.5in;
          }
          .cdpv-page {
            padding: 0;
          }
          .cdpv-status-badge,
          .cdpv-flag-badge,
          .cdpv-section {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .cdpv-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
