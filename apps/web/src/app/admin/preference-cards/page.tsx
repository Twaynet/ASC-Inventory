'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import {
  getPreferenceCards,
  getPreferenceCardVersions,
  createPreferenceCard,
  updatePreferenceCard,
  createPreferenceCardVersion,
  deactivatePreferenceCard,
  activatePreferenceCard,
  getCatalogItems,
  getSurgeons,
  type PreferenceCard,
  type PreferenceCardVersion,
  type PreferenceCardItem,
  type CreatePreferenceCardRequest,
  type UpdatePreferenceCardRequest,
  type CatalogItem,
  type User,
} from '@/lib/api';

interface CardItemFormData {
  catalogId: string;
  quantity: number;
  notes: string;
}

export default function AdminPreferenceCardsPage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [cards, setCards] = useState<PreferenceCard[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [surgeons, setSurgeons] = useState<User[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [filterSurgeon, setFilterSurgeon] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCard, setEditingCard] = useState<PreferenceCard | null>(null);
  const [formData, setFormData] = useState<{
    surgeonId: string;
    procedureName: string;
    description: string;
    items: CardItemFormData[];
  }>({
    surgeonId: '',
    procedureName: '',
    description: '',
    items: [],
  });

  // Version modal
  const [viewingVersionsCard, setViewingVersionsCard] = useState<PreferenceCard | null>(null);
  const [versions, setVersions] = useState<PreferenceCardVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // New version modal
  const [creatingVersionCard, setCreatingVersionCard] = useState<PreferenceCard | null>(null);
  const [versionItems, setVersionItems] = useState<CardItemFormData[]>([]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [cardsResult, catalogResult, surgeonsResult] = await Promise.all([
        getPreferenceCards(token, {
          surgeonId: filterSurgeon || undefined,
          includeInactive: showInactive,
        }),
        getCatalogItems(token),
        getSurgeons(token),
      ]);
      setCards(cardsResult.cards);
      setCatalogItems(catalogResult.items);
      setSurgeons(surgeonsResult.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preference cards');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, showInactive, filterSurgeon]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      loadData();
    }
  }, [token, user, loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (formData.items.length === 0) {
      setError('Please add at least one item to the preference card');
      return;
    }

    try {
      const createData: CreatePreferenceCardRequest = {
        surgeonId: formData.surgeonId,
        procedureName: formData.procedureName,
        description: formData.description || undefined,
        items: formData.items.map(item => ({
          catalogId: item.catalogId,
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
      };
      await createPreferenceCard(token, createData);
      setSuccessMessage('Preference card created successfully');
      setShowCreateForm(false);
      setFormData({ surgeonId: '', procedureName: '', description: '', items: [] });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create preference card');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingCard) return;

    try {
      const updateData: UpdatePreferenceCardRequest = {};
      if (formData.procedureName && formData.procedureName !== editingCard.procedureName) {
        updateData.procedureName = formData.procedureName;
      }
      if (formData.description !== editingCard.description) {
        updateData.description = formData.description || null;
      }

      await updatePreferenceCard(token, editingCard.id, updateData);
      setSuccessMessage('Preference card updated successfully');
      setEditingCard(null);
      setFormData({ surgeonId: '', procedureName: '', description: '', items: [] });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preference card');
    }
  };

  const handleDeactivate = async (cardId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this preference card?')) return;

    try {
      await deactivatePreferenceCard(token, cardId);
      setSuccessMessage('Preference card deactivated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate preference card');
    }
  };

  const handleActivate = async (cardId: string) => {
    if (!token) return;

    try {
      await activatePreferenceCard(token, cardId);
      setSuccessMessage('Preference card activated successfully');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate preference card');
    }
  };

  const startEdit = (card: PreferenceCard) => {
    setEditingCard(card);
    setFormData({
      surgeonId: card.surgeonId,
      procedureName: card.procedureName,
      description: card.description || '',
      items: [], // Not editing items directly, use create version instead
    });
    setShowCreateForm(false);
  };

  const viewVersions = async (card: PreferenceCard) => {
    if (!token) return;
    setViewingVersionsCard(card);
    setIsLoadingVersions(true);
    try {
      const result = await getPreferenceCardVersions(token, card.id);
      setVersions(result.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const startCreateVersion = (card: PreferenceCard) => {
    setCreatingVersionCard(card);
    // Pre-populate with current version items
    if (card.currentVersion?.items) {
      setVersionItems(card.currentVersion.items.map(item => ({
        catalogId: item.catalogId,
        quantity: item.quantity,
        notes: item.notes || '',
      })));
    } else {
      setVersionItems([]);
    }
  };

  const handleCreateVersion = async () => {
    if (!token || !creatingVersionCard) return;

    if (versionItems.length === 0) {
      setError('Please add at least one item to the version');
      return;
    }

    try {
      await createPreferenceCardVersion(token, creatingVersionCard.id, {
        items: versionItems.map(item => ({
          catalogId: item.catalogId,
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
      });
      setSuccessMessage('New version created successfully');
      setCreatingVersionCard(null);
      setVersionItems([]);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    }
  };

  const addItem = (items: CardItemFormData[], setItems: (items: CardItemFormData[]) => void) => {
    setItems([...items, { catalogId: '', quantity: 1, notes: '' }]);
  };

  const removeItem = (index: number, items: CardItemFormData[], setItems: (items: CardItemFormData[]) => void) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof CardItemFormData,
    value: string | number,
    items: CardItemFormData[],
    setItems: (items: CardItemFormData[]) => void
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const getCatalogItemName = (catalogId: string) => {
    return catalogItems.find(c => c.id === catalogId)?.name || 'Unknown';
  };

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (user.role !== 'ADMIN') {
    return (
      <>
        <Header title="Preference Cards" />
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
      <Header title="Preference Cards" />

      <main className="container admin-preference-cards-page">
        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && (
          <div className="alert alert-success" onClick={() => setSuccessMessage('')}>
            {successMessage}
          </div>
        )}

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">{cards.length}</div>
            <div className="summary-label">Total Cards</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{cards.filter(c => c.active).length}</div>
            <div className="summary-label">Active</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{surgeons.length}</div>
            <div className="summary-label">Surgeons</div>
          </div>
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowCreateForm(true);
              setEditingCard(null);
              setFormData({ surgeonId: '', procedureName: '', description: '', items: [] });
            }}
          >
            + Create Preference Card
          </button>
          <div className="filters">
            <select
              value={filterSurgeon}
              onChange={(e) => setFilterSurgeon(e.target.value)}
            >
              <option value="">All Surgeons</option>
              {surgeons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="form-card">
            <h2>Create New Preference Card</h2>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Surgeon *</label>
                  <select
                    value={formData.surgeonId}
                    onChange={(e) => setFormData({ ...formData, surgeonId: e.target.value })}
                    required
                  >
                    <option value="">Select surgeon...</option>
                    {surgeons.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Procedure Name *</label>
                  <input
                    type="text"
                    value={formData.procedureName}
                    onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
                    required
                    placeholder="e.g., Total Hip Replacement"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>

              <div className="items-section">
                <div className="items-header">
                  <h3>Items</h3>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addItem(formData.items, (items) => setFormData({ ...formData, items }))}
                  >
                    + Add Item
                  </button>
                </div>
                {formData.items.length === 0 ? (
                  <p className="empty-items">No items added yet. Click &quot;+ Add Item&quot; to add items.</p>
                ) : (
                  <div className="items-list">
                    {formData.items.map((item, index) => (
                      <div key={index} className="item-row">
                        <select
                          value={item.catalogId}
                          onChange={(e) => updateItem(index, 'catalogId', e.target.value, formData.items, (items) => setFormData({ ...formData, items }))}
                          required
                        >
                          <option value="">Select item...</option>
                          {catalogItems.filter(c => c.active).map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1, formData.items, (items) => setFormData({ ...formData, items }))}
                          required
                          className="qty-input"
                        />
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateItem(index, 'notes', e.target.value, formData.items, (items) => setFormData({ ...formData, items }))}
                          placeholder="Notes"
                          className="notes-input"
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeItem(index, formData.items, (items) => setFormData({ ...formData, items }))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Create Card
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({ surgeonId: '', procedureName: '', description: '', items: [] });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Form (metadata only) */}
        {editingCard && (
          <div className="form-card">
            <h2>Edit Preference Card</h2>
            <form onSubmit={handleUpdate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Surgeon</label>
                  <input type="text" value={editingCard.surgeonName} disabled />
                </div>
                <div className="form-group">
                  <label>Procedure Name *</label>
                  <input
                    type="text"
                    value={formData.procedureName}
                    onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <p className="edit-note">
                To modify items, create a new version using the &quot;New Version&quot; button.
              </p>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingCard(null);
                    setFormData({ surgeonId: '', procedureName: '', description: '', items: [] });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Cards Table */}
        {isLoadingData ? (
          <div className="loading">Loading preference cards...</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Procedure Name</th>
                  <th>Surgeon</th>
                  <th>Items</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      No preference cards found. Create your first card to get started.
                    </td>
                  </tr>
                ) : (
                  cards.map((card) => (
                    <tr key={card.id} className={!card.active ? 'inactive-row' : ''}>
                      <td className="name-cell">{card.procedureName}</td>
                      <td>{card.surgeonName}</td>
                      <td>{card.currentVersion?.items.length || 0}</td>
                      <td>v{card.currentVersion?.versionNumber || 0}</td>
                      <td>
                        <span className={`status-badge ${card.active ? 'active' : 'inactive'}`}>
                          {card.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(card)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => viewVersions(card)}
                        >
                          Versions
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => startCreateVersion(card)}
                        >
                          New Version
                        </button>
                        {card.active ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeactivate(card.id)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(card.id)}
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Versions Modal */}
        {viewingVersionsCard && (
          <div className="modal-overlay" onClick={() => setViewingVersionsCard(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Version History: {viewingVersionsCard.procedureName}</h2>
                <button
                  className="close-btn"
                  onClick={() => setViewingVersionsCard(null)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                {isLoadingVersions ? (
                  <div className="loading">Loading versions...</div>
                ) : versions.length === 0 ? (
                  <p className="empty-state">No versions found.</p>
                ) : (
                  <div className="versions-list">
                    {versions.map((version) => (
                      <div key={version.id} className="version-item">
                        <div className="version-header">
                          <strong>Version {version.versionNumber}</strong>
                          <span className="version-date">
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="version-author">
                          Created by: {version.createdByName}
                        </div>
                        <div className="version-items">
                          <strong>Items ({version.items.length}):</strong>
                          <ul>
                            {version.items.map((item, idx) => (
                              <li key={idx}>
                                {item.catalogName} x{item.quantity}
                                {item.notes && <span className="item-notes"> - {item.notes}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Version Modal */}
        {creatingVersionCard && (
          <div className="modal-overlay" onClick={() => setCreatingVersionCard(null)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Version: {creatingVersionCard.procedureName}</h2>
                <button
                  className="close-btn"
                  onClick={() => setCreatingVersionCard(null)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="items-section">
                  <div className="items-header">
                    <h3>Items</h3>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addItem(versionItems, setVersionItems)}
                    >
                      + Add Item
                    </button>
                  </div>
                  {versionItems.length === 0 ? (
                    <p className="empty-items">No items added yet.</p>
                  ) : (
                    <div className="items-list">
                      {versionItems.map((item, index) => (
                        <div key={index} className="item-row">
                          <select
                            value={item.catalogId}
                            onChange={(e) => updateItem(index, 'catalogId', e.target.value, versionItems, setVersionItems)}
                            required
                          >
                            <option value="">Select item...</option>
                            {catalogItems.filter(c => c.active).map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1, versionItems, setVersionItems)}
                            required
                            className="qty-input"
                          />
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => updateItem(index, 'notes', e.target.value, versionItems, setVersionItems)}
                            placeholder="Notes"
                            className="notes-input"
                          />
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeItem(index, versionItems, setVersionItems)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCreateVersion}
                  >
                    Create Version
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setCreatingVersionCard(null);
                      setVersionItems([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .admin-preference-cards-page {
          padding: 2rem 0;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-card {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
          color: #2d3748;
        }

        .summary-label {
          font-size: 0.875rem;
          color: #718096;
        }

        .actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .filters select {
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .form-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .form-card h2 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 768px) {
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

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group input:disabled {
          background: #f7fafc;
          color: #718096;
        }

        .edit-note {
          color: #718096;
          font-size: 0.875rem;
          font-style: italic;
          margin: 1rem 0;
        }

        .items-section {
          margin: 1rem 0;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .items-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .items-header h3 {
          margin: 0;
          font-size: 1rem;
        }

        .empty-items {
          color: #718096;
          text-align: center;
          padding: 1rem;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .item-row {
          display: grid;
          grid-template-columns: 2fr 80px 1fr auto;
          gap: 0.5rem;
          align-items: center;
        }

        @media (max-width: 768px) {
          .item-row {
            grid-template-columns: 1fr;
          }
        }

        .qty-input {
          width: 80px !important;
        }

        .notes-input {
          min-width: 100px;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table th {
          background: #f8f9fa;
          font-weight: 600;
        }

        .data-table tr:hover {
          background: #f8f9fa;
        }

        .data-table tr.inactive-row {
          opacity: 0.6;
        }

        .name-cell {
          font-weight: 500;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.active {
          background: #c6f6d5;
          color: #276749;
        }

        .status-badge.inactive {
          background: #fed7d7;
          color: #c53030;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
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
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal.modal-lg {
          max-width: 800px;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #718096;
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .versions-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .version-item {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .version-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .version-date {
          font-size: 0.875rem;
          color: #718096;
        }

        .version-author {
          font-size: 0.875rem;
          color: #4a5568;
          margin-bottom: 0.5rem;
        }

        .version-items ul {
          margin: 0.5rem 0 0 1.5rem;
          padding: 0;
        }

        .version-items li {
          font-size: 0.875rem;
        }

        .item-notes {
          color: #718096;
          font-style: italic;
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
