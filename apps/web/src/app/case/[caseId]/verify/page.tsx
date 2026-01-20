'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AdminNav } from '@/app/components/AdminNav';
import { useScannerService, type ScanProcessResult } from '@/lib/useScannerService';
import {
  getCaseVerification,
  createInventoryEvent,
  type CaseVerificationResponse,
  type VerificationRequirement,
  type VerificationItem,
} from '@/lib/api';

function CaseVerificationContent() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const caseId = params.caseId as string;

  // Verification data state
  const [verification, setVerification] = useState<CaseVerificationResponse | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Scanner state
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [lastScanResult, setLastScanResult] = useState<{
    barcode: string;
    matched: boolean;
    itemId?: string;
    catalogName?: string;
    message: string;
  } | null>(null);

  // Expanded requirements
  const [expandedRequirements, setExpandedRequirements] = useState<Set<string>>(new Set());

  const loadVerification = useCallback(async () => {
    if (!token || !caseId) return;

    setIsLoadingData(true);
    setError('');

    try {
      const result = await getCaseVerification(token, caseId);
      setVerification(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load verification data');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, caseId]);

  // Handle barcode scan
  const handleScanProcessed = useCallback(async (scanResult: ScanProcessResult) => {
    if (!verification || !token) return;

    const { rawValue, item, processed, error: scanError } = scanResult;

    if (scanError) {
      setLastScanResult({
        barcode: rawValue,
        matched: false,
        message: scanError,
      });
      return;
    }

    if (!processed || !item) {
      setLastScanResult({
        barcode: rawValue,
        matched: false,
        message: 'Item not found in inventory',
      });
      return;
    }

    // Check if this item matches any requirement for this case
    const matchingReq = verification.requirements.find(
      req => req.catalogId === item.catalogId
    );

    if (!matchingReq) {
      setLastScanResult({
        barcode: rawValue,
        matched: false,
        itemId: item.id,
        catalogName: item.catalogName,
        message: `${item.catalogName} is not required for this case`,
      });
      return;
    }

    // Check if item is already in requirement items
    const itemInReq = matchingReq.items.find(i => i.id === item.id);
    if (!itemInReq) {
      setLastScanResult({
        barcode: rawValue,
        matched: false,
        itemId: item.id,
        catalogName: item.catalogName,
        message: `${item.catalogName} is not available for this case (may be reserved elsewhere)`,
      });
      return;
    }

    // Create VERIFIED event for this item
    try {
      await createInventoryEvent(token, {
        inventoryItemId: item.id,
        eventType: 'VERIFIED',
        caseId: caseId,
        notes: `Verified for case readiness`,
      });

      setLastScanResult({
        barcode: rawValue,
        matched: true,
        itemId: item.id,
        catalogName: item.catalogName,
        message: `${item.catalogName} verified successfully`,
      });

      setSuccessMessage(`${item.catalogName} verified`);
      setTimeout(() => setSuccessMessage(''), 3000);

      // Reload verification data to update counts
      loadVerification();
    } catch (err) {
      setLastScanResult({
        barcode: rawValue,
        matched: false,
        itemId: item.id,
        catalogName: item.catalogName,
        message: `Failed to verify: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }, [verification, token, caseId, loadVerification]);

  // Initialize scanner service
  const scanner = useScannerService({
    token,
    enabled: scannerEnabled && !isLoading && !!user,
    onScanProcessed: handleScanProcessed,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
      return;
    }
    loadVerification();
  }, [isLoading, user, router, loadVerification]);

  const toggleRequirement = (reqId: string) => {
    setExpandedRequirements(prev => {
      const next = new Set(prev);
      if (next.has(reqId)) {
        next.delete(reqId);
      } else {
        next.add(reqId);
      }
      return next;
    });
  };

  // Manual verify item
  const handleManualVerify = async (item: VerificationItem, catalogName: string) => {
    if (!token) return;

    try {
      await createInventoryEvent(token, {
        inventoryItemId: item.id,
        eventType: 'VERIFIED',
        caseId: caseId,
        notes: 'Manual verification for case readiness',
      });

      setSuccessMessage(`${catalogName} verified`);
      setTimeout(() => setSuccessMessage(''), 3000);
      loadVerification();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify item');
    }
  };

  // Expand/collapse all
  const expandAll = () => {
    if (verification) {
      setExpandedRequirements(new Set(verification.requirements.map(r => r.id)));
    }
  };

  const collapseAll = () => {
    setExpandedRequirements(new Set());
  };

  if (isLoading || isLoadingData) {
    return (
      <>
        <AdminNav userRole={user?.role || ''} />
        <main className="admin-main">
          <div className="loading">Loading verification data...</div>
        </main>
      </>
    );
  }

  if (!user || !verification) {
    return (
      <>
        <AdminNav userRole={user?.role || ''} />
        <main className="admin-main">
          <div className="error-message">{error || 'Case not found'}</div>
        </main>
      </>
    );
  }

  const getReadinessColor = (state: string) => {
    switch (state) {
      case 'GREEN': return 'var(--green)';
      case 'ORANGE': return 'var(--orange)';
      case 'RED': return 'var(--red)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <>
      <AdminNav userRole={user?.role || ''} />
      <main className="admin-main" style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
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
          </div>
        )}

        {/* Case Header */}
        <section style={{
          background: 'var(--surface)',
          border: `3px solid ${getReadinessColor(verification.summary.readinessState)}`,
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Item Verification</h1>
              <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>
                {verification.procedureName} | {verification.surgeonName}
              </p>
              <p style={{ margin: '0.5rem 0' }}>
                <strong>Scheduled:</strong> {new Date(verification.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {verification.scheduledTime && ` at ${verification.scheduledTime}`}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                background: getReadinessColor(verification.summary.readinessState),
                color: 'white',
                fontWeight: 'bold',
              }}>
                {verification.summary.readinessState}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                {verification.summary.satisfiedRequirements} / {verification.summary.totalRequirements} requirements met
              </div>
            </div>
          </div>
        </section>

        {/* Scanner Status & Controls */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Scanner Status</h3>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: scanner.isCapturing ? 'var(--green)' : 'var(--red)',
                }} />
                <span>{scanner.isCapturing ? 'Ready - Scan barcode to verify' : 'Disabled'}</span>
                {scanner.isProcessing && <span style={{ color: 'var(--orange)' }}>(Processing...)</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setScannerEnabled(!scannerEnabled)}
                className={scannerEnabled ? 'btn-secondary' : 'btn-primary'}
              >
                {scannerEnabled ? 'Disable Scanner' : 'Enable Scanner'}
              </button>
              <button onClick={loadVerification} className="btn-secondary">
                Refresh
              </button>
            </div>
          </div>

          {/* Last Scan Result */}
          {lastScanResult && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '4px',
              background: lastScanResult.matched ? 'rgba(46, 125, 50, 0.1)' : 'rgba(198, 40, 40, 0.1)',
              border: `1px solid ${lastScanResult.matched ? 'var(--green)' : 'var(--red)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{lastScanResult.matched ? 'Verified' : 'Not Matched'}</strong>
                  <p style={{ margin: '0.25rem 0 0 0' }}>{lastScanResult.message}</p>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Barcode: {lastScanResult.barcode}
                  </p>
                </div>
                <button onClick={() => setLastScanResult(null)} className="btn-small">
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Requirements List */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Requirements ({verification.requirements.length})</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={expandAll} className="btn-small btn-secondary">Expand All</button>
              <button onClick={collapseAll} className="btn-small btn-secondary">Collapse All</button>
            </div>
          </div>

          {verification.requirements.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No requirements defined for this case.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {verification.requirements.map(req => (
                <RequirementCard
                  key={req.id}
                  requirement={req}
                  expanded={expandedRequirements.has(req.id)}
                  onToggle={() => toggleRequirement(req.id)}
                  onVerify={handleManualVerify}
                />
              ))}
            </div>
          )}
        </section>

        {/* Back to Case Dashboard */}
        <button onClick={() => router.push(`/case/${caseId}`)} className="btn-secondary">
          Back to Case Dashboard
        </button>
      </main>
    </>
  );
}

interface RequirementCardProps {
  requirement: VerificationRequirement;
  expanded: boolean;
  onToggle: () => void;
  onVerify: (item: VerificationItem, catalogName: string) => void;
}

function RequirementCard({ requirement, expanded, onToggle, onVerify }: RequirementCardProps) {
  const { catalogName, category, requiredQuantity, requiresSterility, verifiedCount, suitableCount, isSatisfied, items } = requirement;

  const statusColor = isSatisfied ? 'var(--green)' : verifiedCount > 0 ? 'var(--orange)' : 'var(--red)';

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${statusColor}`,
      borderRadius: '4px',
      background: 'var(--surface)',
    }}>
      {/* Requirement Header */}
      <div
        onClick={onToggle}
        style={{
          padding: '0.75rem 1rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span style={{ fontWeight: 'bold' }}>{catalogName}</span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ({category})
          </span>
          {requiresSterility && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: 'var(--blue)', color: 'white', padding: '0.125rem 0.375rem', borderRadius: '4px' }}>
              Sterile
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: statusColor, fontWeight: 'bold' }}>
            {suitableCount} / {requiredQuantity}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {expanded ? '-' : '+'}
          </span>
        </div>
      </div>

      {/* Expanded Items */}
      {expanded && items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1rem' }}>
          <table style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '0.25rem' }}>Barcode/Serial</th>
                <th style={{ padding: '0.25rem' }}>Location</th>
                <th style={{ padding: '0.25rem' }}>Sterility</th>
                <th style={{ padding: '0.25rem' }}>Status</th>
                <th style={{ padding: '0.25rem' }}>Verified</th>
                <th style={{ padding: '0.25rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: '0.25rem' }}>
                    {item.barcode || item.serialNumber || '-'}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    {item.locationName || '-'}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    <span style={{
                      color: item.sterilityStatus === 'STERILE' ? 'var(--green)' : 'var(--text-muted)',
                    }}>
                      {item.sterilityStatus}
                    </span>
                    {item.sterilityExpiresAt && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                        Exp: {new Date(item.sterilityExpiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    {item.availabilityStatus}
                    {item.isReservedForThisCase && (
                      <span style={{ fontSize: '0.75rem', background: 'var(--blue)', color: 'white', padding: '0.125rem 0.25rem', borderRadius: '4px', marginLeft: '0.25rem' }}>
                        Reserved
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    {item.isVerified ? (
                      <span style={{ color: 'var(--green)' }}>
                        Yes
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                          by {item.lastVerifiedByName}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>No</span>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    {!item.isVerified && (
                      <button
                        onClick={() => onVerify(item, catalogName)}
                        className="btn-small btn-primary"
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && items.length === 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1rem', color: 'var(--red)' }}>
          No available items for this requirement
        </div>
      )}
    </div>
  );
}

export default function CaseVerificationPage() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <CaseVerificationContent />
    </Suspense>
  );
}
