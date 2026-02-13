'use client';

/**
 * Platform Administration Page
 *
 * LAW §5: Configuration Governance
 * LAW §11: Audit and Evidence
 *
 * Tabs:
 * 1. Config Keys - View/edit platform configuration values
 * 2. Facility Overrides - Manage per-facility configuration overrides
 * 3. Audit Log - View configuration change history
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getConfigKeys,
  getFacilities,
  getFacilityOverrides,
  getAuditLog,
  getAuthAuditLog,
  setConfigKey,
  setFacilityOverride,
  clearFacilityOverride,
  type ConfigKey,
  type Facility,
  type FacilityOverride,
  type AuditLogEntry,
  type AuthAuditLogEntry,
  type AuthEventType,
} from '@/lib/api/platform';

type TabId = 'keys' | 'overrides' | 'audit' | 'auth-audit';

export default function PlatformAdminPage() {
  const router = useRouter();
  const { token } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('keys');

  // Data state
  const [configKeys, setConfigKeys] = useState<ConfigKey[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [overrides, setOverrides] = useState<FacilityOverride[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [authAuditLog, setAuthAuditLog] = useState<AuthAuditLogEntry[]>([]);

  // Loading/error state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [auditKeyFilter, setAuditKeyFilter] = useState<string>('');
  const [auditFacilityFilter, setAuditFacilityFilter] = useState<string>('');
  const [authAuditFacilityFilter, setAuthAuditFacilityFilter] = useState<string>('');
  const [authAuditEventFilter, setAuthAuditEventFilter] = useState<AuthEventType | ''>('');

  // Edit modal state
  const [editingKey, setEditingKey] = useState<ConfigKey | null>(null);
  const [editingOverride, setEditingOverride] = useState<FacilityOverride | null>(null);
  const [formValue, setFormValue] = useState<string>('');
  const [formReason, setFormReason] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Load config keys
  const loadConfigKeys = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getConfigKeys(token);
      setConfigKeys(result.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config keys');
    }
  }, [token]);

  // Load facilities
  const loadFacilities = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getFacilities(token);
      setFacilities(result.facilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load facilities');
    }
  }, [token]);

  // Load facility overrides
  const loadOverrides = useCallback(async () => {
    if (!token || !selectedFacilityId) {
      setOverrides([]);
      return;
    }
    try {
      const result = await getFacilityOverrides(token, selectedFacilityId);
      setOverrides(result.overrides);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overrides');
    }
  }, [token, selectedFacilityId]);

  // Load audit log
  const loadAuditLog = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getAuditLog(token, {
        key: auditKeyFilter || undefined,
        facilityId: auditFacilityFilter || undefined,
        limit: 50,
      });
      setAuditLog(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    }
  }, [token, auditKeyFilter, auditFacilityFilter]);

  // Load auth audit log
  const loadAuthAuditLog = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getAuthAuditLog(token, {
        facilityId: authAuditFacilityFilter === 'platform' ? null :
                    authAuditFacilityFilter || undefined,
        eventType: authAuditEventFilter || undefined,
        limit: 100,
      });
      setAuthAuditLog(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load auth audit log');
    }
  }, [token, authAuditFacilityFilter, authAuditEventFilter]);

  // Initial load
  useEffect(() => {
    if (!token) return;

    const loadAll = async () => {
      setIsLoading(true);
      setError('');
      await Promise.all([loadConfigKeys(), loadFacilities()]);
      setIsLoading(false);
    };

    loadAll();
  }, [token, loadConfigKeys, loadFacilities]);

  // Load overrides when facility changes
  useEffect(() => {
    if (activeTab === 'overrides' && selectedFacilityId) {
      loadOverrides();
    }
  }, [activeTab, selectedFacilityId, loadOverrides]);

  // Load audit log when tab is active or filters change
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLog();
    }
  }, [activeTab, loadAuditLog]);

  // Load auth audit log when tab is active or filters change
  useEffect(() => {
    if (activeTab === 'auth-audit') {
      loadAuthAuditLog();
    }
  }, [activeTab, loadAuthAuditLog]);

  // Get unique categories for filter
  const categories = ['all', ...new Set(configKeys.map(k => k.category))];

  // Filter config keys by category
  const filteredKeys = categoryFilter === 'all'
    ? configKeys
    : configKeys.filter(k => k.category === categoryFilter);

  // Handle save platform config
  const handleSaveConfig = async () => {
    if (!token || !editingKey) return;

    const requiresReason = ['MEDIUM', 'HIGH', 'CRITICAL'].includes(editingKey.riskClass);
    if (requiresReason && !formReason.trim()) {
      setError(`Config key with ${editingKey.riskClass} risk requires a reason`);
      return;
    }

    setIsSaving(true);
    try {
      await setConfigKey(token, editingKey.key, {
        value: formValue || null,
        reason: formReason || undefined,
      });
      setSuccessMessage(`Updated ${editingKey.displayName}`);
      setEditingKey(null);
      setFormValue('');
      setFormReason('');
      await loadConfigKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle save facility override
  const handleSaveOverride = async () => {
    if (!token || !editingOverride || !selectedFacilityId) return;

    setIsSaving(true);
    try {
      await setFacilityOverride(token, selectedFacilityId, editingOverride.key, {
        value: formValue || null,
        reason: formReason || undefined,
      });
      setSuccessMessage(`Updated override for ${editingOverride.displayName}`);
      setEditingOverride(null);
      setFormValue('');
      setFormReason('');
      await loadOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clear facility override
  const handleClearOverride = async (override: FacilityOverride) => {
    if (!token || !selectedFacilityId) return;

    const reason = prompt('Enter reason for clearing this override:');
    if (!reason) return;

    try {
      await clearFacilityOverride(token, selectedFacilityId, override.key, reason);
      setSuccessMessage(`Cleared override for ${override.displayName}`);
      await loadOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear override');
    }
  };

  // Start editing a config key
  const startEditKey = (key: ConfigKey) => {
    // Use the actual saved platform value, or fall back to default
    const currentValue = key.platformValue ?? key.defaultValue ?? '';
    setEditingKey(key);
    setFormValue(currentValue);
    setFormReason('');
  };

  // Start editing an override
  const startEditOverride = (override: FacilityOverride) => {
    setEditingOverride(override);
    setFormValue(override.facilityValue || override.platformValue || '');
    setFormReason('');
  };

  // Risk class badge color
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'var(--color-green)';
      case 'MEDIUM': return 'var(--color-orange)';
      case 'HIGH': return '#e74c3c';
      case 'CRITICAL': return '#8e44ad';
      default: return 'var(--text-muted)';
    }
  };

  // Source badge color
  const getSourceColor = (source: string) => {
    switch (source) {
      case 'FACILITY': return 'var(--color-blue-500)';
      case 'PLATFORM': return 'var(--color-green)';
      default: return 'var(--text-muted)';
    }
  };

  // Format timestamp
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  return (
    <>
      <Header title="Platform Administration" />
      <main className="container platform-admin">
        {/* Alerts */}
        {error && (
          <div className="alert alert-error" onClick={() => setError('')}>
            {error}
          </div>
        )}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            Config Keys
          </button>
          <button
            className={`tab ${activeTab === 'overrides' ? 'active' : ''}`}
            onClick={() => setActiveTab('overrides')}
          >
            Facility Overrides
          </button>
          <button
            className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Config Audit
          </button>
          <button
            className={`tab ${activeTab === 'auth-audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('auth-audit')}
          >
            Auth Log
          </button>
        </div>

        {isLoading ? (
          <div className="loading-state">Loading...</div>
        ) : (
          <>
            {/* Config Keys Tab */}
            {activeTab === 'keys' && (
              <div className="tab-content">
                <div className="filters">
                  <label>
                    Category:
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>
                          {c === 'all' ? 'All Categories' : c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Risk</th>
                        <th>Override?</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKeys.map((key) => (
                        <tr key={key.id}>
                          <td>
                            <div className="key-name">{key.displayName}</div>
                            <div className="key-path">{key.key}</div>
                          </td>
                          <td>{key.valueType}</td>
                          <td className="value-cell">
                            {key.isSensitive ? (
                              <span className="redacted">[REDACTED]</span>
                            ) : (
                              // Show platform value if set, otherwise show default
                              (key.platformValue ?? key.defaultValue) || <span className="null-value">null</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="risk-badge"
                              style={{ background: getRiskColor(key.riskClass) }}
                            >
                              {key.riskClass}
                            </span>
                          </td>
                          <td>{key.allowFacilityOverride ? 'Yes' : 'No'}</td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => startEditKey(key)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Facility Overrides Tab */}
            {activeTab === 'overrides' && (
              <div className="tab-content">
                <div className="filters">
                  <label>
                    Facility:
                    <select
                      value={selectedFacilityId}
                      onChange={(e) => setSelectedFacilityId(e.target.value)}
                    >
                      <option value="">Select a facility...</option>
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {!selectedFacilityId ? (
                  <div className="empty-state">
                    Select a facility to view and manage configuration overrides.
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Platform Value</th>
                          <th>Facility Override</th>
                          <th>Effective</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overrides.map((ov) => (
                          <tr key={ov.key}>
                            <td>
                              <div className="key-name">{ov.displayName}</div>
                              <div className="key-path">{ov.key}</div>
                            </td>
                            <td className="value-cell">
                              {ov.isSensitive ? (
                                <span className="redacted">[REDACTED]</span>
                              ) : (
                                ov.platformValue || <span className="null-value">null</span>
                              )}
                            </td>
                            <td className="value-cell">
                              {ov.facilityValue !== null ? (
                                ov.isSensitive ? (
                                  <span className="redacted">[REDACTED]</span>
                                ) : (
                                  ov.facilityValue
                                )
                              ) : (
                                <span className="null-value">—</span>
                              )}
                            </td>
                            <td>
                              <span
                                className="source-badge"
                                style={{ background: getSourceColor(ov.effectiveSource) }}
                              >
                                {ov.effectiveSource}
                              </span>
                            </td>
                            <td className="actions-cell">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => startEditOverride(ov)}
                              >
                                Edit
                              </button>
                              {ov.facilityValue !== null && (
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleClearOverride(ov)}
                                >
                                  Clear
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Config Audit Log Tab */}
            {activeTab === 'audit' && (
              <div className="tab-content">
                <div className="mb-3">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => router.push('/platform/config-audit')}
                  >
                    Open Dedicated Audit Viewer &rarr;
                  </button>
                </div>
                <div className="filters">
                  <label>
                    Key:
                    <select
                      value={auditKeyFilter}
                      onChange={(e) => setAuditKeyFilter(e.target.value)}
                    >
                      <option value="">All Keys</option>
                      {configKeys.map(k => (
                        <option key={k.key} value={k.key}>{k.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Facility:
                    <select
                      value={auditFacilityFilter}
                      onChange={(e) => setAuditFacilityFilter(e.target.value)}
                    >
                      <option value="">All (Platform + Facilities)</option>
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Key</th>
                        <th>Action</th>
                        <th>Change</th>
                        <th>Actor</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="empty-row">
                            No audit log entries found.
                          </td>
                        </tr>
                      ) : (
                        auditLog.map((entry) => (
                          <tr key={entry.id}>
                            <td className="timestamp-cell">
                              {formatTime(entry.createdAt)}
                            </td>
                            <td>
                              <div className="key-path">{entry.configKey}</div>
                              {entry.facilityId && (
                                <div className="facility-tag">
                                  {facilities.find(f => f.id === entry.facilityId)?.name || 'Facility'}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={`action-badge action-${entry.action.toLowerCase()}`}>
                                {entry.action}
                              </span>
                            </td>
                            <td className="change-cell">
                              <span className="old-value">{entry.oldValue || '(none)'}</span>
                              <span className="arrow">→</span>
                              <span className="new-value">{entry.newValue || '(none)'}</span>
                            </td>
                            <td>{entry.actorName}</td>
                            <td className="reason-cell">{entry.changeReason || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Auth Audit Log Tab */}
            {activeTab === 'auth-audit' && (
              <div className="tab-content">
                <div className="mb-3">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => router.push('/platform/auth-audit')}
                  >
                    Open Dedicated Auth Dashboard &rarr;
                  </button>
                </div>
                <div className="filters">
                  <label>
                    Facility:
                    <select
                      value={authAuditFacilityFilter}
                      onChange={(e) => setAuthAuditFacilityFilter(e.target.value)}
                    >
                      <option value="">All</option>
                      <option value="platform">Platform Only</option>
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Event Type:
                    <select
                      value={authAuditEventFilter}
                      onChange={(e) => setAuthAuditEventFilter(e.target.value as AuthEventType | '')}
                    >
                      <option value="">All Events</option>
                      <option value="LOGIN_SUCCESS">Login Success</option>
                      <option value="LOGIN_FAILED">Login Failed</option>
                      <option value="LOGOUT">Logout</option>
                    </select>
                  </label>
                </div>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Event</th>
                        <th>User</th>
                        <th>Facility</th>
                        <th>IP Address</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authAuditLog.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="empty-row">
                            No authentication events found.
                          </td>
                        </tr>
                      ) : (
                        authAuditLog.map((entry) => (
                          <tr key={entry.id}>
                            <td className="timestamp-cell">
                              {formatTime(entry.createdAt)}
                            </td>
                            <td>
                              <span className={`event-badge event-${entry.eventType.toLowerCase().replace('_', '-')}`}>
                                {entry.eventType.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <div className="key-name">{entry.username}</div>
                              {entry.userRoles && (
                                <div className="key-path">{entry.userRoles.join(', ')}</div>
                              )}
                            </td>
                            <td>
                              {entry.facilityName || (entry.facilityId ? 'Unknown' : 'Platform')}
                            </td>
                            <td className="ip-cell">{entry.ipAddress || '—'}</td>
                            <td className="reason-cell">
                              {entry.failureReason ? (
                                <span className="failure-reason">{entry.failureReason.replace('_', ' ')}</span>
                              ) : entry.success ? (
                                <span className="success-text">OK</span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Edit Config Modal */}
        {editingKey && (
          <div className="modal-overlay" onClick={() => setEditingKey(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Configuration</h2>
              <div className="modal-key-info">
                <div className="key-name">{editingKey.displayName}</div>
                <div className="key-path">{editingKey.key}</div>
                {editingKey.description && (
                  <div className="key-description">{editingKey.description}</div>
                )}
              </div>

              <div className="form-group">
                <label>Value ({editingKey.valueType})</label>
                {editingKey.valueType === 'BOOLEAN' ? (
                  <select
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={editingKey.valueType === 'NUMBER' ? 'number' : 'text'}
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder={editingKey.isSensitive ? '(sensitive value)' : 'Enter value...'}
                  />
                )}
              </div>

              <div className="form-group">
                <label>
                  Reason
                  {['MEDIUM', 'HIGH', 'CRITICAL'].includes(editingKey.riskClass) && (
                    <span className="required"> (required for {editingKey.riskClass} risk)</span>
                  )}
                </label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Why is this change being made?"
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingKey(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Override Modal */}
        {editingOverride && (
          <div className="modal-overlay" onClick={() => setEditingOverride(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Facility Override</h2>
              <div className="modal-key-info">
                <div className="key-name">{editingOverride.displayName}</div>
                <div className="key-path">{editingOverride.key}</div>
                <div className="platform-value-info">
                  Platform value: {editingOverride.platformValue || '(none)'}
                </div>
              </div>

              <div className="form-group">
                <label>Override Value</label>
                <input
                  type="text"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="Enter override value..."
                />
              </div>

              <div className="form-group">
                <label>Reason</label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Why is this override being set?"
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveOverride}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Override'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingOverride(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .platform-admin {
          padding: 1.5rem 0;
          max-width: 1400px;
        }

        .alert {
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          cursor: pointer;
        }
        .alert-error {
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid var(--color-red);
          color: var(--color-red);
        }
        .alert-success {
          background: rgba(39, 174, 96, 0.1);
          border: 1px solid var(--color-green);
          color: var(--color-green);
        }

        .tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid var(--border-default);
          margin-bottom: 1.5rem;
        }
        .tab {
          padding: 0.75rem 1.5rem;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          cursor: pointer;
          color: var(--text-secondary);
          font-weight: 500;
          transition: all 0.2s;
        }
        .tab:hover {
          color: var(--text-primary);
          background: var(--surface-secondary);
        }
        .tab.active {
          color: var(--color-blue-500);
          border-bottom-color: var(--color-blue-500);
        }

        .tab-content {
          min-height: 400px;
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .filters label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        .filters select {
          padding: 0.5rem;
          border-radius: 4px;
          border: 1px solid var(--border-default);
          background: var(--surface-primary);
          color: var(--text-primary);
          min-width: 200px;
        }

        .table-container {
          overflow-x: auto;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .data-table th,
        .data-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid var(--border-default);
        }
        .data-table th {
          background: var(--surface-secondary);
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .data-table tbody tr:hover {
          background: var(--surface-secondary);
        }

        .key-name {
          font-weight: 500;
          color: var(--text-primary);
        }
        .key-path {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: monospace;
        }

        .value-cell {
          font-family: monospace;
          font-size: 0.8125rem;
        }
        .null-value {
          color: var(--text-muted);
          font-style: italic;
        }
        .redacted {
          color: var(--color-orange);
          font-style: italic;
        }

        .risk-badge,
        .source-badge,
        .action-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
        }
        .action-badge.action-set {
          background: var(--color-blue-500);
        }
        .action-badge.action-clear {
          background: var(--color-orange);
        }

        .event-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
          text-transform: capitalize;
        }
        .event-badge.event-login-success {
          background: var(--color-green);
        }
        .event-badge.event-login-failed {
          background: var(--color-red);
        }
        .event-badge.event-logout {
          background: var(--color-orange);
        }

        .ip-cell {
          font-family: monospace;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .failure-reason {
          color: var(--color-red);
          font-size: 0.8125rem;
          text-transform: capitalize;
        }

        .success-text {
          color: var(--color-green);
          font-weight: 500;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
        }

        .empty-state,
        .loading-state {
          padding: 3rem;
          text-align: center;
          color: var(--text-muted);
        }
        .empty-row {
          text-align: center;
          color: var(--text-muted);
          font-style: italic;
        }

        .timestamp-cell {
          font-size: 0.8125rem;
          white-space: nowrap;
        }
        .facility-tag {
          font-size: 0.6875rem;
          background: var(--surface-tertiary);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          display: inline-block;
          margin-top: 0.25rem;
        }
        .change-cell {
          font-family: monospace;
          font-size: 0.75rem;
        }
        .old-value {
          color: var(--color-red);
          text-decoration: line-through;
        }
        .arrow {
          margin: 0 0.5rem;
          color: var(--text-muted);
        }
        .new-value {
          color: var(--color-green);
        }
        .reason-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: var(--surface-primary);
          border-radius: 8px;
          padding: 1.5rem;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .modal h2 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
        }
        .modal-key-info {
          background: var(--surface-secondary);
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
        }
        .modal-key-info .key-description {
          margin-top: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        .platform-value-info {
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .form-group {
          margin-bottom: 1rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .form-group .required {
          color: var(--color-orange);
          font-weight: normal;
          font-size: 0.8125rem;
        }
        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          background: var(--surface-primary);
          color: var(--text-primary);
          font-size: 0.875rem;
        }
        .form-group textarea {
          resize: vertical;
          min-height: 80px;
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-primary {
          background: var(--color-blue-500);
          color: white;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--color-blue-600);
        }
        .btn-secondary {
          background: var(--surface-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
        }
        .btn-secondary:hover:not(:disabled) {
          background: var(--surface-tertiary);
        }
        .btn-danger {
          background: var(--color-red);
          color: white;
        }
        .btn-danger:hover:not(:disabled) {
          opacity: 0.9;
        }
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
        }

        /* Dark mode */
        :global([data-theme="dark"]) .modal {
          background: var(--surface-secondary);
        }
        :global([data-theme="dark"]) .form-group input,
        :global([data-theme="dark"]) .form-group select,
        :global([data-theme="dark"]) .form-group textarea {
          background: var(--surface-tertiary);
        }
      `}</style>
    </>
  );
}
