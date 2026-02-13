'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getInventoryItems,
  createInventoryEvent,
  lookupInventoryItem,
  type InventoryItem,
  type LookupItemSummary,
  type LookupResult,
  type LookupSource,
} from '@/lib/api/inventory';
import { getLocations, type Location } from '@/lib/api/settings';

/**
 * Phase 7.3 — Inventory Missing Workflow
 *
 * Primary: Scan/paste barcode → resolve → Mark Missing (structured adjustment).
 * Secondary (table): view MISSING items, Mark Found per-row.
 * Fallback: Manual Item ID entry for edge cases.
 *
 * All transitions are append-only events — no direct item mutation.
 */

const COMMON_REASONS = [
  'Not found during cycle count',
  'Not in expected location',
  'Reported missing by staff',
  'Post-case reconciliation discrepancy',
  'Transfer not received',
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Recent scan entry for the debugging list
interface RecentScan {
  id: number;
  scannedValue: string;
  resolvedName: string | null;
  status: 'resolved' | 'multiple' | 'not_found';
  item?: LookupItemSummary;
}

let scanIdCounter = 0;

export default function InventoryMissingPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ── Scan-to-Mark-Missing state ──
  const [scanValue, setScanValue] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [resolvedItem, setResolvedItem] = useState<LookupItemSummary | null>(null);
  const [matchSource, setMatchSource] = useState<LookupSource | null>(null);
  const [matchCapped, setMatchCapped] = useState(false);
  const [scanReason, setScanReason] = useState('');
  const [scanReasonOther, setScanReasonOther] = useState('');
  const [scanNote, setScanNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  // Disambiguation modal
  const [disambiguateItems, setDisambiguateItems] = useState<LookupItemSummary[]>([]);

  // ── Manual fallback state ──
  const [showManual, setShowManual] = useState(false);
  const [markMissingItemId, setMarkMissingItemId] = useState('');
  const [markMissingReason, setMarkMissingReason] = useState('');
  const [isMarkingMissing, setIsMarkingMissing] = useState(false);
  const [markMissingError, setMarkMissingError] = useState('');

  // ── Mark Found modal state ──
  const [foundItem, setFoundItem] = useState<InventoryItem | null>(null);
  const [foundLocationId, setFoundLocationId] = useState('');
  const [foundNote, setFoundNote] = useState('');
  const [isMarkingFound, setIsMarkingFound] = useState(false);

  // ── Data loading ──
  const loadItems = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getInventoryItems(token, { status: 'MISSING' });
      setItems(result.items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load missing items');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const loadLocations = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getLocations(token);
      setLocations(result.locations);
    } catch {
      // Non-critical
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      loadItems();
      loadLocations();
    }
  }, [token, user, loadItems, loadLocations]);

  // ── Scan lookup handler ──
  const handleLookup = async () => {
    if (!token || !scanValue.trim()) return;
    const code = scanValue.trim();
    setIsLookingUp(true);
    setLookupError('');
    setResolvedItem(null);
    setMatchSource(null);
    setMatchCapped(false);
    setDisambiguateItems([]);

    try {
      const result: LookupResult = await lookupInventoryItem(token, code);

      if (result.match === 'SINGLE') {
        setResolvedItem(result.item);
        setMatchSource(result.source);
        addRecentScan(code, result.item.catalogName, 'resolved', result.item);
      } else if (result.match === 'MULTIPLE') {
        setMatchSource(result.source);
        setMatchCapped(result.capped);
        setDisambiguateItems(result.items);
        addRecentScan(code, null, 'multiple');
      } else {
        setLookupError(`No item found for "${code}"`);
        addRecentScan(code, null, 'not_found');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lookup failed';
      setLookupError(msg);
      addRecentScan(code, null, 'not_found');
    } finally {
      setIsLookingUp(false);
    }
  };

  const addRecentScan = (scannedValue: string, resolvedName: string | null, status: RecentScan['status'], item?: LookupItemSummary) => {
    setRecentScans(prev => [{
      id: ++scanIdCounter,
      scannedValue,
      resolvedName,
      status,
      item,
    }, ...prev].slice(0, 10));
  };

  const handleScanKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup();
    }
  };

  // Disambiguation: user picks one
  const handleDisambiguate = (item: LookupItemSummary) => {
    setResolvedItem(item);
    setDisambiguateItems([]);
    // Update the most recent scan entry
    setRecentScans(prev => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      return [{ ...first, resolvedName: item.catalogName, status: 'resolved' as const, item }, ...rest];
    });
  };

  // Recent scan click → rehydrate
  const handleRecentScanClick = (scan: RecentScan) => {
    setScanValue(scan.scannedValue);
    if (scan.item) {
      setResolvedItem(scan.item);
      setLookupError('');
      setDisambiguateItems([]);
    }
  };

  const effectiveReason = scanReason === 'Other' ? scanReasonOther.trim() : scanReason;

  // ── Submit Mark Missing (scan flow) ──
  const handleScanMarkMissing = async () => {
    if (!token || !resolvedItem || !effectiveReason) return;
    setIsSubmitting(true);
    try {
      await createInventoryEvent(token, {
        inventoryItemId: resolvedItem.inventoryItemId,
        eventType: 'ADJUSTED',
        adjustment: { availabilityStatus: 'MISSING' },
        reason: effectiveReason,
        notes: scanNote.trim() || undefined,
      });
      setResolvedItem(null);
      setMatchSource(null);
      setScanValue('');
      setScanReason('');
      setScanReasonOther('');
      setScanNote('');
      setSuccessMessage('Item marked as MISSING.');
      setTimeout(() => setSuccessMessage(''), 4000);
      await loadItems();
      // Re-focus scan input for next scan
      scanInputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark item as missing');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit Mark Missing (manual fallback) ──
  const handleManualMarkMissing = async () => {
    if (!token || !markMissingItemId.trim() || !markMissingReason.trim()) return;
    setIsMarkingMissing(true);
    setMarkMissingError('');
    try {
      await createInventoryEvent(token, {
        inventoryItemId: markMissingItemId.trim(),
        eventType: 'ADJUSTED',
        adjustment: { availabilityStatus: 'MISSING' },
        reason: markMissingReason.trim(),
      });
      setMarkMissingItemId('');
      setMarkMissingReason('');
      setSuccessMessage('Item marked as MISSING.');
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadItems();
    } catch (err) {
      setMarkMissingError(err instanceof Error ? err.message : 'Failed to mark item as missing');
    } finally {
      setIsMarkingMissing(false);
    }
  };

  // ── Mark Found ──
  const handleMarkFound = async () => {
    if (!token || !foundItem) return;
    setIsMarkingFound(true);
    try {
      await createInventoryEvent(token, {
        inventoryItemId: foundItem.id,
        eventType: 'ADJUSTED',
        adjustment: { availabilityStatus: 'AVAILABLE' },
        locationId: foundLocationId || undefined,
        notes: foundNote.trim() || undefined,
      });
      setFoundItem(null);
      setFoundLocationId('');
      setFoundNote('');
      setSuccessMessage('Item marked as FOUND and returned to AVAILABLE.');
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark item as found');
    } finally {
      setIsMarkingFound(false);
    }
  };

  // ── Auth guards ──
  if (!user || !token) {
    return (
      <>
        <Header title="Missing Inventory" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Missing Inventory" />
        <div className="p-6">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Missing Inventory" />
      <div className="p-6 max-w-[1200px] mx-auto">
        <button
          className="btn btn-secondary btn-sm mb-4"
          onClick={() => router.push('/admin/inventory')}
        >
          &larr; Back to Inventory
        </button>

        {error && <div className="alert alert-error mb-4">{error}</div>}
        {successMessage && <div className="alert alert-success mb-4">{successMessage}</div>}

        {/* ════════════ Scan to Mark Missing ════════════ */}
        <div className="bg-surface-primary rounded-lg border border-border p-5 mb-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">Scan to Mark Missing</h3>
          <p className="text-xs text-text-muted mb-4">
            Scan or paste a barcode, UDI, serial number, or lot number to look up an item.
          </p>

          {/* Scan input */}
          <div className="flex gap-3 items-end mb-4">
            <div className="form-group flex-1" style={{ marginBottom: 0 }}>
              <label>Scan / Enter Barcode (UDI / GS1 / Serial / Lot)</label>
              <input
                ref={scanInputRef}
                type="text"
                autoFocus
                placeholder="Scan or paste identifier..."
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={handleScanKeyDown}
                className="!text-base !py-2.5"
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={!scanValue.trim() || isLookingUp}
              onClick={handleLookup}
            >
              {isLookingUp ? 'Looking up...' : 'Lookup'}
            </button>
          </div>

          {lookupError && (
            <div className="text-sm text-[var(--color-red)] mb-4">{lookupError}</div>
          )}

          {/* Resolved item card */}
          {resolvedItem && (
            <div className="border border-border rounded-lg p-4 mb-4 bg-surface-secondary">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{resolvedItem.catalogName}</div>
                  <div className="text-xs text-text-muted font-mono mt-0.5">{resolvedItem.inventoryItemId}</div>
                  {matchSource && (
                    <div className="text-xs text-accent mt-0.5">
                      Matched via {matchSource === 'BARCODE' ? 'Barcode' : matchSource === 'SERIAL' ? 'Serial' : matchSource === 'GS1' ? 'UDI (GS1)' : 'Lot'}
                    </div>
                  )}
                </div>
                <button
                  className="text-xs text-text-muted hover:text-text-primary"
                  onClick={() => setResolvedItem(null)}
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-4">
                {resolvedItem.barcode && (
                  <>
                    <span className="text-text-muted">Barcode / UDI</span>
                    <span className="text-text-primary font-mono">{resolvedItem.barcode}</span>
                  </>
                )}
                {resolvedItem.lotNumber && (
                  <>
                    <span className="text-text-muted">Lot</span>
                    <span className="text-text-primary">{resolvedItem.lotNumber}</span>
                  </>
                )}
                {resolvedItem.serialNumber && (
                  <>
                    <span className="text-text-muted">Serial</span>
                    <span className="text-text-primary">{resolvedItem.serialNumber}</span>
                  </>
                )}
                <span className="text-text-muted">Status</span>
                <span className="text-text-primary font-medium">{resolvedItem.availabilityStatus}</span>
                <span className="text-text-muted">Location</span>
                <span className="text-text-primary">{resolvedItem.locationName || '—'}</span>
                {resolvedItem.caseLink.hasCase && (
                  <>
                    <span className="text-text-muted">Reserved Case</span>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]">
                      Reserved
                    </span>
                  </>
                )}
              </div>

              {/* Reason + note + submit */}
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
                    <label>Reason (required)</label>
                    <select
                      value={scanReason}
                      onChange={(e) => setScanReason(e.target.value)}
                    >
                      <option value="">— Select reason —</option>
                      {COMMON_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      <option value="Other">Other (type below)</option>
                    </select>
                  </div>
                  {scanReason === 'Other' && (
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
                      <label>Custom Reason</label>
                      <input
                        type="text"
                        placeholder="Describe reason..."
                        value={scanReasonOther}
                        onChange={(e) => setScanReasonOther(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                    <label>Note (optional)</label>
                    <input
                      type="text"
                      placeholder="Additional context..."
                      value={scanNote}
                      onChange={(e) => setScanNote(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  disabled={!effectiveReason || isSubmitting}
                  onClick={handleScanMarkMissing}
                >
                  {isSubmitting ? 'Marking...' : 'Mark Missing'}
                </button>
              </div>
            </div>
          )}

          {/* Recent scans */}
          {recentScans.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Recent Scans</h4>
              <div className="space-y-1">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded text-xs hover:bg-surface-secondary transition-colors"
                    onClick={() => handleRecentScanClick(scan)}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      scan.status === 'resolved'
                        ? 'bg-[var(--color-green)]'
                        : scan.status === 'multiple'
                          ? 'bg-[var(--color-orange)]'
                          : 'bg-[var(--color-red)]'
                    }`} />
                    <span className="font-mono text-text-secondary truncate max-w-[200px]">{scan.scannedValue}</span>
                    <span className="text-text-muted truncate">
                      {scan.status === 'resolved'
                        ? scan.resolvedName
                        : scan.status === 'multiple'
                          ? 'Multiple matches'
                          : 'Not found'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ════════════ Missing Items Table ════════════ */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border flex justify-between items-center">
            <h3 className="text-sm font-semibold text-text-primary">
              Missing Items ({items.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading missing items...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No items are currently marked as missing.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Item</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Barcode / Serial</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Last Location</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary">Reserved Case</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-secondary whitespace-nowrap">Last Verified</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-secondary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-border hover:bg-surface-secondary">
                      <td className="py-3 px-4 text-text-primary text-xs font-medium max-w-[200px] truncate">
                        {item.catalogName}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                        {item.barcode || item.serialNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-secondary">
                        {item.locationName || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {item.caseLink.hasCase ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-orange-bg)] text-[var(--color-orange-700)]">
                            Reserved
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-muted whitespace-nowrap">
                        {formatDate(item.lastVerifiedAt)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => {
                            setFoundItem(item);
                            setFoundLocationId(item.locationId || '');
                            setFoundNote('');
                          }}
                        >
                          Mark Found
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ════════════ Advanced / Manual (Item ID) ════════════ */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          <button
            className="w-full px-4 py-3 flex justify-between items-center text-left hover:bg-surface-secondary transition-colors"
            onClick={() => setShowManual(!showManual)}
          >
            <h3 className="text-sm font-semibold text-text-secondary">
              Advanced / Manual (Item ID)
            </h3>
            <span className="text-text-muted text-xs">{showManual ? 'Hide' : 'Show'}</span>
          </button>
          {showManual && (
            <div className="px-4 pb-4">
              <p className="text-xs text-text-muted mb-3">
                Use this if you have the inventory item UUID and the barcode scanner didn&apos;t resolve it.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
                  <label>Item ID</label>
                  <input
                    type="text"
                    placeholder="Paste inventory item ID..."
                    value={markMissingItemId}
                    onChange={(e) => setMarkMissingItemId(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
                  <label>Reason (required)</label>
                  <input
                    type="text"
                    placeholder="e.g. Not found during cycle count"
                    value={markMissingReason}
                    onChange={(e) => setMarkMissingReason(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!markMissingItemId.trim() || !markMissingReason.trim() || isMarkingMissing}
                  onClick={handleManualMarkMissing}
                >
                  {isMarkingMissing ? 'Marking...' : 'Mark Missing'}
                </button>
              </div>
              {markMissingError && (
                <div className="text-xs text-[var(--color-red)] mt-2">{markMissingError}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════ Mark Found Modal ════════════ */}
      {foundItem && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[450px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Mark Item Found</h2>
              <button
                className="text-text-muted hover:text-text-primary text-xl"
                onClick={() => setFoundItem(null)}
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-text-secondary">
                Marking <strong>{foundItem.catalogName}</strong> as found.
                This will set availability back to AVAILABLE.
              </div>
              <div className="form-group">
                <label>Return to Location (optional)</label>
                <select
                  value={foundLocationId}
                  onChange={(e) => setFoundLocationId(e.target.value)}
                >
                  <option value="">— Keep current —</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Found in OR-2 cabinet"
                  value={foundNote}
                  onChange={(e) => setFoundNote(e.target.value)}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button className="btn btn-secondary" onClick={() => setFoundItem(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleMarkFound}
                  disabled={isMarkingFound}
                >
                  {isMarkingFound ? 'Marking...' : 'Confirm Found'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ Disambiguation Modal ════════════ */}
      {disambiguateItems.length > 0 && (
        <div className="modal-overlay">
          <div className="bg-surface-primary rounded-lg shadow-[0_4px_20px_var(--shadow-md)] w-full max-w-[700px]">
            <div className="flex justify-between items-center py-4 px-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">
                Multiple Matches ({disambiguateItems.length})
              </h2>
              <button
                className="text-text-muted hover:text-text-primary text-xl"
                onClick={() => setDisambiguateItems([])}
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {matchSource && (
                <p className="text-xs text-accent mb-1">
                  Matched via {matchSource === 'BARCODE' ? 'Barcode' : matchSource === 'SERIAL' ? 'Serial' : matchSource === 'GS1' ? 'UDI (GS1)' : 'Lot'}
                </p>
              )}
              <p className="text-xs text-text-muted mb-2">
                The scanned value matched multiple items. Select the correct one.
              </p>
              {matchCapped && (
                <div className="alert alert-warning mb-3 !text-xs !py-2">
                  Showing first 20 matches. Refine by serial, scan GS1, or use a more specific code.
                  {matchSource === 'LOT' && ' Lot numbers often match multiple items — scanning the UDI label will narrow it.'}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="text-left py-2 px-3 font-semibold text-text-secondary">Item</th>
                      <th className="text-left py-2 px-3 font-semibold text-text-secondary">Lot</th>
                      <th className="text-left py-2 px-3 font-semibold text-text-secondary">Serial</th>
                      <th className="text-left py-2 px-3 font-semibold text-text-secondary">Location</th>
                      <th className="text-left py-2 px-3 font-semibold text-text-secondary">Status</th>
                      <th className="text-center py-2 px-3 font-semibold text-text-secondary">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disambiguateItems.map((item) => (
                      <tr
                        key={item.inventoryItemId}
                        className="border-t border-border hover:bg-surface-secondary cursor-pointer"
                        onClick={() => handleDisambiguate(item)}
                      >
                        <td className="py-2 px-3 text-text-primary font-medium max-w-[180px] truncate">
                          {item.catalogName}
                        </td>
                        <td className="py-2 px-3 text-text-secondary font-mono">
                          {item.lotNumber || '—'}
                        </td>
                        <td className="py-2 px-3 text-text-secondary font-mono">
                          {item.serialNumber || '—'}
                        </td>
                        <td className="py-2 px-3 text-text-secondary">
                          {item.locationName || '—'}
                        </td>
                        <td className="py-2 px-3 text-text-secondary">
                          {item.availabilityStatus}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => { e.stopPropagation(); handleDisambiguate(item); }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <button className="btn btn-secondary" onClick={() => setDisambiguateItems([])}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
