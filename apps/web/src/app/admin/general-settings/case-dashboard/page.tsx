'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getConfigItems,
  createConfigItem,
  updateConfigItem,
  deactivateConfigItem,
  activateConfigItem,
  reorderConfigItems,
  getFacilitySettings,
  updateFacilitySettings,
  type ConfigItem,
  type ConfigItemType,
  type CreateConfigItemRequest,
  type FacilitySettings,
} from '@/lib/api';

interface SectionConfig {
  type: ConfigItemType;
  title: string;
  description: string;
  keyPlaceholder: string;
  labelPlaceholder: string;
}

const SECTIONS: SectionConfig[] = [
  {
    type: 'PATIENT_FLAG',
    title: 'Patient-Specific Flags (Non-PHI)',
    description: 'Configure patient flags displayed on case forms. These help staff prepare for patient-specific needs without storing PHI.',
    keyPlaceholder: 'e.g., latexAllergy',
    labelPlaceholder: 'e.g., Latex-Free Required',
  },
  {
    type: 'ANESTHESIA_MODALITY',
    title: 'Anesthesia Plan Modalities',
    description: 'Configure anesthesia modality options available for case planning.',
    keyPlaceholder: 'e.g., GENERAL',
    labelPlaceholder: 'e.g., General Anesthesia',
  },
];

export default function CaseDashboardSettingsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<ConfigItem[]>([]);
  const [settings, setSettings] = useState<FacilitySettings | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Expanded sections state (includes 'FEATURE_TOGGLES' as a special section)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Form state
  const [showCreateForm, setShowCreateForm] = useState<ConfigItemType | null>(null);
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
  const [formData, setFormData] = useState<Partial<CreateConfigItemRequest>>({});

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [configResult, settingsResult] = await Promise.all([
        getConfigItems(token, undefined, showInactive),
        getFacilitySettings(token),
      ]);
      setItems(configResult.items);
      setSettings(settingsResult);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive]);

  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN')) {
        loadData();
      }
    }
  }, [token, user, loadData]);

  const toggleSection = (type: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleToggleFeature = async () => {
    if (!token || !settings) return;
    setIsSavingSettings(true);
    try {
      const result = await updateFacilitySettings(token, {
        enableTimeoutDebrief: !settings.enableTimeoutDebrief,
      });
      setSettings(result);
      setSuccessMessage(
        result.enableTimeoutDebrief
          ? 'Time Out & Debrief feature enabled'
          : 'Time Out & Debrief feature disabled'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getItemsForType = (type: ConfigItemType): ConfigItem[] => {
    return items.filter(item => item.itemType === type).sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !showCreateForm) return;

    try {
      await createConfigItem(token, {
        itemType: showCreateForm,
        itemKey: formData.itemKey || '',
        displayLabel: formData.displayLabel || '',
        description: formData.description,
      });
      setSuccessMessage('Item created successfully');
      setShowCreateForm(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingItem) return;

    try {
      await updateConfigItem(token, editingItem.id, {
        displayLabel: formData.displayLabel,
        description: formData.description,
      });
      setSuccessMessage('Item updated successfully');
      setEditingItem(null);
      setFormData({});
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const handleDeactivate = async (itemId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this item? It will be hidden from forms but historical data will be preserved.')) return;

    try {
      await deactivateConfigItem(token, itemId);
      setSuccessMessage('Item deactivated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate item');
    }
  };

  const handleActivate = async (itemId: string) => {
    if (!token) return;

    try {
      await activateConfigItem(token, itemId);
      setSuccessMessage('Item activated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate item');
    }
  };

  const startEdit = (item: ConfigItem) => {
    setEditingItem(item);
    setFormData({
      displayLabel: item.displayLabel,
      description: item.description || '',
    });
    setShowCreateForm(null);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    if (draggedItem !== itemId) {
      setDragOverItem(itemId);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, itemType: ConfigItemType) => {
    e.preventDefault();
    if (!token || !draggedItem || draggedItem === targetId) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const typeItems = getItemsForType(itemType);
    const draggedIndex = typeItems.findIndex(i => i.id === draggedItem);
    const targetIndex = typeItems.findIndex(i => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const newOrder = [...typeItems];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    try {
      await reorderConfigItems(token, itemType, newOrder.map(i => i.id));
      setSuccessMessage('Items reordered successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder items');
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <>
        <Header title="Case Dashboard Settings" />
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
      <Header title="Case Dashboard Settings" />

      <main className="container case-dashboard-settings-page">
        <button className="back-link" onClick={() => router.push('/admin/general-settings')}>
          ← Back to General Settings
        </button>

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="page-header">
          <p className="page-description">
            Configure options that appear on the Case Dashboard. These settings affect how cases are managed and documented.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive items
          </label>
        </div>

        {isLoadingData ? (
          <div className="loading">Loading settings...</div>
        ) : (
          <div className="collapsible-sections">
            {/* Time Out & Debrief Feature Toggle Section */}
            <div className="collapsible-section">
              <button
                className={`section-header ${expandedSections.has('FEATURE_TOGGLES') ? 'expanded' : ''}`}
                onClick={() => toggleSection('FEATURE_TOGGLES')}
                aria-expanded={expandedSections.has('FEATURE_TOGGLES')}
              >
                <div className="section-header-content">
                  <span className="section-arrow">{expandedSections.has('FEATURE_TOGGLES') ? '▼' : '▶'}</span>
                  <div className="section-title-block">
                    <h2>Time Out & Debrief Checklists</h2>
                    <span className={`feature-status ${settings?.enableTimeoutDebrief ? 'enabled' : 'disabled'}`}>
                      {settings?.enableTimeoutDebrief ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('FEATURE_TOGGLES') && (
                <div className="section-content">
                  <div className="feature-toggle">
                    <div className="feature-info">
                      <p className="section-description">
                        Enable surgical safety checklists for case time out (before surgery)
                        and post-operative debrief with role-based signatures.
                      </p>
                    </div>
                    <div className="toggle-control">
                      <button
                        className={`toggle-btn ${settings?.enableTimeoutDebrief ? 'active' : ''}`}
                        onClick={handleToggleFeature}
                        disabled={isSavingSettings}
                      >
                        <span className="toggle-slider"></span>
                      </button>
                      <span className="toggle-label">
                        {settings?.enableTimeoutDebrief ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {SECTIONS.map((section) => {
              const sectionItems = getItemsForType(section.type);
              const isExpanded = expandedSections.has(section.type);
              const isCreating = showCreateForm === section.type;
              const isEditing = editingItem?.itemType === section.type;

              return (
                <div key={section.type} className="collapsible-section">
                  <button
                    className={`section-header ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleSection(section.type)}
                    aria-expanded={isExpanded}
                  >
                    <div className="section-header-content">
                      <span className="section-arrow">{isExpanded ? '▼' : '▶'}</span>
                      <div className="section-title-block">
                        <h2>{section.title}</h2>
                        <span className="item-count">{sectionItems.filter(i => i.active).length} active items</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="section-content">
                      <p className="section-description">{section.description}</p>

                      <div className="section-actions">
                        <button
                          className="btn btn-create"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCreateForm(section.type);
                            setEditingItem(null);
                            setFormData({ itemType: section.type });
                          }}
                        >
                          + Add Item
                        </button>
                      </div>

                      {/* Create Form */}
                      {isCreating && (
                        <div className="form-card">
                          <h3>Add New Item</h3>
                          <form onSubmit={handleCreate}>
                            <div className="form-row">
                              <div className="form-group">
                                <label>Key * <small>(cannot be changed later)</small></label>
                                <input
                                  type="text"
                                  value={formData.itemKey || ''}
                                  onChange={(e) => setFormData({ ...formData, itemKey: e.target.value })}
                                  required
                                  pattern="^[a-zA-Z][a-zA-Z0-9_]*$"
                                  title="Must start with a letter, only letters, numbers, and underscores"
                                  placeholder={section.keyPlaceholder}
                                />
                              </div>
                              <div className="form-group">
                                <label>Display Label *</label>
                                <input
                                  type="text"
                                  value={formData.displayLabel || ''}
                                  onChange={(e) => setFormData({ ...formData, displayLabel: e.target.value })}
                                  required
                                  placeholder={section.labelPlaceholder}
                                />
                              </div>
                            </div>
                            <div className="form-group">
                              <label>Description <small>(optional)</small></label>
                              <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional help text or notes"
                              />
                            </div>
                            <div className="form-actions">
                              <button type="submit" className="btn btn-primary">Create Item</button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setShowCreateForm(null);
                                  setFormData({});
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Edit Form */}
                      {isEditing && editingItem && (
                        <div className="form-card">
                          <h3>Edit Item</h3>
                          <form onSubmit={handleUpdate}>
                            <div className="form-row">
                              <div className="form-group">
                                <label>Key</label>
                                <input
                                  type="text"
                                  value={editingItem.itemKey}
                                  disabled
                                  className="disabled-input"
                                />
                              </div>
                              <div className="form-group">
                                <label>Display Label *</label>
                                <input
                                  type="text"
                                  value={formData.displayLabel || ''}
                                  onChange={(e) => setFormData({ ...formData, displayLabel: e.target.value })}
                                  required
                                />
                              </div>
                            </div>
                            <div className="form-group">
                              <label>Description <small>(optional)</small></label>
                              <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional help text or notes"
                              />
                            </div>
                            <div className="form-actions">
                              <button type="submit" className="btn btn-primary">Save Changes</button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setEditingItem(null);
                                  setFormData({});
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Sortable List */}
                      <div className="sortable-list">
                        {sectionItems.length === 0 ? (
                          <div className="empty-state">
                            No items configured. Add your first item to get started.
                          </div>
                        ) : (
                          sectionItems.map((item) => (
                            <div
                              key={item.id}
                              className={`sortable-item ${!item.active ? 'inactive' : ''} ${dragOverItem === item.id ? 'drag-over' : ''} ${draggedItem === item.id ? 'dragging' : ''}`}
                              draggable={item.active}
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragOver={(e) => handleDragOver(e, item.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, item.id, section.type)}
                              onDragEnd={handleDragEnd}
                            >
                              <div className="drag-handle" title="Drag to reorder">
                                <span></span>
                                <span></span>
                                <span></span>
                              </div>
                              <div className="item-content">
                                <div className="item-label">{item.displayLabel}</div>
                                <div className="item-key">{item.itemKey}</div>
                                {item.description && (
                                  <div className="item-description">{item.description}</div>
                                )}
                              </div>
                              <div className="item-status">
                                {!item.active && <span className="status-badge inactive">Inactive</span>}
                              </div>
                              <div className="item-actions">
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => startEdit(item)}
                                >
                                  Edit
                                </button>
                                {item.active ? (
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleDeactivate(item.id)}
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-success btn-sm"
                                    onClick={() => handleActivate(item.id)}
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style jsx>{`
        .case-dashboard-settings-page {
          padding: 2rem 0;
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

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .page-description {
          margin: 0;
          color: #718096;
          max-width: 600px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          white-space: nowrap;
        }

        .collapsible-sections {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .collapsible-section {
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .section-header {
          width: 100%;
          display: flex;
          align-items: center;
          padding: 1rem 1.5rem;
          background: white;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }

        .section-header:hover {
          background: #f7fafc;
        }

        .section-header.expanded {
          border-bottom: 1px solid #e2e8f0;
        }

        .section-header-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
        }

        .section-arrow {
          font-size: 0.75rem;
          color: #718096;
          flex-shrink: 0;
          width: 1rem;
        }

        .section-title-block {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }

        .section-title-block h2 {
          margin: 0;
          font-size: 1.125rem;
          color: #2d3748;
        }

        .item-count {
          font-size: 0.75rem;
          color: #a0aec0;
          background: #f7fafc;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .section-content {
          padding: 1.5rem;
          background: #fafbfc;
        }

        .feature-status {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-weight: 600;
        }

        .feature-status.enabled {
          background: #c6f6d5;
          color: #276749;
        }

        .feature-status.disabled {
          background: #fed7d7;
          color: #c53030;
        }

        .feature-toggle {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 2rem;
        }

        .feature-info {
          flex: 1;
        }

        .toggle-control {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .toggle-btn {
          position: relative;
          width: 50px;
          height: 26px;
          background: #cbd5e0;
          border: none;
          border-radius: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-btn.active {
          background: #38a169;
        }

        .toggle-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .toggle-slider {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .toggle-btn.active .toggle-slider {
          transform: translateX(24px);
        }

        .toggle-label {
          font-size: 0.875rem;
          color: #4a5568;
        }

        .section-description {
          margin: 0 0 1rem 0;
          color: #718096;
          font-size: 0.875rem;
        }

        .section-actions {
          margin-bottom: 1rem;
        }

        .form-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .form-card h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1rem;
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
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group label small {
          font-weight: normal;
          color: #718096;
        }

        .form-group input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .disabled-input {
          background: #edf2f7;
          color: #718096;
          cursor: not-allowed;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
        }

        .sortable-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .sortable-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .sortable-item:hover {
          background: #f7fafc;
        }

        .sortable-item.inactive {
          opacity: 0.6;
        }

        .sortable-item.dragging {
          opacity: 0.5;
          transform: scale(0.98);
        }

        .sortable-item.drag-over {
          border-color: var(--color-blue-500, #3182ce);
          background: #ebf8ff;
        }

        .drag-handle {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0.5rem;
          cursor: grab;
          opacity: 0.4;
        }

        .drag-handle:hover {
          opacity: 0.8;
        }

        .drag-handle span {
          display: block;
          width: 16px;
          height: 2px;
          background: #718096;
          border-radius: 1px;
        }

        .sortable-item.inactive .drag-handle {
          cursor: not-allowed;
          opacity: 0.2;
        }

        .item-content {
          flex: 1;
          min-width: 0;
        }

        .item-label {
          font-weight: 500;
          color: #2d3748;
        }

        .item-key {
          font-size: 0.75rem;
          color: #718096;
          font-family: monospace;
        }

        .item-description {
          font-size: 0.8125rem;
          color: #a0aec0;
          margin-top: 0.25rem;
        }

        .item-status {
          flex-shrink: 0;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.inactive {
          background: #fed7d7;
          color: #c53030;
        }

        .item-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem;
          background: white;
          border: 1px dashed #e2e8f0;
          border-radius: 6px;
        }

        .btn-danger {
          background: #e53e3e;
          color: white;
        }

        .btn-danger:hover {
          background: #c53030;
        }

        .btn-success {
          background: #38a169;
          color: white;
        }

        .btn-success:hover {
          background: #2f855a;
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
      `}</style>
    </>
  );
}
