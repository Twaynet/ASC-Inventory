'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getOpenMissingAging,
  createInventoryEvent,
  type OpenMissingAgingItem,
  type OpenMissingAgingResponse,
} from '@/lib/api/inventory';
import { getLocations, type Location } from '@/lib/api/settings';

/**
 * Phase 8.1C / 8.2C — Open Missing Aging Report
 *
 * Shows all currently-MISSING inventory items with aging metrics.
 * Includes inline "Mark Found" action per item.
 */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function agingColor(days: number): string {
  if (days > 30) return 'bg-[var(--color-red)] text-white';
  if (days > 7) return 'bg-[var(--color-yellow)] text-black';
  return 'bg-surface-secondary text-text-primary';
}

export default function OpenMissingAgingPage() {
  const { token } = useAuth();
  const { hasRole } = useAccessControl();

  const [data, setData] = useState<OpenMissingAgingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Locations for Mark Found modal
  const [locations, setLocations] = useState<Location[]>([]);

  // Mark Found modal state
  const [foundItem, setFoundItem] = useState<OpenMissingAgingItem | null>(null);
  const [foundLocationId, setFoundLocationId] = useState('');
  const [foundNote, setFoundNote] = useState('');
  const [isMarkingFound, setIsMarkingFound] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOpenMissingAging(token);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load aging data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadLocations = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getLocations(token);
      setLocations(result.locations);
    } catch {
      // Non-critical — location select will just be empty
    }
  }, [token]);

  useEffect(() => {
    loadData();
    loadLocations();
  }, [loadData, loadLocations]);

  const handleMarkFound = async () => {
    if (!token || !foundItem) return;
    setIsMarkingFound(true);
    try {
      await createInventoryEvent(token, {
        inventoryItemId: foundItem.inventoryItemId,
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
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark item as found');
    } finally {
      setIsMarkingFound(false);
    }
  };

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Open Missing Aging" />
        <main className="p-6">
          <div className="alert alert-error">You do not have permission to view this page.</div>
        </main>
      </>
    );
  }

  const maxDays = data && data.items.length > 0
    ? Math.max(...data.items.map(i => i.daysMissing))
    : 0;

  return (
    <>
      <Header title="Open Missing Aging Report" />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {loading && (
          <div className="text-center py-12 text-text-muted">Loading aging report...</div>
        )}

        {data && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Total Open Missing</div>
                <div className="text-2xl font-bold text-[var(--color-red)]">{data.total}</div>
              </div>
              <div className="bg-surface-primary rounded-lg border border-border p-4">
                <div className="text-text-muted text-xs uppercase tracking-wide mb-1">Oldest Missing</div>
                <div className="text-2xl font-bold text-text-primary">
                  {maxDays > 0 ? `${maxDays} day${maxDays !== 1 ? 's' : ''}` : '—'}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="text-left p-3 font-medium text-text-secondary">Item</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Lot / Serial</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Location</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Missing Since</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Days Missing</th>
                      <th className="text-left p-3 font-medium text-text-secondary">Last Staff</th>
                      <th className="text-center p-3 font-medium text-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-text-muted">
                          No items currently missing.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item: OpenMissingAgingItem) => (
                        <tr key={item.inventoryItemId} className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
                          <td className="p-3 text-text-primary font-medium">{item.catalogName}</td>
                          <td className="p-3 text-text-secondary text-xs">
                            {item.lotNumber && <div>Lot: {item.lotNumber}</div>}
                            {item.serialNumber && <div>SN: {item.serialNumber}</div>}
                            {!item.lotNumber && !item.serialNumber && '—'}
                          </td>
                          <td className="p-3 text-text-secondary">{item.locationName || '—'}</td>
                          <td className="p-3 text-text-secondary whitespace-nowrap">
                            {formatDate(item.missingSince)}
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${agingColor(item.daysMissing)}`}>
                              {item.daysMissing}d
                            </span>
                          </td>
                          <td className="p-3 text-text-secondary">{item.lastStaffName || '—'}</td>
                          <td className="p-3 text-center">
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => {
                                setFoundItem(item);
                                setFoundLocationId('');
                                setFoundNote('');
                              }}
                            >
                              Mark Found
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Mark Found Modal */}
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
              {foundItem.daysMissing > 30 && (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  This item has been missing for {foundItem.daysMissing} days.
                </div>
              )}
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
    </>
  );
}
