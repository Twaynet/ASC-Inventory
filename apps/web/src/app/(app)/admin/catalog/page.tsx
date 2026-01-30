'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/app/components/Header';
import { PageAlerts } from '@/app/components/Alert';
import { StatusBadge } from '@/app/components/StatusBadge';
import { usePageData, withErrorHandling } from '@/lib/hooks/usePageData';
import {
  getCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  deactivateCatalogItem,
  activateCatalogItem,
  getCatalogImages,
  addCatalogImageByUrl,
  uploadCatalogImage,
  updateCatalogImage,
  deleteCatalogImage,
  getCatalogIdentifiers,
  addCatalogIdentifier,
  deleteCatalogIdentifier,
  resolveAssetUrl,
  type CatalogItem,
  type CatalogImage,
  type CatalogIdentifier,
  type ItemCategory,
  type CreateCatalogItemRequest,
  type UpdateCatalogItemRequest,
} from '@/lib/api';

// LAW catalog.md v2.0 §4A: Engine Category
const CATEGORIES: ItemCategory[] = ['IMPLANT', 'INSTRUMENT', 'EQUIPMENT', 'MEDICATION', 'CONSUMABLE', 'PPE'];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  IMPLANT: 'Implant',
  INSTRUMENT: 'Instrument',
  EQUIPMENT: 'Equipment',
  MEDICATION: 'Medication',
  CONSUMABLE: 'Consumable',
  PPE: 'PPE',
};

const CATEGORY_COLORS: Record<ItemCategory, { bg: string; color: string }> = {
  IMPLANT: { bg: '#feebc8', color: '#c05621' },      // Orange
  INSTRUMENT: { bg: '#bee3f8', color: '#2b6cb0' },   // Blue
  EQUIPMENT: { bg: '#c6f6d5', color: '#276749' },    // Green
  MEDICATION: { bg: '#fed7e2', color: '#c53030' },   // Red
  CONSUMABLE: { bg: '#e9d8fd', color: '#6b46c1' },   // Purple
  PPE: { bg: '#faf089', color: '#975a16' },          // Yellow
};

export default function AdminCatalogPage() {
  // Filter state (managed locally since it affects data fetching)
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ItemCategory | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Sort state
  type SortColumn = 'category' | 'manufacturer' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction or clear sort
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Use shared hook for data loading, auth, and error handling
  const {
    data,
    isLoading,
    isLoadingData,
    error,
    successMessage,
    setError,
    setSuccessMessage,
    clearError,
    clearSuccess,
    refetch,
    user,
    token,
    accessDenied,
  } = usePageData({
    fetchFn: async (token) => {
      const result = await getCatalogItems(token, {
        category: filterCategory || undefined,
        includeInactive: showInactive,
      });
      return result.items;
    },
    requiredRoles: ['ADMIN'],
    deps: [showInactive, filterCategory],
  });

  const items = data || [];

  // Filter items by search term (client-side)
  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      (item.manufacturer?.toLowerCase().includes(term)) ||
      (item.catalogNumber?.toLowerCase().includes(term))
    );
  });

  // Sort filtered items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortColumn) return 0;

    let comparison = 0;
    if (sortColumn === 'category') {
      // Sort by category label for user-friendly ordering
      const labelA = CATEGORY_LABELS[a.category];
      const labelB = CATEGORY_LABELS[b.category];
      comparison = labelA.localeCompare(labelB);
    } else if (sortColumn === 'manufacturer') {
      // Sort by manufacturer, treating null/empty as last
      const mfgA = a.manufacturer || '';
      const mfgB = b.manufacturer || '';
      if (!mfgA && mfgB) return sortDirection === 'asc' ? 1 : -1;
      if (mfgA && !mfgB) return sortDirection === 'asc' ? -1 : 1;
      comparison = mfgA.localeCompare(mfgB);
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [formData, setFormData] = useState<Partial<CreateCatalogItemRequest>>({});

  // Images modal state
  const [imagesItem, setImagesItem] = useState<CatalogItem | null>(null);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageTab, setImageTab] = useState<'url' | 'upload'>('url');
  const [imageUrl, setImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState('');

  // Identifiers state (works in both create and edit modes)
  const [identifiers, setIdentifiers] = useState<CatalogIdentifier[]>([]);
  const [pendingIdentifiers, setPendingIdentifiers] = useState<string[]>([]);
  const [identifierInput, setIdentifierInput] = useState('');
  const [loadingIdentifiers, setLoadingIdentifiers] = useState(false);

  const loadIdentifiers = async (catalogId: string) => {
    if (!token) return;
    setLoadingIdentifiers(true);
    try {
      const res = await getCatalogIdentifiers(token, catalogId);
      setIdentifiers(res.identifiers);
    } catch {
      // ignore
    } finally {
      setLoadingIdentifiers(false);
    }
  };

  const handleAddIdentifier = async () => {
    if (!identifierInput.trim()) return;
    if (editingItem && token) {
      // Edit mode: save to API immediately
      try {
        const res = await addCatalogIdentifier(token, editingItem.id, {
          rawValue: identifierInput.trim(),
          source: 'manual',
        });
        setIdentifiers(prev => [...prev, res.identifier]);
        setIdentifierInput('');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to add identifier';
        alert(message);
      }
    } else {
      // Create mode: queue locally
      const val = identifierInput.trim();
      if (!pendingIdentifiers.includes(val)) {
        setPendingIdentifiers(prev => [...prev, val]);
      }
      setIdentifierInput('');
    }
  };

  const handleDeleteIdentifier = async (identifierId: string) => {
    if (!token || !editingItem) return;
    try {
      await deleteCatalogIdentifier(token, editingItem.id, identifierId);
      setIdentifiers(prev => prev.filter(i => i.id !== identifierId));
    } catch {
      alert('Failed to delete identifier');
    }
  };

  const handleRemovePendingIdentifier = (value: string) => {
    setPendingIdentifiers(prev => prev.filter(v => v !== value));
  };

  const openImagesModal = async (item: CatalogItem) => {
    setImagesItem(item);
    setImages([]);
    setLoadingImages(true);
    setImageUrl('');
    setImageCaption('');
    setImageTab('url');
    try {
      if (token) {
        const result = await getCatalogImages(token, item.id);
        setImages(result.images);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoadingImages(false);
    }
  };

  const handleAddImageByUrl = async () => {
    if (!token || !imagesItem || !imageUrl.trim()) return;
    setUploadingImage(true);
    try {
      const result = await addCatalogImageByUrl(token, imagesItem.id, {
        assetUrl: imageUrl.trim(),
        caption: imageCaption.trim() || undefined,
      });
      setImages(prev => [...prev, result.image]);
      setImageUrl('');
      setImageCaption('');
      setSuccessMessage('Image added');
      refetch(); // Update catalog list to reflect new image count
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add image');
    } finally {
      setUploadingImage(false);
    }
  };

  const MAX_FILE_SIZE_MB = 3; // LAW-compliant limit
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!token || !imagesItem || !file) return;

    // Client-side file size validation
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const result = await uploadCatalogImage(token, imagesItem.id, file, {
        caption: imageCaption.trim() || undefined,
      });
      setImages(prev => [...prev, result.image]);
      setImageCaption('');
      setSuccessMessage('Image uploaded');
      refetch(); // Update catalog list to reflect new image count
      // Reset file input
      e.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!token || !imagesItem) return;
    if (!confirm('Delete this image?')) return;
    try {
      await deleteCatalogImage(token, imagesItem.id, imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
      setSuccessMessage('Image deleted');
      refetch(); // Update catalog list to reflect new image count
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
    }
  };

  const startEditCaption = (img: CatalogImage) => {
    setEditingImageId(img.id);
    setEditingCaption(img.caption || '');
  };

  const handleSaveCaption = async () => {
    if (!token || !imagesItem || !editingImageId) return;
    try {
      const result = await updateCatalogImage(token, imagesItem.id, editingImageId, {
        caption: editingCaption.trim() || undefined,
      });
      setImages(prev => prev.map(img => img.id === editingImageId ? result.image : img));
      setEditingImageId(null);
      setEditingCaption('');
      setSuccessMessage('Caption updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update caption');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    await withErrorHandling(
      () => createCatalogItem(token, formData as CreateCatalogItemRequest),
      setError,
      async (result: { item: CatalogItem }) => {
        // Add any pending identifiers to the newly created item
        if (pendingIdentifiers.length > 0) {
          for (const rawValue of pendingIdentifiers) {
            try {
              await addCatalogIdentifier(token, result.item.id, { rawValue, source: 'manual' });
            } catch {
              // best-effort; item was already created
            }
          }
        }
        setSuccessMessage('Catalog item created successfully');
        setShowCreateForm(false);
        setFormData({});
        setPendingIdentifiers([]);
        setIdentifierInput('');
        refetch();
      }
    );
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingItem) return;

    const updateData: UpdateCatalogItemRequest = {};
    if (formData.name && formData.name !== editingItem.name) {
      updateData.name = formData.name;
    }
    if (formData.description !== editingItem.description) {
      updateData.description = formData.description || null;
    }
    if (formData.category && formData.category !== editingItem.category) {
      updateData.category = formData.category;
    }
    if (formData.manufacturer !== editingItem.manufacturer) {
      updateData.manufacturer = formData.manufacturer || null;
    }
    if (formData.catalogNumber !== editingItem.catalogNumber) {
      updateData.catalogNumber = formData.catalogNumber || null;
    }
    if (formData.requiresSterility !== editingItem.requiresSterility) {
      updateData.requiresSterility = formData.requiresSterility;
    }
    if (formData.isLoaner !== editingItem.isLoaner) {
      updateData.isLoaner = formData.isLoaner;
    }

    await withErrorHandling(
      () => updateCatalogItem(token, editingItem.id, updateData),
      setError,
      () => {
        setSuccessMessage('Catalog item updated successfully');
        setEditingItem(null);
        setFormData({});
        refetch();
      }
    );
  };

  const handleDeactivate = async (itemId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to deactivate this catalog item?')) return;

    await withErrorHandling(
      () => deactivateCatalogItem(token, itemId),
      setError,
      () => {
        setSuccessMessage('Catalog item deactivated successfully');
        refetch();
      }
    );
  };

  const handleActivate = async (itemId: string) => {
    if (!token) return;

    await withErrorHandling(
      () => activateCatalogItem(token, itemId),
      setError,
      () => {
        setSuccessMessage('Catalog item activated successfully');
        refetch();
      }
    );
  };

  const startEdit = (item: CatalogItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      category: item.category,
      manufacturer: item.manufacturer || '',
      catalogNumber: item.catalogNumber || '',
      requiresSterility: item.requiresSterility,
      isLoaner: item.isLoaner,
    });
    setShowCreateForm(false);
    loadIdentifiers(item.id);
  };

  // Compute counts by category
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat).length;
    return acc;
  }, {} as Record<ItemCategory, number>);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (accessDenied) {
    return (
      <>
        <Header title="Catalog Management" />
        <main className="container-full">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Catalog Management" />

      <main className="container admin-catalog-page">
        <PageAlerts
          error={error}
          success={successMessage}
          onDismissError={clearError}
          onDismissSuccess={clearSuccess}
        />

        <div className="catalog-nav">
          <Link href="/admin/catalog" className="nav-link active">Items</Link>
          <Link href="/admin/catalog/groups" className="nav-link">Groups</Link>
          <Link href="/admin/catalog/sets" className="nav-link">Set Definitions</Link>
        </div>

        <div className="summary-cards">
          {CATEGORIES.map(cat => (
            <div
              key={cat}
              className={`summary-card ${filterCategory === cat ? 'selected' : ''}`}
              onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              style={{
                borderColor: filterCategory === cat ? CATEGORY_COLORS[cat].color : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="summary-value"
                style={{ color: CATEGORY_COLORS[cat].color }}
              >
                {categoryCounts[cat]}
              </div>
              <div className="summary-label">{CATEGORY_LABELS[cat]}</div>
            </div>
          ))}
        </div>

        <div className="actions-bar">
          <div className="actions-left">
            <button
              className="btn btn-create"
              onClick={() => {
                setShowCreateForm(true);
                setEditingItem(null);
                setFormData({});
                setPendingIdentifiers([]);
                setIdentifiers([]);
                setIdentifierInput('');
              }}
            >
              + Add Catalog Item
            </button>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name, manufacturer, or catalog #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button
                  className="search-clear"
                  onClick={() => setSearchTerm('')}
                  title="Clear search"
                >
                  x
                </button>
              )}
            </div>
          </div>
          <div className="actions-right">
            <button
              type="button"
              className={`pill-toggle ${showInactive ? 'selected' : ''}`}
              onClick={() => setShowInactive(!showInactive)}
            >
              Show Inactive
            </button>
            {(filterCategory || searchTerm) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilterCategory('');
                  setSearchTerm('');
                }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Create/Edit Modal */}
        {(showCreateForm || editingItem) && (
          <div className="modal-overlay" onClick={() => { setShowCreateForm(false); setEditingItem(null); setFormData({}); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingItem ? 'Edit Catalog Item' : 'Create Catalog Item'}</h2>
                <button
                  className="modal-close"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingItem(null);
                    setFormData({});
                  }}
                >
                  &times;
                </button>
              </div>
              <form onSubmit={editingItem ? handleUpdate : handleCreate} className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Hip Prosthesis Model X"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                      required
                    >
                      <option value="">Select category...</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Manufacturer</label>
                    <input
                      type="text"
                      value={formData.manufacturer || ''}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                      placeholder="e.g., Stryker"
                    />
                  </div>
                  <div className="form-group">
                    <label>Catalog Number</label>
                    <input
                      type="text"
                      value={formData.catalogNumber || ''}
                      onChange={(e) => setFormData({ ...formData, catalogNumber: e.target.value })}
                      placeholder="e.g., SKU-12345"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>
                <div className="form-group">
                  <label>Identifiers &amp; Barcodes</label>
                  <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem 0' }}>
                    Reference identifiers for human recognition only.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      value={identifierInput}
                      onChange={(e) => setIdentifierInput(e.target.value)}
                      placeholder="Scan or paste barcode/GTIN..."
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIdentifier(); } }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAddIdentifier}
                      disabled={!identifierInput.trim()}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Add
                    </button>
                  </div>
                  {/* Edit mode: show saved identifiers from API */}
                  {editingItem && (loadingIdentifiers ? (
                    <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading...</p>
                  ) : identifiers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {identifiers.map(ident => (
                        <div key={ident.id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.35rem 0.5rem', background: '#f5f5f5', borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}>
                          <span style={{
                            background: ident.identifierType === 'GTIN' ? '#2563eb' : ident.identifierType === 'UPC' ? '#7c3aed' : '#6b7280',
                            color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 600,
                          }}>
                            {ident.identifierType}
                          </span>
                          <span style={{ flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ident.rawValue}
                          </span>
                          <span style={{ color: '#888', fontSize: '0.75rem' }}>{ident.classification}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteIdentifier(ident.id)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px' }}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null)}
                  {/* Create mode: show pending identifiers queued locally */}
                  {!editingItem && pendingIdentifiers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {pendingIdentifiers.map(val => (
                        <div key={val} style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.35rem 0.5rem', background: '#f5f5f5', borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}>
                          <span style={{
                            background: '#6b7280',
                            color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 600,
                          }}>
                            PENDING
                          </span>
                          <span style={{ flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {val}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePendingIdentifier(val)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px' }}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {editingItem && identifiers.length === 0 && !loadingIdentifiers && (
                    <p style={{ fontSize: '0.85rem', color: '#888' }}>No identifiers added yet.</p>
                  )}
                  {!editingItem && pendingIdentifiers.length === 0 && (
                    <p style={{ fontSize: '0.85rem', color: '#888' }}>No identifiers added yet. Will be saved when item is created.</p>
                  )}
                </div>
                <div className="form-group">
                  <label>Item Properties</label>
                  <div className="pill-toggle-group">
                    <button
                      type="button"
                      className={`pill-toggle ${formData.requiresSterility ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, requiresSterility: !formData.requiresSterility })}
                    >
                      Requires Sterility
                    </button>
                    <button
                      type="button"
                      className={`pill-toggle ${formData.isLoaner ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, isLoaner: !formData.isLoaner })}
                    >
                      Loaner Item
                    </button>
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingItem(null);
                      setFormData({});
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingItem ? 'Save Changes' : 'Create Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Images Modal */}
        {imagesItem && (
          <div className="modal-overlay" onClick={() => setImagesItem(null)}>
            <div className="modal images-modal" onClick={e => e.stopPropagation()}>
              <h2>Images: {imagesItem.name}</h2>
              <p className="images-notice">
                Images are for reference only. They do not verify inventory or readiness.
              </p>

              {/* Tab Selector */}
              <div className="image-tabs">
                <button
                  type="button"
                  className={`tab-btn ${imageTab === 'url' ? 'active' : ''}`}
                  onClick={() => setImageTab('url')}
                >
                  Add by URL
                </button>
                <button
                  type="button"
                  className={`tab-btn ${imageTab === 'upload' ? 'active' : ''}`}
                  onClick={() => setImageTab('upload')}
                >
                  Upload Image
                </button>
              </div>

              {/* Add Image Form */}
              <div className="add-image-form">
                <div className="form-group">
                  <label>Caption (optional)</label>
                  <input
                    type="text"
                    value={imageCaption}
                    onChange={e => setImageCaption(e.target.value)}
                    placeholder="Optional caption for this image"
                  />
                </div>

                {imageTab === 'url' ? (
                  <div className="form-row">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="url-input"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAddImageByUrl}
                      disabled={uploadingImage || !imageUrl.trim()}
                    >
                      {uploadingImage ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ) : (
                  <div className="upload-section">
                    <div className="form-row">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleUploadImage}
                        disabled={uploadingImage}
                        className="file-input"
                      />
                      {uploadingImage && <span className="uploading-text">Uploading...</span>}
                    </div>
                    <div className="upload-hint">
                      JPEG, PNG, or WebP. Maximum {MAX_FILE_SIZE_MB}MB.
                    </div>
                  </div>
                )}
              </div>

              {/* Image List */}
              <div className="images-list">
                {loadingImages ? (
                  <div className="loading-images">Loading images...</div>
                ) : images.length === 0 ? (
                  <div className="no-images">No images yet. Add one above.</div>
                ) : (
                  images.map(img => (
                    <div key={img.id} className="image-item">
                      <a
                        href={resolveAssetUrl(img.assetUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="image-thumbnail"
                        title="Click to view full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveAssetUrl(img.assetUrl)}
                          alt={img.caption || 'Catalog image'}
                          referrerPolicy="no-referrer"
                        />
                      </a>
                      <div className="image-info">
                        {editingImageId === img.id ? (
                          <div className="caption-edit">
                            <input
                              type="text"
                              value={editingCaption}
                              onChange={e => setEditingCaption(e.target.value)}
                              placeholder="Enter caption"
                              className="caption-input"
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={handleSaveCaption}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingImageId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div
                            className="image-caption clickable"
                            onClick={() => startEditCaption(img)}
                            title="Click to edit caption"
                          >
                            {img.caption || '(click to add caption)'}
                          </div>
                        )}
                        <div className="image-meta">
                          <span className={`image-kind ${img.kind.toLowerCase()}`}>{img.kind}</span>
                          <span className="image-source">{img.source}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteImage(img.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setImagesItem(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Catalog Table */}
        {isLoadingData ? (
          <div className="loading">Loading catalog items...</div>
        ) : (
          <div className="table-container">
            <div className="table-header">
              <span className="result-count">
                {filteredItems.length === items.length
                  ? `${items.length} item${items.length !== 1 ? 's' : ''}`
                  : `${filteredItems.length} of ${items.length} items`}
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th
                    className="sortable-header"
                    onClick={() => handleSort('category')}
                  >
                    Category
                    <span className="sort-indicator">
                      {sortColumn === 'category' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </th>
                  <th
                    className="sortable-header"
                    onClick={() => handleSort('manufacturer')}
                  >
                    Manufacturer
                    <span className="sort-indicator">
                      {sortColumn === 'manufacturer' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </th>
                  <th>Catalog #</th>
                  <th>Sterility</th>
                  <th>Loaner</th>
                  <th>Inventory</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      {searchTerm || filterCategory
                        ? 'No items match your search or filter criteria.'
                        : 'No catalog items found. Create your first item to get started.'}
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((item) => (
                    <tr key={item.id} className={!item.active ? 'inactive-row' : ''}>
                      <td className="name-cell">{item.name}</td>
                      <td>
                        <span
                          className="category-badge"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category].bg,
                            color: CATEGORY_COLORS[item.category].color,
                          }}
                        >
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td>{item.manufacturer || '-'}</td>
                      <td className="catalog-number">
                        {item.catalogNumber || '-'}
                        {item.identifierCount > 0 && (
                          <span style={{
                            marginLeft: '0.35rem',
                            background: '#2563eb',
                            color: '#fff',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}>
                            {item.identifierCount} ID{item.identifierCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td>{item.requiresSterility ? 'Yes' : 'No'}</td>
                      <td>{item.isLoaner ? 'Yes' : 'No'}</td>
                      <td>{item.inventoryCount}</td>
                      <td>
                        <StatusBadge
                          status={item.active ? 'ACTIVE' : 'INACTIVE'}
                          size="sm"
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          className={`btn btn-sm ${item.imageCount > 0 ? 'btn-has-images' : 'btn-secondary'}`}
                          onClick={() => openImagesModal(item)}
                        >
                          Images{item.imageCount > 0 ? ` (${item.imageCount})` : ''}
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <style jsx>{`
        .admin-catalog-page {
          padding: 2rem 0;
        }

        .catalog-nav {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.75rem;
        }

        .catalog-nav :global(.nav-link) {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          text-decoration: none;
          color: #4a5568;
          font-weight: 500;
          transition: background 0.2s, color 0.2s;
        }

        .catalog-nav :global(.nav-link:hover) {
          background: #f8f9fa;
        }

        .catalog-nav :global(.nav-link.active) {
          background: #4299e1;
          color: white;
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
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .summary-card:hover {
          border-color: #e2e8f0;
        }

        .summary-card.selected {
          border-width: 2px;
        }

        .summary-value {
          font-size: 2rem;
          font-weight: 700;
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

        .actions-left {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .actions-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .search-box {
          position: relative;
          min-width: 280px;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem 2rem 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .search-input:focus {
          outline: none;
          border-color: #4299e1;
          box-shadow: 0 0 0 1px #4299e1;
        }

        .search-clear {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #a0aec0;
          cursor: pointer;
          font-size: 1rem;
          padding: 0.25rem;
          line-height: 1;
        }

        .search-clear:hover {
          color: #718096;
        }

        /* Modal Styles */
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
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
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
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #718096;
          padding: 0;
          line-height: 1;
        }

        .modal-close:hover {
          color: #1a202c;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding-top: 1rem;
          margin-top: 1rem;
          border-top: 1px solid #e2e8f0;
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
          color: #374151;
        }

        .form-group input[type="text"],
        .form-group input[type="email"],
        .form-group select {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 1rem;
          background: white;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4299e1;
          box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
        }

        /* Pill Toggle Styles */
        .pill-toggle-group {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .pill-toggle {
          display: inline-flex;
          align-items: center;
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 9999px;
          border: 1px solid #d1d5db;
          background: #f9fafb;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pill-toggle:hover {
          background: #e5e7eb;
          border-color: #9ca3af;
        }

        .pill-toggle.selected {
          background: #4299e1;
          border-color: #4299e1;
          color: white;
        }

        .pill-toggle.selected:hover {
          background: #3182ce;
          border-color: #3182ce;
        }

        .table-container {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow-x: auto;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .result-count {
          font-size: 0.875rem;
          color: #718096;
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

        .sortable-header {
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }

        .sortable-header:hover {
          background: #edf2f7;
        }

        .sort-indicator {
          font-size: 0.75rem;
          color: #4299e1;
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

        .catalog-number {
          font-family: monospace;
        }

        .category-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          color: #718096;
          padding: 2rem !important;
        }

        .actions-cell {
          display: flex;
          gap: 0.5rem;
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

        .btn-has-images {
          background: #4299e1;
          color: white;
        }

        .btn-has-images:hover {
          background: #3182ce;
        }

        /* Images Modal Styles */
        .images-modal {
          max-width: 700px;
          max-height: 80vh;
          overflow-y: auto;
          padding: 1.5rem;
        }

        .images-notice {
          font-size: 0.875rem;
          color: #718096;
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: #f7fafc;
          border-radius: 4px;
        }

        .image-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .tab-btn {
          padding: 0.5rem 1rem;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .tab-btn.active {
          background: #4299e1;
          color: white;
          border-color: #4299e1;
        }

        .add-image-form {
          background: #f7fafc;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .form-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .url-input {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
        }

        .file-input {
          flex: 1;
        }

        .uploading-text {
          color: #4299e1;
          font-size: 0.875rem;
        }

        .upload-hint {
          font-size: 0.75rem;
          color: #718096;
          margin-top: 0.5rem;
        }

        .images-list {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .loading-images,
        .no-images {
          padding: 2rem;
          text-align: center;
          color: #718096;
        }

        .image-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .image-item:last-child {
          border-bottom: none;
        }

        .image-thumbnail {
          width: 60px;
          height: 60px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          display: block;
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .image-thumbnail:hover {
          border-color: #4299e1;
        }

        .image-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .image-info {
          flex: 1;
          min-width: 0;
        }

        .image-caption {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .image-caption.clickable {
          cursor: pointer;
          color: #4299e1;
        }

        .image-caption.clickable:hover {
          text-decoration: underline;
        }

        .caption-edit {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .caption-input {
          flex: 1;
          padding: 0.25rem 0.5rem;
          border: 1px solid #4299e1;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .image-meta {
          display: flex;
          gap: 0.5rem;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .image-kind {
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          background: #e2e8f0;
          color: #4a5568;
        }

        .image-kind.primary {
          background: #c6f6d5;
          color: #276749;
        }

        .image-source {
          color: #718096;
        }
      `}</style>
    </>
  );
}
