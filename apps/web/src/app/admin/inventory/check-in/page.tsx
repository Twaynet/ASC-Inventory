'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { useScannerService, ScanProcessResult } from '@/lib/useScannerService';
import {
  createInventoryEvent,
  getLocations,
  type Location,
} from '@/lib/api';

type CheckInMode = 'verify' | 'receive' | 'location_change';

const STERILITY_STATUSES = ['STERILE', 'NON_STERILE', 'EXPIRED', 'UNKNOWN'] as const;

export default function InventoryCheckInPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

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
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // Loaner tracking fields (optional reference)
  const [loanerReference, setLoanerReference] = useState('');
  const [vendorName, setVendorName] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Load locations
  useEffect(() => {
    if (token) {
      getLocations(token)
        .then(result => setLocations(result.locations))
        .catch(err => setError(err.message));
    }
  }, [token]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      manualScan(manualBarcode.trim());
      setManualBarcode('');
      setShowManualEntry(false);
    }
  };

  const handleCheckInAction = async () => {
    if (!token || !lastResult?.item) return;

    try {
      // LAW COMPLIANCE: User must explicitly confirm to create inventory events.
      // deviceEventId links the verification to the original scan for audit trail.
      const eventData: {
        inventoryItemId: string;
        eventType: string;
        locationId?: string;
        sterilityStatus?: string;
        notes?: string;
        deviceEventId?: string;
      } = {
        inventoryItemId: lastResult.item.id,
        eventType: mode === 'receive' ? 'RECEIVED' : mode === 'location_change' ? 'LOCATION_CHANGED' : 'VERIFIED',
        deviceEventId: lastResult.deviceEventId || undefined,
      };

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

      setSuccessMessage(`Item ${mode === 'receive' ? 'received' : mode === 'location_change' ? 'moved' : 'verified'} successfully!`);
      clearLastResult();
      setNotes('');
      setLoanerReference('');
      setVendorName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process action');
    }
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  // Check access - ADMIN or INVENTORY_TECH
  const hasAccess = user.role === 'ADMIN' || user.role === 'INVENTORY_TECH';
  if (!hasAccess) {
    return (
      <>
        <Header title="Inventory Check-In" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page requires ADMIN or INVENTORY_TECH role.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Inventory Check-In" />

      <main className="container check-in-page">
        {error && <div className="alert alert-error" onClick={() => setError('')}>{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

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

        {/* Scanner Status */}
        <div className="scanner-status">
          <div className={`scanner-indicator ${isCapturing ? 'capturing' : isProcessing ? 'processing' : 'ready'}`}>
            {isCapturing ? 'Scanning...' : isProcessing ? 'Processing...' : 'Ready to Scan'}
          </div>
          <p className="scanner-hint">
            Scan a barcode with your USB scanner, or{' '}
            <button className="link-btn" onClick={() => setShowManualEntry(!showManualEntry)}>
              enter manually
            </button>
          </p>
        </div>

        {/* Manual Entry Form */}
        {showManualEntry && (
          <form className="manual-entry" onSubmit={handleManualSubmit}>
            <input
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
                    <button className="btn btn-primary btn-lg" onClick={handleCheckInAction}>
                      {mode === 'verify' && 'Confirm Verified'}
                      {mode === 'receive' && 'Receive Item'}
                      {mode === 'location_change' && 'Move Item'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="not-found-message">
                <p><strong>Item not found in inventory</strong></p>
                <p>{lastResult.error || 'No matching barcode or serial number'}</p>
                <p className="hint">
                  If this is a new item, add it first in{' '}
                  <button className="link-btn" onClick={() => router.push('/admin/inventory')}>
                    Inventory Management
                  </button>
                </p>
              </div>
            )}
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
      `}</style>
    </>
  );
}
