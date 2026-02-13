'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { AdminSettingsSubnav } from '@/components/AdminSettingsSubnav';
import {
  getFacilitySettings,
  updateFacilitySettings,
  type FacilitySettings,
} from '@/lib/api';

export default function FacilitySettingsPage() {
  const { user, token } = useAuth();

  const [settings, setSettings] = useState<FacilitySettings | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const facilitySettings = await getFacilitySettings(token);
      setSettings(facilitySettings);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load facility settings');
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

  const handleToggleChange = async (field: keyof FacilitySettings, value: boolean) => {
    if (!token || !settings) return;

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      await updateFacilitySettings(token, { [field]: value });
      setSettings({ ...settings, [field]: value });
      setSuccessMessage('Settings updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  if (!isAdmin) {
    return (
      <>
        <Header title="Facility Settings" />
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
      <Header title="Facility Settings" />

      <main className="container py-8">
        <Breadcrumbs
          items={[
            { label: 'Admin', href: '#' },
            { label: 'Settings', href: '/admin/general-settings' },
            { label: 'Facility Settings' },
          ]}
        />

        <AdminSettingsSubnav />

        <p className="text-text-muted mb-8 max-w-[600px]">
          Configure facility-level features that affect workflows and checklists.
        </p>

        {error && (
          <div className="alert alert-error mb-6">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success mb-6">
            {successMessage}
          </div>
        )}

        {isLoadingData ? (
          <div className="text-text-muted">Loading settings...</div>
        ) : (
          <div className="bg-surface-primary border border-border rounded-xl p-6 max-w-[600px]">
            <h2 className="text-lg font-medium text-text-primary mb-6">Feature Flags</h2>

            <div className="space-y-6">
              {/* Timeout & Debrief Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label
                    htmlFor="enableTimeoutDebrief"
                    className="block font-medium text-text-primary mb-1"
                  >
                    Enable Timeout & Debrief Checklists
                  </label>
                  <p className="text-sm text-text-muted">
                    When enabled, Timeout and Debrief checklist tabs will be available on the case dashboard.
                  </p>
                </div>
                <div className="ml-4">
                  <label className="relative inline-block w-[52px] h-[28px]">
                    <input
                      id="enableTimeoutDebrief"
                      type="checkbox"
                      checked={settings?.enableTimeoutDebrief || false}
                      onChange={(e) => handleToggleChange('enableTimeoutDebrief', e.target.checked)}
                      disabled={isSaving}
                      className="opacity-0 w-0 h-0 peer"
                    />
                    <span
                      className="absolute cursor-pointer top-0 left-0 right-0 bottom-0 bg-[var(--color-gray-300)] transition-all duration-300 rounded-full
                        peer-checked:bg-accent
                        peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
                        before:content-[''] before:absolute before:h-[20px] before:w-[20px] before:left-[4px] before:bottom-[4px] before:bg-white before:transition-all before:duration-300 before:rounded-full
                        peer-checked:before:translate-x-[24px]"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
