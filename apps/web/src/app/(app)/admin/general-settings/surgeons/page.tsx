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

      <main className="container-full surgeon-settings-page">
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
          <div className="settings-section">
            <div className="section-header">
              <div>
                <h2>Surgeon Display Colors</h2>
                <p className="section-description">
                  Assign colors to surgeons for visual identification in the calendar and schedule views.
                </p>
              </div>
            </div>

            <div className="surgeons-list">
              {surgeons.length === 0 ? (
                <div className="empty-state">
                  No surgeons found. Add users with the Surgeon role to configure their display settings.
                </div>
              ) : (
                surgeons.map((surgeon) => (
                  <div key={surgeon.id} className="surgeon-row">
                    <div className="surgeon-info">
                      <div
                        className="color-indicator"
                        style={{ backgroundColor: surgeon.displayColor || '#E5E7EB' }}
                      />
                      <div className="surgeon-details">
                        <span className="surgeon-name">{surgeon.name}</span>
                        <span className="surgeon-username">@{surgeon.username}</span>
                      </div>
                    </div>

                    {editingSurgeonId === surgeon.id ? (
                      <div className="color-picker">
                        <div className="color-grid">
                          {SURGEON_COLORS.map((color) => (
                            <button
                              key={color.value}
                              className={`color-swatch ${surgeon.displayColor === color.value ? 'selected' : ''}`}
                              style={{ backgroundColor: color.value }}
                              onClick={() => handleColorSelect(surgeon.id, color.value)}
                              title={color.name}
                            />
                          ))}
                          <button
                            className={`color-swatch no-color ${!surgeon.displayColor ? 'selected' : ''}`}
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

      <style jsx>{`
        .surgeon-settings-page {
          padding: 2rem 1.5rem;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: #3182ce;
          font-size: 0.875rem;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1.5rem;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .settings-section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .section-header {
          margin-bottom: 1.5rem;
        }

        .section-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
        }

        .section-description {
          margin: 0;
          color: #718096;
          font-size: 0.875rem;
        }

        .surgeons-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .surgeon-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .surgeon-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .color-indicator {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          flex-shrink: 0;
        }

        .surgeon-details {
          display: flex;
          flex-direction: column;
        }

        .surgeon-name {
          font-weight: 600;
          color: #2d3748;
        }

        .surgeon-username {
          font-size: 0.8125rem;
          color: #718096;
        }

        .color-picker {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .color-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.375rem;
        }

        .color-swatch {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform 0.1s, border-color 0.1s;
        }

        .color-swatch:hover {
          transform: scale(1.15);
        }

        .color-swatch.selected {
          border-color: #1a202c;
          box-shadow: 0 0 0 2px white, 0 0 0 4px #1a202c;
        }

        .color-swatch.no-color {
          background: #f3f4f6;
          border: 2px dashed #d1d5db;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          color: #9ca3af;
        }

        .empty-state {
          text-align: center;
          padding: 2rem;
          color: #718096;
        }

        .alert-success {
          background: #c6f6d5;
          border: 1px solid #9ae6b4;
          color: #276749;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          cursor: pointer;
        }

        .alert-error {
          background: #fed7d7;
          border: 1px solid #fc8181;
          color: #c53030;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
      `}</style>
    </>
  );
}
