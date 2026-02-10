/**
 * Repository Factory
 *
 * Provides singleton repository instances. Currently uses PostgreSQL adapters.
 * Future: can be configured to use SQLite/offline adapters based on environment.
 */

import { IInventoryRepository, ICaseRepository, IDeviceRepository, IVendorRepository, ILoanerSetRepository, IOrganizationRepository } from './interfaces/index.js';
import {
  PostgresInventoryRepository,
  PostgresCaseRepository,
  PostgresDeviceRepository,
  PostgresVendorRepository,
  PostgresLoanerSetRepository,
  PostgresOrganizationRepository,
} from './postgres/index.js';

// Singleton instances
let inventoryRepository: IInventoryRepository | null = null;
let caseRepository: ICaseRepository | null = null;
let deviceRepository: IDeviceRepository | null = null;
let vendorRepository: IVendorRepository | null = null;
let loanerSetRepository: ILoanerSetRepository | null = null;
let organizationRepository: IOrganizationRepository | null = null;

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
 * Get the vendor repository instance
 * Wave 1: Financial Attribution
 */
export function getVendorRepository(): IVendorRepository {
  if (!vendorRepository) {
    vendorRepository = new PostgresVendorRepository();
  }
  return vendorRepository;
}

/**
 * Get the loaner set repository instance
 * Wave 1: Financial Attribution
 */
export function getLoanerSetRepository(): ILoanerSetRepository {
  if (!loanerSetRepository) {
    loanerSetRepository = new PostgresLoanerSetRepository();
  }
  return loanerSetRepository;
}

/**
 * Get the organization repository instance
 * PHI Phase 1: Organization model
 */
export function getOrganizationRepository(): IOrganizationRepository {
  if (!organizationRepository) {
    organizationRepository = new PostgresOrganizationRepository();
  }
  return organizationRepository;
}

/**
 * Reset all repository instances (useful for testing)
 */
export function resetRepositories(): void {
  inventoryRepository = null;
  caseRepository = null;
  deviceRepository = null;
  vendorRepository = null;
  loanerSetRepository = null;
  organizationRepository = null;
}

// Re-export interfaces for convenience
export * from './interfaces/index.js';
