'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { AdminSettingsSubnav } from '@/components/AdminSettingsSubnav';
import {
  getSettingsSurgeons,
  updateSurgeonSettings,
  type SurgeonSettings,
} from '@/lib/api';

// 20 distinct colors for surgeon identification
const SURGEON_COLORS = [
  { value: '#3B82F6', name: 'Blue' },
  { value: '#EF4444', name: 'Red' },
  { value: '#10B981', name: 'Emerald' },
  { value: '#F59E0B', name: 'Amber' },
  { value: '#8B5CF6', name: 'Violet' },
  { value: '#EC4899', name: 'Pink' },
  { value: '#06B6D4', name: 'Cyan' },
  { value: '#F97316', name: 'Orange' },
  { value: '#14B8A6', name: 'Teal' },
  { value: '#6366F1', name: 'Indigo' },
  { value: '#84CC16', name: 'Lime' },
  { value: '#A855F7', name: 'Purple' },
  { value: '#22C55E', name: 'Green' },
  { value: '#E11D48', name: 'Rose' },
  { value: '#0EA5E9', name: 'Sky' },
  { value: '#FBBF24', name: 'Yellow' },
  { value: '#7C3AED', name: 'Purple Dark' },
  { value: '#059669', name: 'Emerald Dark' },
  { value: '#DC2626', name: 'Red Dark' },
  { value: '#2563EB', name: 'Blue Dark' },
];

export default function SurgeonSettingsPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [surgeons, setSurgeons] = useState<SurgeonSettings[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingSurgeonId, setEditingSurgeonId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const result = await getSettingsSurgeons(token);
      setSurgeons(result.surgeons);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surgeons');
    } finally {
      setIsLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN')) {
        loadData();
      }
    }
  }, [token, user, loadData]);

  const handleColorSelect = async (surgeonId: string, color: string | null) => {
    if (!token) return;

    try {
      await updateSurgeonSettings(token, surgeonId, { displayColor: color });
      setSurgeons(prev =>
        prev.map(s => (s.id === surgeonId ? { ...s, displayColor: color } : s))
      );
      setSuccessMessage('Color updated successfully');
      setEditingSurgeonId(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update color');
    }
  };

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  if (!isAdmin) {
    return (
      <>
        <Header title="Surgeon Settings" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Surgeon Settings" />

      <main className="container-full py-8 px-6">
        <Breadcrumbs items={[
          { label: 'General Settings', href: '/admin/general-settings' },
          { label: 'Surgeons' },
        ]} />
        <AdminSettingsSubnav />

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        {isLoadingData ? (
          <div className="loading">Loading surgeons...</div>
        ) : (
          <div className="bg-surface-primary rounded-lg p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
            <div className="mb-6">
              <h2 className="m-0 mb-2 text-xl">Surgeon Display Colors</h2>
              <p className="m-0 text-text-muted text-sm">
                Assign colors to surgeons for visual identification in the calendar and schedule views.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {surgeons.length === 0 ? (
                <div className="text-center p-8 text-text-muted">
                  No surgeons found. Add users with the Surgeon role to configure their display settings.
                </div>
              ) : (
                surgeons.map((surgeon) => (
                  <div key={surgeon.id} className="flex justify-between items-center p-4 bg-surface-secondary rounded-lg border border-border">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-lg border-2 border-black/10 shrink-0"
                        style={{ backgroundColor: surgeon.displayColor || '#E5E7EB' }}
                      />
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-primary">{surgeon.name}</span>
                        <span className="text-[0.8125rem] text-text-muted">@{surgeon.username}</span>
                      </div>
                    </div>

                    {editingSurgeonId === surgeon.id ? (
                      <div className="flex items-center gap-4">
                        <div className="grid grid-cols-7 gap-1.5">
                          {SURGEON_COLORS.map((color) => (
                            <button
                              key={color.value}
                              className={`w-7 h-7 rounded cursor-pointer transition-transform hover:scale-[1.15] ${
                                surgeon.displayColor === color.value
                                  ? 'border-2 border-text-primary shadow-[0_0_0_2px_var(--surface-primary),0_0_0_4px_var(--text-primary)]'
                                  : 'border-2 border-transparent'
                              }`}
                              style={{ backgroundColor: color.value }}
                              onClick={() => handleColorSelect(surgeon.id, color.value)}
                              title={color.name}
                            />
                          ))}
                          <button
                            className={`w-7 h-7 rounded border-2 border-dashed flex items-center justify-center text-base cursor-pointer transition-transform hover:scale-[1.15] ${
                              !surgeon.displayColor
                                ? 'border-text-primary bg-surface-tertiary text-text-muted shadow-[0_0_0_2px_var(--surface-primary),0_0_0_4px_var(--text-primary)]'
                                : 'border-border bg-surface-tertiary text-text-muted'
                            }`}
                            onClick={() => handleColorSelect(surgeon.id, null)}
                            title="No color"
                          >
                            ×
                          </button>
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingSurgeonId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingSurgeonId(surgeon.id)}
                      >
                        {surgeon.displayColor ? 'Change Color' : 'Assign Color'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
