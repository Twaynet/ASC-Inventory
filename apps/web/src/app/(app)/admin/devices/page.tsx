'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getDevices, type Device } from '@/lib/api/inventory';

/**
 * Phase 7.7 — Device Registry
 *
 * Table of registered scanning devices.
 * Uses GET /api/inventory/devices via existing getDevices() wrapper.
 */
export default function DeviceRegistryPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { hasRole } = useAccessControl();

  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDevices = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getDevices(token);
      setDevices(result.devices);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && user && hasRole('ADMIN')) loadDevices();
  }, [token, user, hasRole, loadDevices]);

  if (!user || !token) {
    return (
      <>
        <Header title="Device Registry" />
        <div className="p-6 text-center text-text-muted">Loading...</div>
      </>
    );
  }

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Header title="Device Registry" />
        <div className="p-6">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </div>
      </>
    );
  }

  const activeCount = devices.filter(d => d.active).length;
  const inactiveCount = devices.filter(d => !d.active).length;

  return (
    <>
      <Header title="Device Registry" />
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-text-primary">Device Registry</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => router.push('/admin/devices/events')}
          >
            View Device Events &rarr;
          </button>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Summary */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">{devices.length}</div>
              <div className="text-xs text-text-muted">Total Devices</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-green)]">{activeCount}</div>
              <div className="text-xs text-text-muted">Active</div>
            </div>
            <div className="bg-surface-primary rounded-lg border border-border p-4 text-center">
              <div className="text-2xl font-bold text-text-muted">{inactiveCount}</div>
              <div className="text-xs text-text-muted">Inactive</div>
            </div>
          </div>
        )}

        {/* Device table */}
        <div className="bg-surface-primary rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No devices registered.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="text-left py-3 px-4 font-semibold text-text-secondary">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-text-secondary">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-text-secondary">Location</th>
                  <th className="text-center py-3 px-4 font-semibold text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-t border-border hover:bg-surface-secondary">
                    <td className="py-3 px-4 font-medium text-text-primary">
                      {device.name}
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-tertiary text-text-secondary">
                        {device.deviceType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {device.locationId || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {device.active ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-green-bg)] text-[var(--color-green-700)]">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-tertiary text-text-muted">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
