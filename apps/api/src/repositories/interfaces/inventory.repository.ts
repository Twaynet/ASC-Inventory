/**
 * Inventory Repository Interface
 * Abstracts inventory item and event persistence
 */

export interface InventoryItem {
  id: string;
  facilityId: string;
  catalogId: string;
  catalogName?: string;
  category?: string;
  manufacturer?: string;
  serialNumber: string | null;
  lotNumber: string | null;
  barcode: string | null;
  locationId: string | null;
  locationName?: string | null;
  sterilityStatus: 'STERILE' | 'NON_STERILE' | 'EXPIRED' | 'UNKNOWN';
  sterilityExpiresAt: Date | null;
  availabilityStatus: 'AVAILABLE' | 'RESERVED' | 'IN_USE' | 'UNAVAILABLE' | 'MISSING';
  reservedForCaseId: string | null;
  lastVerifiedAt: Date | null;
  lastVerifiedByUserId: string | null;
  lastVerifiedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryEvent {
  id: string;
  facilityId: string;
  inventoryItemId: string;
  eventType: 'RECEIVED' | 'VERIFIED' | 'LOCATION_CHANGED' | 'RESERVED' | 'RELEASED' | 'CONSUMED' | 'EXPIRED' | 'RETURNED' | 'ADJUSTED';
  caseId: string | null;
  caseName?: string | null;
  locationId: string | null;
  locationName?: string | null;
  previousLocationId: string | null;
  previousLocationName?: string | null;
  sterilityStatus: string | null;
  notes: string | null;
  performedByUserId: string;
  performedByName?: string | null;
  deviceEventId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface CreateInventoryItemData {
  facilityId: string;
  catalogId: string;
  serialNumber?: string | null;
  lotNumber?: string | null;
  barcode?: string | null;
  locationId?: string | null;
  sterilityStatus?: 'STERILE' | 'NON_STERILE' | 'EXPIRED' | 'UNKNOWN';
  sterilityExpiresAt?: Date | null;
}

export interface UpdateInventoryItemData {
  serialNumber?: string | null;
  lotNumber?: string | null;
  barcode?: string | null;
  locationId?: string | null;
  sterilityStatus?: 'STERILE' | 'NON_STERILE' | 'EXPIRED' | 'UNKNOWN';
  sterilityExpiresAt?: Date | null;
  availabilityStatus?: 'AVAILABLE' | 'RESERVED' | 'IN_USE' | 'UNAVAILABLE' | 'MISSING';
  reservedForCaseId?: string | null;
  lastVerifiedAt?: Date | null;
  lastVerifiedByUserId?: string | null;
}

export interface CreateInventoryEventData {
  facilityId: string;
  inventoryItemId: string;
  eventType: InventoryEvent['eventType'];
  caseId?: string | null;
  locationId?: string | null;
  previousLocationId?: string | null;
  sterilityStatus?: string | null;
  notes?: string | null;
  performedByUserId: string;
  deviceEventId?: string | null;
  occurredAt?: Date;
}

export interface InventoryItemFilters {
  catalogId?: string;
  locationId?: string;
  status?: string;
}

export interface IInventoryRepository {
  // Item queries
  findById(id: string, facilityId: string): Promise<InventoryItem | null>;
  findByIdWithDetails(id: string, facilityId: string): Promise<InventoryItem | null>;
  findByBarcode(barcode: string, facilityId: string): Promise<InventoryItem | null>;
  findBySerialNumber(serialNumber: string, facilityId: string): Promise<InventoryItem | null>;
  findMany(facilityId: string, filters?: InventoryItemFilters): Promise<InventoryItem[]>;

  // Item mutations
  create(data: CreateInventoryItemData): Promise<InventoryItem>;
  update(id: string, facilityId: string, data: UpdateInventoryItemData): Promise<InventoryItem | null>;

  // Validation helpers
  barcodeExists(barcode: string, facilityId: string, excludeId?: string): Promise<boolean>;

  // Event operations (append-only)
  createEvent(data: CreateInventoryEventData): Promise<InventoryEvent>;
  createEventWithItemUpdate(
    eventData: CreateInventoryEventData,
    itemUpdate: UpdateInventoryItemData
  ): Promise<InventoryEvent>;
  getItemHistory(itemId: string, facilityId: string, limit?: number): Promise<InventoryEvent[]>;
}
