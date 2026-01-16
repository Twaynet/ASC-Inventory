'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useScanner, type ScanResult } from '@/lib/useScanner';
import {
  getDayBeforeReadiness,
  createAttestation,
  refreshReadiness,
  sendDeviceEvent,
  type DayBeforeResponse,
  type CaseReadiness,
  type DeviceEventResponse,
} from '@/lib/api';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function formatReason(reason: string): string {
  const reasons: Record<string, string> = {
    NOT_IN_INVENTORY: 'Not in inventory',
    INSUFFICIENT_QUANTITY: 'Insufficient quantity',
    NOT_STERILE: 'Not sterile',
    STERILITY_EXPIRED: 'Sterility expired',
    NOT_AVAILABLE: 'Not available (reserved)',
    NOT_VERIFIED: 'Not yet verified',
    NOT_LOCATABLE: 'Location unknown',
  };
  return reasons[reason] || reason;
}

// Scanner notification component
interface ScanNotification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  timestamp: Date;
}

function ScannerPanel({
  enabled,
  onToggle,
  isCapturing,
  notifications,
  onDismiss,
}: {
  enabled: boolean;
  onToggle: () => void;
  isCapturing: boolean;
  notifications: ScanNotification[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="scanner-panel">
      <div className="scanner-panel-header">
        <div className="scanner-status">
          <span
            className={`scanner-indicator ${enabled ? 'active' : 'inactive'}`}
          />
          <span className="scanner-label">
            {isCapturing
              ? 'Scanning...'
              : enabled
              ? 'Scanner Ready'
              : 'Scanner Disabled'}
          </span>
        </div>
        <button
          className={`btn btn-sm ${enabled ? 'btn-secondary' : 'btn-primary'}`}
          onClick={onToggle}
        >
          {enabled ? 'Disable Scanner' : 'Enable Scanner'}
        </button>
      </div>

      {enabled && (
        <div className="scanner-hint">
          Scan barcodes anywhere on this page to verify items
        </div>
      )}

      {notifications.length > 0 && (
        <div className="scan-notifications">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`scan-notification ${notif.type}`}
              onClick={() => onDismiss(notif.id)}
            >
              <div className="scan-notification-content">
                <span className="scan-notification-message">{notif.message}</span>
                {notif.detail && (
                  <span className="scan-notification-detail">{notif.detail}</span>
                )}
              </div>
              <span className="scan-notification-time">
                {notif.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProcedureCard({
  procedure,
  userRole,
  userId,
  token,
  onUpdate,
}: {
  procedure: CaseReadiness;
  userRole: string;
  userId: string;
  token: string;
  onUpdate: () => void;
}) {
  const [isAttesting, setIsAttesting] = useState(false);
  const [error, setError] = useState('');

  const canAttest =
    !procedure.hasAttestation &&
    ['ADMIN', 'CIRCULATOR', 'INVENTORY_TECH'].includes(userRole);

  const canAcknowledge =
    procedure.readinessState === 'RED' &&
    !procedure.hasSurgeonAcknowledgment &&
    userRole === 'SURGEON' &&
    procedure.surgeonId === userId;

  const handleAttest = async () => {
    setIsAttesting(true);
    setError('');
    try {
      await createAttestation(token, {
        caseId: procedure.caseId,
        type: 'CASE_READINESS',
      });
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attestation failed');
    } finally {
      setIsAttesting(false);
    }
  };

  const handleAcknowledge = async () => {
    setIsAttesting(true);
    setError('');
    try {
      await createAttestation(token, {
        caseId: procedure.caseId,
        type: 'SURGEON_ACKNOWLEDGMENT',
      });
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledgment failed');
    } finally {
      setIsAttesting(false);
    }
  };

  return (
    <div className={`procedure-card status-${procedure.readinessState.toLowerCase()}`}>
      <div className="procedure-card-header">
        <div className="procedure-card-info">
          <h3>{procedure.procedureName}</h3>
          <p>
            {formatTime(procedure.scheduledTime)} &bull; Dr. {procedure.surgeonName}
          </p>
        </div>
        <div className={`readiness-badge ${procedure.readinessState.toLowerCase()}`}>
          {procedure.readinessState === 'GREEN' && 'READY'}
          {procedure.readinessState === 'ORANGE' && 'PENDING'}
          {procedure.readinessState === 'RED' && 'MISSING ITEMS'}
        </div>
      </div>

      <div className="procedure-card-body">
        <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)' }}>
          {procedure.totalVerifiedItems} of {procedure.totalRequiredItems} items verified
        </p>

        {procedure.missingItems.length > 0 && (
          <div className="missing-items">
            <h4>Missing Items ({procedure.missingItems.length})</h4>
            <ul className="missing-items-list">
              {procedure.missingItems.map((item, i) => (
                <li key={i} className="missing-item">
                  <span className="missing-item-name">
                    {item.catalogName} (need {item.requiredQuantity}, have{' '}
                    {item.availableQuantity})
                  </span>
                  <span className="missing-item-reason">
                    {formatReason(item.reason)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="form-error" style={{ marginTop: '0.5rem' }}>
            {error}
          </div>
        )}
      </div>

      <div className="procedure-card-footer">
        <div className="attestation-status">
          {procedure.hasAttestation ? (
            <span className="attestation-status attested">
              Attested by {procedure.attestedByName}
            </span>
          ) : (
            <span className="attestation-status pending">
              Awaiting attestation
            </span>
          )}
          {procedure.readinessState === 'RED' && (
            <>
              {procedure.hasSurgeonAcknowledgment ? (
                <span style={{ marginLeft: '1rem', color: 'var(--color-orange)' }}>
                  Surgeon acknowledged
                </span>
              ) : (
                <span style={{ marginLeft: '1rem', color: 'var(--color-red)' }}>
                  Surgeon acknowledgment required
                </span>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canAttest && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAttest}
              disabled={isAttesting}
            >
              {isAttesting ? 'Attesting...' : 'Attest Readiness'}
            </button>
          )}
          {canAcknowledge && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleAcknowledge}
              disabled={isAttesting}
            >
              {isAttesting ? 'Acknowledging...' : 'Acknowledge & Proceed'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Default device ID for keyboard wedge (virtual device)
const KEYBOARD_WEDGE_DEVICE_ID = '00000000-0000-0000-0000-000000000000';

export default function DayBeforePage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DayBeforeResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Scanner state
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [notifications, setNotifications] = useState<ScanNotification[]>([]);
  const [notificationId, setNotificationId] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);

  // Add notification helper
  const addNotification = useCallback(
    (type: ScanNotification['type'], message: string, detail?: string) => {
      const id = notificationId + 1;
      setNotificationId(id);
      setNotifications((prev) => [
        { id, type, message, detail, timestamp: new Date() },
        ...prev.slice(0, 4), // Keep max 5 notifications
      ]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 5000);
    },
    [notificationId]
  );

  // Handle scan
  const handleScan = useCallback(
    async (result: ScanResult) => {
      if (!token) return;

      const deviceId = selectedDeviceId || KEYBOARD_WEDGE_DEVICE_ID;

      try {
        const response = await sendDeviceEvent(token, {
          deviceId,
          deviceType: 'barcode',
          payloadType: 'scan',
          rawValue: result.value,
          occurredAt: result.timestamp.toISOString(),
        });

        if (response.processed) {
          addNotification(
            'success',
            'Item Verified',
            `Barcode: ${result.value}`
          );
          // Refresh data to show updated verification status
          loadData();
        } else {
          addNotification(
            'error',
            'Item Not Found',
            response.error || `Barcode: ${result.value}`
          );
        }
      } catch (err) {
        addNotification(
          'error',
          'Scan Failed',
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
    },
    [token, selectedDeviceId, addNotification]
  );

  // Initialize scanner hook
  const { isCapturing } = useScanner({
    enabled: scannerEnabled,
    onScan: handleScan,
    minLength: 3,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = async () => {
    if (!token) return;
    try {
      const result = await getDayBeforeReadiness(token, selectedDate);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  // Load devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      if (!token) return;
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/inventory/devices`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setDevices(data.devices || []);
          // If there's a device, select the first one
          if (data.devices?.length > 0) {
            setSelectedDeviceId(data.devices[0].id);
          }
        }
      } catch {
        // Ignore device loading errors
      }
    };
    loadDevices();
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, selectedDate]);

  const handleRefresh = async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      await refreshReadiness(token, selectedDate);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const dismissNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleFilter = (filter: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  // Filter procedures based on active filters
  const filteredProcedures = data?.cases.filter((proc) => {
    if (activeFilters.size === 0) return true;
    return activeFilters.has(proc.readinessState);
  }) || [];

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      <header className="header">
        <div className="container header-content">
          <h1>Day-Before Review</h1>
          <div className="header-user">
            <span>
              {user.name} ({user.role})
            </span>
            <span>{user.facilityName}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Scanner Panel */}
        <ScannerPanel
          enabled={scannerEnabled}
          onToggle={() => setScannerEnabled(!scannerEnabled)}
          isCapturing={isCapturing}
          notifications={notifications}
          onDismiss={dismissNotification}
        />

        <div className="date-header">
          <h2>Procedures for {formatDate(selectedDate)}</h2>
          <div className="date-controls">
            {devices.length > 0 && (
              <select
                value={selectedDeviceId || ''}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                className="device-select"
              >
                <option value="">Keyboard Wedge</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="form-error"
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--color-red-bg)',
              borderRadius: '0.5rem',
            }}
          >
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-card-label">Total Procedures</div>
                <div className="summary-card-value">{data.summary.total}</div>
              </div>
              <div className="summary-card green">
                <div className="summary-card-label">Ready</div>
                <div className="summary-card-value">{data.summary.green}</div>
              </div>
              <div className="summary-card orange">
                <div className="summary-card-label">Pending</div>
                <div className="summary-card-value">{data.summary.orange}</div>
              </div>
              <div className="summary-card red">
                <div className="summary-card-label">Missing Items</div>
                <div className="summary-card-value">{data.summary.red}</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-label">Attested</div>
                <div className="summary-card-value">{data.summary.attested}</div>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="filter-bar">
              <span className="filter-bar-label">Filter:</span>
              <button
                className={`filter-btn filter-all ${activeFilters.size === 0 ? 'active' : ''}`}
                onClick={() => setActiveFilters(new Set())}
              >
                All
                <span className="filter-btn-count">{data.summary.total}</span>
              </button>
              <button
                className={`filter-btn filter-green ${activeFilters.has('GREEN') ? 'active' : ''}`}
                onClick={() => toggleFilter('GREEN')}
              >
                Ready
                <span className="filter-btn-count">{data.summary.green}</span>
              </button>
              <button
                className={`filter-btn filter-orange ${activeFilters.has('ORANGE') ? 'active' : ''}`}
                onClick={() => toggleFilter('ORANGE')}
              >
                Pending
                <span className="filter-btn-count">{data.summary.orange}</span>
              </button>
              <button
                className={`filter-btn filter-red ${activeFilters.has('RED') ? 'active' : ''}`}
                onClick={() => toggleFilter('RED')}
              >
                Missing
                <span className="filter-btn-count">{data.summary.red}</span>
              </button>
            </div>

            {filteredProcedures.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem',
                  color: 'var(--color-gray-500)',
                }}
              >
                {data.cases.length === 0
                  ? 'No procedures scheduled for this date.'
                  : 'No procedures match the selected filters.'}
              </div>
            ) : (
              <div className="procedure-list">
                {filteredProcedures.map((proc) => (
                  <ProcedureCard
                    key={proc.caseId}
                    procedure={proc}
                    userRole={user.role}
                    userId={user.id}
                    token={token!}
                    onUpdate={loadData}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
