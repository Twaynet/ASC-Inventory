/**
 * Repository Factory
 *
 * Provides singleton repository instances. Currently uses PostgreSQL adapters.
 * Future: can be configured to use SQLite/offline adapters based on environment.
 */

import { IInventoryRepository, ICaseRepository, IDeviceRepository } from './interfaces/index.js';
import {
  PostgresInventoryRepository,
  PostgresCaseRepository,
  PostgresDeviceRepository,
} from './postgres/index.js';

// Singleton instances
let inventoryRepository: IInventoryRepository | null = null;
let caseRepository: ICaseRepository | null = null;
let deviceRepository: IDeviceRepository | null = null;

/**
 * Get the inventory repository instance
 */
export function getInventoryRepository(): IInventoryRepository {
  if (!inventoryRepository) {
    inventoryRepository = new PostgresInventoryRepository();
  }
  return inventoryRepository;
}

/**
 * Get the case repository instance
 */
export function getCaseRepository(): ICaseRepository {
  if (!caseRepository) {
    caseRepository = new PostgresCaseRepository();
  }
  return caseRepository;
}

/**
 * Get the device repository instance
 */
export function getDeviceRepository(): IDeviceRepository {
  if (!deviceRepository) {
    deviceRepository = new PostgresDeviceRepository();
  }
  return deviceRepository;
}

/**
 * Reset all repository instances (useful for testing)
 */
export function resetRepositories(): void {
  inventoryRepository = null;
  caseRepository = null;
  deviceRepository = null;
}

// Re-export interfaces for convenience
export * from './interfaces/index.js';
