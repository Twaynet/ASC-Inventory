'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useScannerService, ScanProcessResult } from '@/lib/useScannerService';
import { createInventoryEvent, createInventoryItem, type CreateInventoryItemRequest } from '@/lib/api/inventory';
import { getCatalogItems, type CatalogItem } from '@/lib/api/catalog';
import { getLocations, type Location } from '@/lib/api/settings';
import { getCase, type Case } from '@/lib/api/cases';

type CheckInMode = 'verify' | 'receive' | 'location_change';

const STERILITY_STATUSES = ['STERILE', 'NON_STERILE', 'EXPIRED', 'UNKNOWN'] as const;

const MODE_LABELS: Record<CheckInMode, { verb: string; past: string; button: string }> = {
  verify: { verb: 'verify', past: 'verified', button: 'Confirm Verified' },
  receive: { verb: 'receive', past: 'received', button: 'Receive Item' },
  location_change: { verb: 'move', past: 'moved', button: 'Move Item' },
};

const EVENT_TYPE_MAP: Record<CheckInMode, string> = {
  verify: 'VERIFIED',
  receive: 'RECEIVED',
  location_change: 'LOCATION_CHANGED',
};

/** Map API error codes to user-friendly messages */
function friendlyError(err: unknown): { message: string; requestId?: string } {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Envelope error shape: { error: { code, message, requestId } }
    if (e.error && typeof e.error === 'object') {
      const inner = e.error as Record<string, unknown>;
      const code = inner.code as string | undefined;
      const requestId = inner.requestId as string | undefined;
      switch (code) {
        case 'UNAUTHENTICATED':
          return { message: 'Session expired — please log in again.', requestId };
        case 'FORBIDDEN':
          return { message: 'You don\'t have permission for inventory check-in.', requestId };
        case 'VALIDATION_ERROR':
          return { message: 'Scan is invalid or incomplete.', requestId };
        default:
          return { message: (inner.message as string) || 'An error occurred.', requestId };
      }
    }
    if (e.message && typeof e.message === 'string') {
      if (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('Failed to fetch')) {
        return { message: 'Network issue — retrying is safe. If the problem persists, contact support.' };
      }
      return { message: e.message };
    }
  }
  if (err instanceof Error) {
    if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
      return { message: 'Network issue — retrying is safe. If the problem persists, contact support.' };
    }
    return { message: err.message };
  }
  return { message: 'An unexpected error occurred.' };
}

interface LastAction {
  itemName: string;
  lotNumber?: string | null;
  expiresAt?: string | null;
  eventType: string;
  mode: CheckInMode;
  timestamp: Date;
}

export default function InventoryCheckInPage() {
  const { user, token } = useAuth();
  const { hasCapability } = useAccessControl();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId');

  // Scanner service
  const {
    isCapturing,
    isProcessing,
    lastResult,
    scanHistory,
    clearLastResult,
    clearHistory,
    manualScan,
  } = useScannerService({
    token,
    enabled: true,
  });

  // UI state
  const [mode, setMode] = useState<CheckInMode>('verify');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [sterilityStatus, setSterilityStatus] = useState<string>('STERILE');
  const [notes, setNotes] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [error, setError] = useState('');
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Last action feedback (replaces simple successMessage)
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState('');

  // Duplicate detection ref
  const lastSubmitRef = useRef<{ itemId: string; eventType: string; ts: number } | null>(null);

  // Case context
  const [caseContext, setCaseContext] = useState<Case | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState('');

  // Loaner tracking fields (optional reference)
  const [loanerReference, setLoanerReference] = useState('');
  const [vendorName, setVendorName] = useState('');

  // Manual override state
  const [showOverride, setShowOverride] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [overrideCatalogId, setOverrideCatalogId] = useState('');
  const [overrideLot, setOverrideLot] = useState('');
  const [overrideSerial, setOverrideSerial] = useState('');
  const [overrideExpiration, setOverrideExpiration] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Manual entry input ref for focus management
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Load locations and catalog items
  useEffect(() => {
    if (token) {
      getLocations(token)
        .then(result => setLocations(result.locations))
        .catch(err => setError(err.message));
      getCatalogItems(token)
        .then(result => setCatalogItems(result.items))
        .catch(() => {});
    }
  }, [token]);

  // Load case context when caseId param present
  useEffect(() => {
    if (token && caseIdParam) {
      setCaseLoading(true);
      setCaseError('');
      getCase(token, caseIdParam)
        .then(result => setCaseContext(result.case))
        .catch(() => setCaseError('Case not found'))
        .finally(() => setCaseLoading(false));
    }
  }, [token, caseIdParam]);

  // Keyboard: Esc clears current scan result
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lastResult) {
        clearLastResult();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lastResult, clearLastResult]);

  // Clear duplicate warning after 5 seconds
  useEffect(() => {
    if (duplicateWarning) {
      const timer = setTimeout(() => setDuplicateWarning(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [duplicateWarning]);

  const openOverride = () => {
    setShowOverride(true);
    if (lastResult?.gs1Data) {
      if (lastResult.gs1Data.lot) setOverrideLot(lastResult.gs1Data.lot);
      if (lastResult.gs1Data.serial) setOverrideSerial(lastResult.gs1Data.serial);
      if (lastResult.gs1Data.expiration) {
        setOverrideExpiration(lastResult.gs1Data.expiration.split('T')[0]);
      }
    }
    if (lastResult?.catalogMatch) {
      setOverrideCatalogId(lastResult.catalogMatch.catalogId);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!token || !overrideCatalogId || !overrideReason) return;
    setOverrideSubmitting(true);
    try {
      const data: CreateInventoryItemRequest = {
        catalogId: overrideCatalogId,
        lotNumber: overrideLot || undefined,
        serialNumber: overrideSerial || undefined,
        sterilityExpiresAt: overrideExpiration ? new Date(overrideExpiration).toISOString() : undefined,
        barcode: lastResult?.rawValue,
        barcodeClassification: lastResult?.barcodeClassification || undefined,
        barcodeGtin: lastResult?.gs1Data?.gtin || undefined,
        barcodeParsedLot: lastResult?.gs1Data?.lot || undefined,
        barcodeParsedSerial: lastResult?.gs1Data?.serial || undefined,
        barcodeParsedExpiration: lastResult?.gs1Data?.expiration || undefined,
        attestationReason: overrideReason,
      };
      await createInventoryItem(token, data);
      setLastAction({
        itemName: catalogItems.find(c => c.id === overrideCatalogId)?.name || 'New item',
        lotNumber: overrideLot || null,
        expiresAt: overrideExpiration || null,
        eventType: 'CREATED',
        mode: 'verify',
        timestamp: new Date(),
      });
      setShowOverride(false);
      setOverrideCatalogId('');
      setOverrideLot('');
      setOverrideSerial('');
      setOverrideExpiration('');
      setOverrideReason('');
      clearLastResult();
    } catch (err) {
      const { message, requestId } = friendlyError(err);
      setError(message);
      setErrorRequestId(requestId);
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      manualScan(manualBarcode.trim());
      setManualBarcode('');
      setShowManualEntry(false);
    }
  };

  const handleCheckInAction = async () => {
    if (!token || !lastResult?.item || submitting) return;

    const itemId = lastResult.item.id;
    const eventType = EVENT_TYPE_MAP[mode];

    // Duplicate detection: same item + event type within 5 seconds
    const now = Date.now();
    if (lastSubmitRef.current &&
        lastSubmitRef.current.itemId === itemId &&
        lastSubmitRef.current.eventType === eventType &&
        now - lastSubmitRef.current.ts < 5000) {
      setDuplicateWarning(`Duplicate scan — ${lastResult.item.catalogName || 'Item'} was already ${MODE_LABELS[mode].past} moments ago.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setErrorRequestId(undefined);
    setDuplicateWarning('');

    try {
      // LAW COMPLIANCE: User must explicitly confirm to create inventory events.
      // deviceEventId links the verification to the original scan for audit trail.
      const eventData: {
        inventoryItemId: string;
        eventType: string;
        caseId?: string;
        locationId?: string;
        sterilityStatus?: string;
        notes?: string;
        deviceEventId?: string;
      } = {
        inventoryItemId: itemId,
        eventType,
        deviceEventId: lastResult.deviceEventId || undefined,
      };

      // Pass case context if scoped to a case
      if (caseIdParam && caseContext) {
        eventData.caseId = caseIdParam;
      }

      if (mode === 'receive' || mode === 'location_change') {
        if (selectedLocationId) {
          eventData.locationId = selectedLocationId;
        }
        if (mode === 'receive') {
          eventData.sterilityStatus = sterilityStatus;
        }
      }

      if (notes.trim()) {
        let fullNotes = notes.trim();
        if (loanerReference || vendorName) {
          const refs = [];
          if (vendorName) refs.push(`Vendor: ${vendorName}`);
          if (loanerReference) refs.push(`Ref: ${loanerReference}`);
          fullNotes = `${refs.join(', ')}. ${fullNotes}`;
        }
        eventData.notes = fullNotes;
      } else if (loanerReference || vendorName) {
        const refs = [];
        if (vendorName) refs.push(`Vendor: ${vendorName}`);
        if (loanerReference) refs.push(`Ref: ${loanerReference}`);
        eventData.notes = refs.join(', ');
      }

      await createInventoryEvent(token, eventData);

      // Track for duplicate detection
      lastSubmitRef.current = { itemId, eventType, ts: Date.now() };

      // Capture feedback before clearing
      setLastAction({
        itemName: lastResult.item.catalogName || 'Item',
        lotNumber: lastResult.item.lotNumber,
        expiresAt: lastResult.item.sterilityExpiresAt,
        eventType,
        mode,
        timestamp: new Date(),
      });

      clearLastResult();
      setNotes('');
      setLoanerReference('');
      setVendorName('');

      // Refocus for next scan
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
    } catch (err) {
      const { message, requestId } = friendlyError(err);
      setError(message);
      setErrorRequestId(requestId);
    } finally {
      setSubmitting(false);
    }
  };

  // Check access — capability-based
  const hasAccess = hasCapability('INVENTORY_CHECKIN') || hasCapability('INVENTORY_MANAGE');

  const pageTitle = caseContext
    ? `Check-In — Case ${caseContext.caseNumber}`
    : 'Inventory Check-In';

  const breadcrumbItems = [
    { label: 'Admin', href: '/admin' },
    { label: 'Inventory', href: '/admin/inventory' },
    { label: 'Check-In', href: '/admin/inventory/check-in' },
    ...(caseContext ? [{ label: `Case ${caseContext.caseNumber}` }] : []),
  ];

  if (!hasAccess) {
    return (
      <>
        <Header title="Inventory Check-In" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. You don&apos;t have permission for inventory check-in.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title={pageTitle} />

      <main className="container check-in-page">
        <Breadcrumbs items={breadcrumbItems} />

        {/* Case Context Panel */}
        {caseIdParam && (
          <div className="case-context">
            {caseLoading && <p style={{ color: '#718096' }}>Loading case...</p>}
            {caseError && (
              <div className="case-context-error">
                <p><strong>Case not found</strong></p>
                <p>The linked case could not be loaded. You can continue with a general check-in.</p>
                <button className="btn btn-secondary btn-sm" onClick={() => router.push('/admin/inventory/check-in')}>
                  General Check-In
                </button>
              </div>
            )}
            {caseContext && (
              <div className="case-context-details">
                <div className="case-context-header">
                  <strong>Case {caseContext.caseNumber}</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => router.push(`/calendar?openCase=${caseIdParam}`)}
                  >
                    Back to Case
                  </button>
                </div>
                <div className="case-context-meta">
                  <span>{caseContext.procedureName}</span>
                  <span>Surgeon: {caseContext.surgeonName}</span>
                  {caseContext.scheduledDate && (
                    <span>
                      {new Date(caseContext.scheduledDate).toLocaleDateString()}
                      {caseContext.scheduledTime && ` at ${caseContext.scheduledTime}`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" onClick={() => { setError(''); setErrorRequestId(undefined); }}>
            {error}
            {errorRequestId && (
              <span className="request-id">requestId: {errorRequestId}</span>
            )}
          </div>
        )}

        {/* Duplicate warning */}
        {duplicateWarning && (
          <div className="alert alert-warning" onClick={() => setDuplicateWarning('')}>
            {duplicateWarning}
          </div>
        )}

        {/* Last Action feedback */}
        {lastAction && !lastResult && (
          <div className="last-action">
            <div className="last-action-header">
              <span className="last-action-badge">{MODE_LABELS[lastAction.mode]?.past.toUpperCase() || lastAction.eventType}</span>
              <button className="close-btn" onClick={() => setLastAction(null)}>&times;</button>
            </div>
            <div className="last-action-details">
              <strong>{lastAction.itemName}</strong>
              <span className="last-action-meta">
                {lastAction.lotNumber && <>Lot: {lastAction.lotNumber}</>}
                {lastAction.lotNumber && lastAction.expiresAt && <> · </>}
                {lastAction.expiresAt && <>Exp: {new Date(lastAction.expiresAt).toLocaleDateString()}</>}
              </span>
              <span className="last-action-time">{lastAction.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
        )}

        {/* Mode Selector */}
        <div className="mode-selector">
          <button
            className={`mode-btn ${mode === 'verify' ? 'active' : ''}`}
            onClick={() => setMode('verify')}
          >
            Verify Item
          </button>
          <button
            className={`mode-btn ${mode === 'receive' ? 'active' : ''}`}
            onClick={() => setMode('receive')}
          >
            Receive Item
          </button>
          <button
            className={`mode-btn ${mode === 'location_change' ? 'active' : ''}`}
            onClick={() => setMode('location_change')}
          >
            Move Location
          </button>
        </div>

        {/* Scanner Status / Empty State */}
        {!lastResult && (
          <div className="scanner-status">
            <div className={`scanner-indicator ${isCapturing ? 'capturing' : isProcessing ? 'processing' : 'ready'}`}>
              {isCapturing ? 'Scanning...' : isProcessing ? 'Processing...' : 'Ready to Scan'}
            </div>
            {!isCapturing && !isProcessing && (
              <p className="scanner-empty">Scan an item to begin</p>
            )}
            <p className="scanner-hint">
              Scan a barcode with your USB scanner, or{' '}
              <button className="link-btn" onClick={() => setShowManualEntry(!showManualEntry)}>
                enter manually
              </button>
            </p>
          </div>
        )}

        {/* Manual Entry Form */}
        {showManualEntry && (
          <form className="manual-entry" onSubmit={handleManualSubmit}>
            <input
              ref={manualInputRef}
              type="text"
              value={manualBarcode}
              onChange={e => setManualBarcode(e.target.value)}
              placeholder="Enter barcode or serial number"
              autoFocus
            />
            <button type="submit" className="btn btn-primary">Lookup</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowManualEntry(false)}>Cancel</button>
          </form>
        )}

        {/* Scan Result */}
        {lastResult && (
          <div className={`scan-result ${lastResult.processed ? 'found' : 'not-found'}`}>
            <div className="scan-result-header">
              <span className="scanned-value">{lastResult.rawValue}</span>
              <button className="close-btn" onClick={clearLastResult}>&times;</button>
            </div>

            {lastResult.processed && lastResult.item ? (
              <div className="item-details">
                <div className="item-name">{lastResult.item.catalogName}</div>
                <div className="item-meta">
                  <span className="meta-item">
                    <strong>Category:</strong> {lastResult.item.category}
                  </span>
                  <span className="meta-item">
                    <strong>Location:</strong> {lastResult.item.locationName || 'Not assigned'}
                  </span>
                  <span className="meta-item">
                    <strong>Sterility:</strong> {lastResult.item.sterilityStatus}
                    {lastResult.item.sterilityExpiresAt && (
                      <> (expires {new Date(lastResult.item.sterilityExpiresAt).toLocaleDateString()})</>
                    )}
                  </span>
                  <span className="meta-item">
                    <strong>Status:</strong>{' '}
                    <span className={`status-badge status-${lastResult.item.availabilityStatus.toLowerCase()}`}>
                      {lastResult.item.availabilityStatus}
                    </span>
                  </span>
                  {lastResult.item.lastVerifiedAt && (
                    <span className="meta-item">
                      <strong>Last Verified:</strong>{' '}
                      {new Date(lastResult.item.lastVerifiedAt).toLocaleString()}
                      {lastResult.item.lastVerifiedByName && ` by ${lastResult.item.lastVerifiedByName}`}
                    </span>
                  )}
                </div>

                {/* Action Form */}
                <div className="action-form">
                  {(mode === 'receive' || mode === 'location_change') && (
                    <div className="form-group">
                      <label>Location</label>
                      <select
                        value={selectedLocationId}
                        onChange={e => setSelectedLocationId(e.target.value)}
                      >
                        <option value="">Select location...</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {mode === 'receive' && (
                    <>
                      <div className="form-group">
                        <label>Sterility Status</label>
                        <select
                          value={sterilityStatus}
                          onChange={e => setSterilityStatus(e.target.value)}
                        >
                          {STERILITY_STATUSES.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>

                      {/* Loaner Reference Fields (Optional) */}
                      <div className="form-row">
                        <div className="form-group">
                          <label>Vendor Name (optional)</label>
                          <input
                            type="text"
                            value={vendorName}
                            onChange={e => setVendorName(e.target.value)}
                            placeholder="e.g., Stryker, Medtronic"
                          />
                        </div>
                        <div className="form-group">
                          <label>Packing Slip / Reference (optional)</label>
                          <input
                            type="text"
                            value={loanerReference}
                            onChange={e => setLoanerReference(e.target.value)}
                            placeholder="e.g., PS-12345"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add notes..."
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleCheckInAction}
                      disabled={submitting}
                    >
                      {submitting ? 'Processing...' : MODE_LABELS[mode].button}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="not-found-message">
                <p><strong>Item not found in inventory</strong></p>
                <p>{lastResult.error || 'No matching barcode or serial number'}</p>

                {/* GS1 Parsed Data Display */}
                {lastResult.gs1Data && (
                  <div className="gs1-data">
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Parsed Barcode Data:</p>
                    <div className="gs1-fields">
                      {lastResult.gs1Data.gtin && <span><strong>GTIN:</strong> {lastResult.gs1Data.gtin}</span>}
                      {lastResult.gs1Data.lot && <span><strong>Lot:</strong> {lastResult.gs1Data.lot}</span>}
                      {lastResult.gs1Data.serial && <span><strong>Serial:</strong> {lastResult.gs1Data.serial}</span>}
                      {lastResult.gs1Data.expiration && <span><strong>Exp:</strong> {new Date(lastResult.gs1Data.expiration).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}

                {/* Catalog Match */}
                {lastResult.catalogMatch && (
                  <div className="catalog-match">
                    <p>Catalog match: <strong>{lastResult.catalogMatch.catalogName}</strong></p>
                    <button className="btn btn-primary" onClick={openOverride} style={{ marginTop: '0.5rem' }}>
                      Create Inventory Item
                    </button>
                  </div>
                )}

                {/* Manual Override Button */}
                {!lastResult.catalogMatch && (
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn btn-secondary" onClick={openOverride}>
                      Manual Override
                    </button>
                    <p className="hint" style={{ marginTop: '0.5rem' }}>
                      Use when barcode is damaged, missing, or pre-UDI.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual Override Modal */}
        {showOverride && (
          <div className="override-modal">
            <h3>Manual Override — Create Inventory Item</h3>
            <div className="form-group">
              <label>Catalog Item *</label>
              <select value={overrideCatalogId} onChange={e => setOverrideCatalogId(e.target.value)} required>
                <option value="">Select catalog item...</option>
                {catalogItems.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Lot Number *</label>
                <input type="text" value={overrideLot} onChange={e => setOverrideLot(e.target.value)} placeholder="Lot number" />
              </div>
              <div className="form-group">
                <label>Expiration Date *</label>
                <input type="date" value={overrideExpiration} onChange={e => setOverrideExpiration(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Serial Number (optional)</label>
              <input type="text" value={overrideSerial} onChange={e => setOverrideSerial(e.target.value)} placeholder="Serial number" />
            </div>
            <div className="form-group">
              <label>Override Reason *</label>
              <select value={overrideReason} onChange={e => setOverrideReason(e.target.value)} required>
                <option value="">Select reason...</option>
                <option value="Barcode Damaged">Barcode Damaged</option>
                <option value="Barcode Missing">Barcode Missing</option>
                <option value="Pre-UDI Device">Pre-UDI Device</option>
                <option value="Emergency Use">Emergency Use</option>
              </select>
            </div>
            <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleOverrideSubmit}
                disabled={!overrideCatalogId || !overrideReason || overrideSubmitting}
              >
                {overrideSubmitting ? 'Creating...' : 'Create Item'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowOverride(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Scan History */}
        {scanHistory.length > 0 && (
          <div className="scan-history">
            <div className="history-header">
              <h3>Recent Scans</h3>
              <button className="btn btn-secondary btn-sm" onClick={clearHistory}>Clear</button>
            </div>
            <div className="history-list">
              {scanHistory.slice(0, 10).map((scan, index) => (
                <div
                  key={`${scan.rawValue}-${scan.timestamp.getTime()}`}
                  className={`history-item ${scan.processed ? 'processed' : 'unprocessed'}`}
                >
                  <span className="history-value">{scan.rawValue}</span>
                  <span className="history-status">
                    {scan.processed ? scan.item?.catalogName || 'Found' : 'Not Found'}
                  </span>
                  <span className="history-time">
                    {scan.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .check-in-page {
          padding: 2rem 0;
          max-width: 800px;
        }

        .case-context {
          background: #ebf8ff;
          border: 1px solid #bee3f8;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .case-context-error {
          text-align: center;
        }

        .case-context-error p {
          margin: 0.25rem 0;
          color: #4a5568;
        }

        .case-context-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .case-context-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.875rem;
          color: #4a5568;
        }

        .request-id {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #a0aec0;
          font-family: monospace;
        }

        .alert-warning {
          background: #fefcbf;
          border: 1px solid #f6e05e;
          color: #975a16;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          cursor: pointer;
        }

        .last-action {
          background: #f0fff4;
          border: 1px solid #9ae6b4;
          border-left: 4px solid #48bb78;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .last-action-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .last-action-badge {
          background: #48bb78;
          color: white;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .last-action-details {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: baseline;
        }

        .last-action-meta {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .last-action-time {
          font-size: 0.75rem;
          color: #a0aec0;
        }

        .scanner-empty {
          font-size: 1.125rem;
          color: #4a5568;
          margin: 0.5rem 0;
        }

        .mode-selector {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: #f7fafc;
          padding: 0.5rem;
          border-radius: 8px;
        }

        .mode-btn {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-btn:hover {
          background: #e2e8f0;
        }

        .mode-btn.active {
          background: #3182ce;
          color: white;
        }

        .scanner-status {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .scanner-indicator {
          display: inline-block;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .scanner-indicator.ready {
          background: #c6f6d5;
          color: #276749;
        }

        .scanner-indicator.capturing {
          background: #feebc8;
          color: #c05621;
          animation: pulse 1s infinite;
        }

        .scanner-indicator.processing {
          background: #bee3f8;
          color: #2b6cb0;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .scanner-hint {
          color: #718096;
          font-size: 0.875rem;
        }

        .link-btn {
          background: none;
          border: none;
          color: #3182ce;
          cursor: pointer;
          text-decoration: underline;
          font-size: inherit;
          padding: 0;
        }

        .manual-entry {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: #f7fafc;
          padding: 1rem;
          border-radius: 8px;
        }

        .manual-entry input {
          flex: 1;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .scan-result {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 1.5rem;
          border-left: 4px solid;
        }

        .scan-result.found {
          border-left-color: #48bb78;
        }

        .scan-result.not-found {
          border-left-color: #fc8181;
        }

        .scan-result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .scanned-value {
          font-family: monospace;
          font-size: 1.125rem;
          background: #f7fafc;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #a0aec0;
          cursor: pointer;
        }

        .item-details {
          border-top: 1px solid #e2e8f0;
          padding-top: 1rem;
        }

        .item-name {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .item-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .meta-item {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .status-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-available { background: #c6f6d5; color: #276749; }
        .status-reserved { background: #feebc8; color: #c05621; }
        .status-in_use { background: #bee3f8; color: #2b6cb0; }
        .status-unavailable { background: #fed7d7; color: #c53030; }

        .action-form {
          background: #f7fafc;
          padding: 1rem;
          border-radius: 8px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-actions {
          margin-top: 1rem;
        }

        .btn-lg {
          padding: 0.75rem 2rem;
          font-size: 1.125rem;
        }

        .not-found-message {
          text-align: center;
          padding: 1rem;
        }

        .not-found-message p {
          margin: 0.5rem 0;
        }

        .not-found-message .hint {
          color: #718096;
          font-size: 0.875rem;
        }

        .scan-history {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .history-header h3 {
          margin: 0;
          font-size: 1rem;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .history-item.processed {
          background: #f0fff4;
        }

        .history-item.unprocessed {
          background: #fff5f5;
        }

        .history-value {
          font-family: monospace;
          flex: 1;
        }

        .history-status {
          color: #718096;
        }

        .history-time {
          color: #a0aec0;
          font-size: 0.75rem;
        }

        .alert-success {
          background: #c6f6d5;
          border: 1px solid #9ae6b4;
          color: #276749;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .alert-error {
          background: #fed7d7;
          border: 1px solid #feb2b2;
          color: #c53030;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          cursor: pointer;
        }

        .gs1-data {
          background: #ebf8ff;
          border: 1px solid #bee3f8;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          text-align: left;
        }

        .gs1-fields {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.875rem;
        }

        .catalog-match {
          background: #f0fff4;
          border: 1px solid #9ae6b4;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
        }

        .override-modal {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 1.5rem;
          border-left: 4px solid #ed8936;
        }

        .override-modal h3 {
          margin: 0 0 1rem 0;
          color: #c05621;
        }
      `}</style>
    </>
  );
}
