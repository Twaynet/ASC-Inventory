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

      <main className="container py-8">
        <Breadcrumbs items={[
          { label: 'General Settings', href: '/admin/general-settings' },
          { label: 'Case Dashboard' },
        ]} />
        <AdminSettingsSubnav />

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success cursor-pointer" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
          <p className="m-0 text-text-muted max-w-[600px]">
            Configure options that appear on the Case Dashboard. These settings affect how cases are managed and documented.
          </p>
          <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap text-text-primary">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive items
          </label>
        </div>

        {isLoadingData ? (
          <div className="text-text-muted">Loading settings...</div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Time Out & Debrief Feature Toggle Section */}
            <div className="bg-surface-primary rounded-lg shadow-[0_1px_3px_var(--shadow-sm)] overflow-hidden">
              <button
                className={`w-full flex items-center py-4 px-6 bg-surface-primary border-none cursor-pointer text-left transition-colors hover:bg-surface-secondary ${expandedSections.has('FEATURE_TOGGLES') ? 'border-b border-border' : ''}`}
                onClick={() => toggleSection('FEATURE_TOGGLES')}
                aria-expanded={expandedSections.has('FEATURE_TOGGLES')}
              >
                <div className="flex items-center gap-4 w-full">
                  <span className="text-xs text-text-muted shrink-0 w-4">{expandedSections.has('FEATURE_TOGGLES') ? '\u25BC' : '\u25B6'}</span>
                  <div className="flex items-center gap-4 flex-1">
                    <h2 className="m-0 text-lg text-text-primary">Time Out & Debrief Checklists</h2>
                    <span className={`text-xs py-1 px-2 rounded font-semibold ${settings?.enableTimeoutDebrief ? 'bg-[var(--color-green-bg)] text-[var(--color-green-700)]' : 'bg-[var(--color-red-bg)] text-[var(--color-red)]'}`}>
                      {settings?.enableTimeoutDebrief ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('FEATURE_TOGGLES') && (
                <div className="p-6 bg-surface-secondary">
                  <div className="flex justify-between items-start gap-8">
                    <div className="flex-1">
                      <p className="m-0 mb-4 text-text-muted text-sm">
                        Enable surgical safety checklists for case time out (before surgery)
                        and post-operative debrief with role-based signatures.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        className={`relative w-[50px] h-[26px] border-none rounded-[13px] cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${settings?.enableTimeoutDebrief ? 'bg-[var(--color-green)]' : 'bg-[var(--color-gray-400)]'}`}
                        onClick={handleToggleFeature}
                        disabled={isSavingSettings}
                      >
                        <span className={`absolute top-[3px] left-[3px] w-5 h-5 bg-surface-primary rounded-full transition-transform shadow-[0_1px_3px_var(--shadow-sm)] ${settings?.enableTimeoutDebrief ? 'translate-x-6' : ''}`}></span>
                      </button>
                      <span className="text-sm text-text-secondary">
                        {settings?.enableTimeoutDebrief ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Template Management */}
                  {settings?.enableTimeoutDebrief && templates.length > 0 && (
                    <div className="mt-4 border-t border-border pt-4">
                      <h3 className="my-6 mb-4 text-base text-text-primary">
                        Checklist Templates
                      </h3>

                      {templates.map(template => (
                        <div key={template.id} className="bg-surface-primary border border-border rounded-lg mb-4 overflow-hidden">
                          <div className="flex justify-between items-center p-4 bg-surface-secondary border-b border-border">
                            <div>
                              <h4 className="m-0 text-[0.95rem] text-text-primary">{template.name}</h4>
                              <span className="text-xs text-text-muted">
                                {template.items.length} items &middot; Version {template.versionNumber || 1}
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
                            <div className="p-4">
                              <div className="flex flex-col gap-3">
                                {editingItems.map((item, index) => (
                                  <div key={item.key} className="flex items-start gap-3 p-3 bg-surface-secondary border border-border rounded-md">
                                    <div className="flex flex-col gap-[2px]">
                                      <button
                                        className="w-6 h-6 p-0 border border-border bg-surface-primary rounded text-xs text-text-primary cursor-pointer hover:enabled:bg-surface-tertiary disabled:opacity-30 disabled:cursor-not-allowed"
                                        onClick={() => moveItem(index, 'up')}
                                        disabled={index === 0}
                                        title="Move up"
                                      >&uarr;</button>
                                      <button
                                        className="w-6 h-6 p-0 border border-border bg-surface-primary rounded text-xs text-text-primary cursor-pointer hover:enabled:bg-surface-tertiary disabled:opacity-30 disabled:cursor-not-allowed"
                                        onClick={() => moveItem(index, 'down')}
                                        disabled={index === editingItems.length - 1}
                                        title="Move down"
                                      >&darr;</button>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2">
                                      <input
                                        type="text"
                                        value={item.label}
                                        onChange={(e) => updateItem(index, { label: e.target.value })}
                                        placeholder="Label"
                                        className="text-[0.9rem] font-medium p-[0.4rem] border border-border rounded bg-surface-primary text-text-primary"
                                      />
                                      <div className="flex gap-4 items-center">
                                        <select
                                          value={item.type}
                                          onChange={(e) => updateItem(index, {
                                            type: e.target.value as ChecklistTemplateItem['type'],
                                            options: e.target.value === 'select' ? (item.options || ['option1', 'option2']) : undefined,
                                          })}
                                          className="py-1 px-2 border border-border rounded text-[0.8rem] bg-surface-primary text-text-primary"
                                        >
                                          <option value="checkbox">Checkbox</option>
                                          <option value="select">Dropdown</option>
                                          <option value="text">Text</option>
                                          <option value="readonly">Read-only</option>
                                        </select>
                                        <label className="flex items-center gap-1 text-[0.8rem] cursor-pointer text-text-primary">
                                          <input
                                            type="checkbox"
                                            checked={item.required}
                                            onChange={(e) => updateItem(index, { required: e.target.checked })}
                                          />
                                          Required
                                        </label>
                                      </div>
                                      {item.type === 'select' && (
                                        <div className="flex flex-col gap-1">
                                          <label className="text-xs text-text-muted">Options (comma-separated):</label>
                                          <input
                                            type="text"
                                            value={(item.options || []).join(', ')}
                                            onChange={(e) => updateItem(index, {
                                              options: e.target.value.split(',').map(o => o.trim()).filter(o => o),
                                            })}
                                            placeholder="option1, option2, option3"
                                            className="p-[0.3rem] border border-border rounded text-[0.8rem] bg-surface-primary text-text-primary"
                                          />
                                        </div>
                                      )}
                                      <span className="text-[0.7rem] text-text-muted font-mono">Key: {item.key}</span>
                                    </div>
                                    <button
                                      className="w-6 h-6 p-0 border border-border bg-surface-primary rounded cursor-pointer text-[var(--color-red)] text-xl font-bold hover:bg-[var(--color-red-bg)]"
                                      onClick={() => removeItem(index)}
                                      title="Remove item"
                                    >&times;</button>
                                  </div>
                                ))}
                              </div>

                              {showAddItemForm ? (
                                <div className="mt-4 p-4 bg-[var(--color-orange-bg)] border border-[var(--color-orange)] rounded-md">
                                  <h5 className="m-0 mb-3 text-[0.9rem] text-text-primary">Add New Item</h5>
                                  <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                                    <div className="form-group">
                                      <label className="block mb-2 font-medium text-text-primary">Key *</label>
                                      <input
                                        type="text"
                                        value={newItem.key || ''}
                                        onChange={(e) => setNewItem({ ...newItem, key: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                        placeholder="e.g., blood_type_confirmed"
                                        pattern="^[a-z][a-z0-9_]*$"
                                        className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label className="block mb-2 font-medium text-text-primary">Label *</label>
                                      <input
                                        type="text"
                                        value={newItem.label || ''}
                                        onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                                        placeholder="e.g., Blood type confirmed"
                                        className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                                    <div className="form-group">
                                      <label className="block mb-2 font-medium text-text-primary">Type</label>
                                      <select
                                        value={newItem.type || 'checkbox'}
                                        onChange={(e) => setNewItem({
                                          ...newItem,
                                          type: e.target.value as ChecklistTemplateItem['type'],
                                          options: e.target.value === 'select' ? ['option1', 'option2'] : undefined,
                                        })}
                                        className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                      >
                                        <option value="checkbox">Checkbox</option>
                                        <option value="select">Dropdown</option>
                                        <option value="text">Text</option>
                                        <option value="readonly">Read-only</option>
                                      </select>
                                    </div>
                                    <div className="form-group">
                                      <label className="block mb-2 font-medium text-text-primary">&nbsp;</label>
                                      <label className="flex items-center gap-2 cursor-pointer text-text-primary">
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
                                      <label className="block mb-2 font-medium text-text-primary">Options (comma-separated)</label>
                                      <input
                                        type="text"
                                        value={(newItem.options || []).join(', ')}
                                        onChange={(e) => setNewItem({
                                          ...newItem,
                                          options: e.target.value.split(',').map(o => o.trim()).filter(o => o),
                                        })}
                                        placeholder="option1, option2, option3"
                                        className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                      />
                                    </div>
                                  )}
                                  <div className="flex gap-4">
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
                                  className="btn btn-create btn-sm mt-2"
                                  onClick={() => setShowAddItemForm(true)}
                                >
                                  + Add Item
                                </button>
                              )}

                              <div className="flex gap-3 mt-4 pt-4 border-t border-border">
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
                            <div className="p-4">
                              {template.items.map(item => (
                                <div key={item.key} className="flex items-center gap-2 py-[0.4rem] border-b border-border last:border-b-0">
                                  <span className="text-[0.85rem] text-text-muted w-[1.2rem]">{item.type === 'checkbox' ? '\u2611' : item.type === 'select' ? '\u25BC' : item.type === 'text' ? '\u270E' : '\u25CB'}</span>
                                  <span className="flex-1 text-sm text-text-primary">{item.label}</span>
                                  {item.required && <span className="text-[var(--color-red)] font-bold">*</span>}
                                  {item.type === 'select' && item.options && (
                                    <span className="text-xs text-text-muted">({item.options.join(', ')})</span>
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
                <div key={section.type} className="bg-surface-primary rounded-lg shadow-[0_1px_3px_var(--shadow-sm)] overflow-hidden">
                  <button
                    className={`w-full flex items-center py-4 px-6 bg-surface-primary border-none cursor-pointer text-left transition-colors hover:bg-surface-secondary ${isExpanded ? 'border-b border-border' : ''}`}
                    onClick={() => toggleSection(section.type)}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <span className="text-xs text-text-muted shrink-0 w-4">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                      <div className="flex items-center gap-4 flex-1">
                        <h2 className="m-0 text-lg text-text-primary">{section.title}</h2>
                        <span className="text-xs text-text-muted bg-surface-tertiary py-1 px-2 rounded">{sectionItems.filter(i => i.active).length} active items</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-6 bg-surface-secondary">
                      <p className="m-0 mb-4 text-text-muted text-sm">{section.description}</p>

                      <div className="mb-4">
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
                        <div className="bg-surface-primary border border-border rounded-lg p-4 mb-4">
                          <h3 className="mt-0 mb-4 text-base text-text-primary">Add New Item</h3>
                          <form onSubmit={handleCreate}>
                            <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                              <div className="form-group">
                                <label className="block mb-2 font-medium text-text-primary">Key * <small className="font-normal text-text-muted">(cannot be changed later)</small></label>
                                <input
                                  type="text"
                                  value={formData.itemKey || ''}
                                  onChange={(e) => setFormData({ ...formData, itemKey: e.target.value })}
                                  required
                                  pattern="^[a-zA-Z][a-zA-Z0-9_]*$"
                                  title="Must start with a letter, only letters, numbers, and underscores"
                                  placeholder={section.keyPlaceholder}
                                  className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                />
                              </div>
                              <div className="form-group">
                                <label className="block mb-2 font-medium text-text-primary">Display Label *</label>
                                <input
                                  type="text"
                                  value={formData.displayLabel || ''}
                                  onChange={(e) => setFormData({ ...formData, displayLabel: e.target.value })}
                                  required
                                  placeholder={section.labelPlaceholder}
                                  className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                />
                              </div>
                            </div>
                            <div className="form-group">
                              <label className="block mb-2 font-medium text-text-primary">Description <small className="font-normal text-text-muted">(optional)</small></label>
                              <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional help text or notes"
                                className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                              />
                            </div>
                            <div className="flex gap-4">
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
                        <div className="bg-surface-primary border border-border rounded-lg p-4 mb-4">
                          <h3 className="mt-0 mb-4 text-base text-text-primary">Edit Item</h3>
                          <form onSubmit={handleUpdate}>
                            <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                              <div className="form-group">
                                <label className="block mb-2 font-medium text-text-primary">Key</label>
                                <input
                                  type="text"
                                  value={editingItem.itemKey}
                                  disabled
                                  className="w-full p-2 border border-border rounded bg-surface-tertiary text-text-muted cursor-not-allowed"
                                />
                              </div>
                              <div className="form-group">
                                <label className="block mb-2 font-medium text-text-primary">Display Label *</label>
                                <input
                                  type="text"
                                  value={formData.displayLabel || ''}
                                  onChange={(e) => setFormData({ ...formData, displayLabel: e.target.value })}
                                  required
                                  className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                                />
                              </div>
                            </div>
                            <div className="form-group">
                              <label className="block mb-2 font-medium text-text-primary">Description <small className="font-normal text-text-muted">(optional)</small></label>
                              <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Optional help text or notes"
                                className="w-full p-2 border border-border rounded bg-surface-primary text-text-primary"
                              />
                            </div>
                            <div className="flex gap-4">
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
                      <div className="flex flex-col gap-2">
                        {sectionItems.length === 0 ? (
                          <div className="text-center text-text-muted py-8 bg-surface-primary border border-dashed border-border rounded-md">
                            No items configured. Add your first item to get started.
                          </div>
                        ) : (
                          sectionItems.map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-4 py-3 px-4 bg-surface-primary border border-border rounded-md transition-all hover:bg-surface-secondary ${!item.active ? 'opacity-60' : ''} ${dragOverItem === item.id ? 'border-[var(--color-blue-500)] bg-[var(--color-blue-50)]' : ''} ${draggedItem === item.id ? 'opacity-50 scale-[0.98]' : ''}`}
                              draggable={item.active}
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragOver={(e) => handleDragOver(e, item.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, item.id, section.type)}
                              onDragEnd={handleDragEnd}
                            >
                              <div className={`flex flex-col gap-[2px] p-2 opacity-40 hover:opacity-80 ${item.active ? 'cursor-grab' : 'cursor-not-allowed !opacity-20'}`} title="Drag to reorder">
                                <span className="block w-4 h-[2px] bg-text-muted rounded-[1px]"></span>
                                <span className="block w-4 h-[2px] bg-text-muted rounded-[1px]"></span>
                                <span className="block w-4 h-[2px] bg-text-muted rounded-[1px]"></span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-text-primary">{item.displayLabel}</div>
                                <div className="text-xs text-text-muted font-mono">{item.itemKey}</div>
                                {item.description && (
                                  <div className="text-[0.8125rem] text-text-muted mt-1">{item.description}</div>
                                )}
                              </div>
                              <div className="shrink-0">
                                {!item.active && <span className="inline-block py-1 px-2 rounded text-xs font-semibold bg-[var(--color-red-bg)] text-[var(--color-red)]">Inactive</span>}
                              </div>
                              <div className="flex gap-2 shrink-0">
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
    </>
  );
}
