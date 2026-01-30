'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { AdminSettingsSubnav } from '@/components/AdminSettingsSubnav';
import {
  getConfigItems,
  createConfigItem,
  updateConfigItem,
  deactivateConfigItem,
  activateConfigItem,
  reorderConfigItems,
  getFacilitySettings,
  updateFacilitySettings,
  getChecklistTemplates,
  updateChecklistTemplate,
  type ConfigItem,
  type ConfigItemType,
  type CreateConfigItemRequest,
  type FacilitySettings,
  type ChecklistTemplateData,
  type ChecklistTemplateItem,
  type ChecklistTemplateSignature,
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
  const { user, token } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<ConfigItem[]>([]);
  const [settings, setSettings] = useState<FacilitySettings | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplateData[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Template editing state
  const [editingTemplateType, setEditingTemplateType] = useState<'TIMEOUT' | 'DEBRIEF' | null>(null);
  const [editingItems, setEditingItems] = useState<ChecklistTemplateItem[]>([]);
  const [editingSignatures, setEditingSignatures] = useState<ChecklistTemplateSignature[]>([]);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ChecklistTemplateItem>>({
    type: 'checkbox',
    required: true,
  });

  // Expanded sections state (includes 'FEATURE_TOGGLES' as a special section)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Form state
  const [showCreateForm, setShowCreateForm] = useState<ConfigItemType | null>(null);
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
  const [formData, setFormData] = useState<Partial<CreateConfigItemRequest>>({});

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [configResult, settingsResult, templatesResult] = await Promise.all([
        getConfigItems(token, undefined, showInactive),
        getFacilitySettings(token),
        getChecklistTemplates(token).catch(() => ({ templates: [] })),
      ]);
      setItems(configResult.items);
      setSettings(settingsResult);
      setTemplates(templatesResult.templates);
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

  // Template editing functions
  const startEditingTemplate = (type: 'TIMEOUT' | 'DEBRIEF') => {
    const template = templates.find(t => t.type === type);
    if (template) {
      setEditingTemplateType(type);
      setEditingItems([...template.items]);
      setEditingSignatures([...template.requiredSignatures]);
      setShowAddItemForm(false);
      setNewItem({ type: 'checkbox', required: true });
    }
  };

  const cancelEditingTemplate = () => {
    setEditingTemplateType(null);
    setEditingItems([]);
    setEditingSignatures([]);
    setShowAddItemForm(false);
    setNewItem({ type: 'checkbox', required: true });
  };

  const saveTemplate = async () => {
    if (!token || !editingTemplateType) return;
    setIsSavingTemplate(true);
    try {
      await updateChecklistTemplate(token, editingTemplateType, editingItems, editingSignatures);
      setSuccessMessage(`${editingTemplateType} template updated successfully`);
      cancelEditingTemplate();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const addNewItem = () => {
    if (!newItem.key || !newItem.label) return;
    const item: ChecklistTemplateItem = {
      key: newItem.key,
      label: newItem.label,
      type: newItem.type || 'checkbox',
      required: newItem.required ?? true,
      options: newItem.type === 'select' ? (newItem.options || []) : undefined,
    };
    setEditingItems([...editingItems, item]);
    setShowAddItemForm(false);
    setNewItem({ type: 'checkbox', required: true });
  };

  const updateItem = (index: number, updates: Partial<ChecklistTemplateItem>) => {
    const updated = [...editingItems];
    updated[index] = { ...updated[index], ...updates };
    setEditingItems(updated);
  };

  const removeItem = (index: number) => {
    setEditingItems(editingItems.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editingItems.length) return;
    const updated = [...editingItems];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setEditingItems(updated);
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
        <Breadcrumbs items={[
          { label: 'General Settings', href: '/admin/general-settings' },
          { label: 'Case Dashboard' },
        ]} />
        <AdminSettingsSubnav />

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

                  {/* Template Management */}
                  {settings?.enableTimeoutDebrief && templates.length > 0 && (
                    <div className="template-management">
                      <h3 style={{ margin: '1.5rem 0 1rem 0', fontSize: '1rem', color: '#2d3748' }}>
                        Checklist Templates
                      </h3>

                      {templates.map(template => (
                        <div key={template.id} className="template-card">
                          <div className="template-header">
                            <div>
                              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{template.name}</h4>
                              <span className="template-meta">
                                {template.items.length} items · Version {template.versionNumber || 1}
                              </span>
                            </div>
                            {editingTemplateType !== template.type && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => startEditingTemplate(template.type)}
                              >
                                Edit Items
                              </button>
                            )}
                          </div>

                          {editingTemplateType === template.type ? (
                            <div className="template-editor">
                              <div className="editor-items">
                                {editingItems.map((item, index) => (
                                  <div key={item.key} className="editor-item">
                                    <div className="item-reorder">
                                      <button
                                        className="btn-icon"
                                        onClick={() => moveItem(index, 'up')}
                                        disabled={index === 0}
                                        title="Move up"
                                      >↑</button>
                                      <button
                                        className="btn-icon"
                                        onClick={() => moveItem(index, 'down')}
                                        disabled={index === editingItems.length - 1}
                                        title="Move down"
                                      >↓</button>
                                    </div>
                                    <div className="item-details">
                                      <input
                                        type="text"
                                        value={item.label}
                                        onChange={(e) => updateItem(index, { label: e.target.value })}
                                        placeholder="Label"
                                        className="item-label-input"
                                      />
                                      <div className="item-config">
                                        <select
                                          value={item.type}
                                          onChange={(e) => updateItem(index, {
                                            type: e.target.value as ChecklistTemplateItem['type'],
                                            options: e.target.value === 'select' ? (item.options || ['option1', 'option2']) : undefined,
                                          })}
                                          className="item-type-select"
                                        >
                                          <option value="checkbox">Checkbox</option>
                                          <option value="select">Dropdown</option>
                                          <option value="text">Text</option>
                                          <option value="readonly">Read-only</option>
                                        </select>
                                        <label className="checkbox-label-inline">
                                          <input
                                            type="checkbox"
                                            checked={item.required}
                                            onChange={(e) => updateItem(index, { required: e.target.checked })}
                                          />
                                          Required
                                        </label>
                                      </div>
                                      {item.type === 'select' && (
                                        <div className="item-options">
                                          <label>Options (comma-separated):</label>
                                          <input
                                            type="text"
                                            value={(item.options || []).join(', ')}
                                            onChange={(e) => updateItem(index, {
                                              options: e.target.value.split(',').map(o => o.trim()).filter(o => o),
                                            })}
                                            placeholder="option1, option2, option3"
                                          />
                                        </div>
                                      )}
                                      <span className="item-key-display">Key: {item.key}</span>
                                    </div>
                                    <button
                                      className="btn-icon btn-danger-icon"
                                      onClick={() => removeItem(index)}
                                      title="Remove item"
                                    >×</button>
                                  </div>
                                ))}
                              </div>

                              {showAddItemForm ? (
                                <div className="add-item-form">
                                  <h5>Add New Item</h5>
                                  <div className="form-row">
                                    <div className="form-group">
                                      <label>Key *</label>
                                      <input
                                        type="text"
                                        value={newItem.key || ''}
                                        onChange={(e) => setNewItem({ ...newItem, key: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                        placeholder="e.g., blood_type_confirmed"
                                        pattern="^[a-z][a-z0-9_]*$"
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label>Label *</label>
                                      <input
                                        type="text"
                                        value={newItem.label || ''}
                                        onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                                        placeholder="e.g., Blood type confirmed"
                                      />
                                    </div>
                                  </div>
                                  <div className="form-row">
                                    <div className="form-group">
                                      <label>Type</label>
                                      <select
                                        value={newItem.type || 'checkbox'}
                                        onChange={(e) => setNewItem({
                                          ...newItem,
                                          type: e.target.value as ChecklistTemplateItem['type'],
                                          options: e.target.value === 'select' ? ['option1', 'option2'] : undefined,
                                        })}
                                      >
                                        <option value="checkbox">Checkbox</option>
                                        <option value="select">Dropdown</option>
                                        <option value="text">Text</option>
                                        <option value="readonly">Read-only</option>
                                      </select>
                                    </div>
                                    <div className="form-group">
                                      <label>&nbsp;</label>
                                      <label className="checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={newItem.required ?? true}
                                          onChange={(e) => setNewItem({ ...newItem, required: e.target.checked })}
                                        />
                                        Required
                                      </label>
                                    </div>
                                  </div>
                                  {newItem.type === 'select' && (
                                    <div className="form-group">
                                      <label>Options (comma-separated)</label>
                                      <input
                                        type="text"
                                        value={(newItem.options || []).join(', ')}
                                        onChange={(e) => setNewItem({
                                          ...newItem,
                                          options: e.target.value.split(',').map(o => o.trim()).filter(o => o),
                                        })}
                                        placeholder="option1, option2, option3"
                                      />
                                    </div>
                                  )}
                                  <div className="form-actions">
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={addNewItem}
                                      disabled={!newItem.key || !newItem.label}
                                    >
                                      Add Item
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => {
                                        setShowAddItemForm(false);
                                        setNewItem({ type: 'checkbox', required: true });
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  className="btn btn-create btn-sm"
                                  onClick={() => setShowAddItemForm(true)}
                                  style={{ marginTop: '0.5rem' }}
                                >
                                  + Add Item
                                </button>
                              )}

                              <div className="editor-actions">
                                <button
                                  className="btn btn-primary"
                                  onClick={saveTemplate}
                                  disabled={isSavingTemplate}
                                >
                                  {isSavingTemplate ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={cancelEditingTemplate}
                                  disabled={isSavingTemplate}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="template-items-preview">
                              {template.items.map(item => (
                                <div key={item.key} className="preview-item">
                                  <span className="preview-type">{item.type === 'checkbox' ? '☑' : item.type === 'select' ? '▼' : item.type === 'text' ? '✎' : '○'}</span>
                                  <span className="preview-label">{item.label}</span>
                                  {item.required && <span className="preview-required">*</span>}
                                  {item.type === 'select' && item.options && (
                                    <span className="preview-options">({item.options.join(', ')})</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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

        /* Template Editor Styles */
        .template-management {
          margin-top: 1rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 1rem;
        }

        .template-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 1rem;
          overflow: hidden;
        }

        .template-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f7fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .template-meta {
          font-size: 0.75rem;
          color: #718096;
        }

        .template-editor {
          padding: 1rem;
        }

        .editor-items {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .editor-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }

        .item-reorder {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .btn-icon {
          width: 24px;
          height: 24px;
          padding: 0;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
        }

        .btn-icon:hover:not(:disabled) {
          background: #edf2f7;
        }

        .btn-icon:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .btn-danger-icon {
          color: #e53e3e;
          font-size: 1.25rem;
          font-weight: bold;
        }

        .btn-danger-icon:hover {
          background: #fed7d7;
        }

        .item-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .item-label-input {
          font-size: 0.9rem;
          font-weight: 500;
          padding: 0.4rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        .item-config {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .item-type-select {
          padding: 0.25rem 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .checkbox-label-inline {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .item-options {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .item-options label {
          font-size: 0.75rem;
          color: #718096;
        }

        .item-options input {
          padding: 0.3rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .item-key-display {
          font-size: 0.7rem;
          color: #a0aec0;
          font-family: monospace;
        }

        .add-item-form {
          margin-top: 1rem;
          padding: 1rem;
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 6px;
        }

        .add-item-form h5 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
        }

        .editor-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .template-items-preview {
          padding: 1rem;
        }

        .preview-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .preview-item:last-child {
          border-bottom: none;
        }

        .preview-type {
          font-size: 0.85rem;
          color: #718096;
          width: 1.2rem;
        }

        .preview-label {
          flex: 1;
          font-size: 0.875rem;
        }

        .preview-required {
          color: #e53e3e;
          font-weight: bold;
        }

        .preview-options {
          font-size: 0.75rem;
          color: #a0aec0;
        }

        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
          background: white;
        }
      `}</style>
    </>
  );
}
