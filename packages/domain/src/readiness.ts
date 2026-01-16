/**
 * Readiness Evaluation Logic
 *
 * PURE DOMAIN LOGIC - No database, no API, no device dependencies.
 * This module computes case readiness from domain data passed in.
 */

import {
  type CaseRequirement,
  type InventoryItem,
  type ItemCatalog,
  type MissingItemReason,
  type ReadinessState,
  type Attestation,
  type User,
} from './types.js';

// ============================================================================
// INPUT TYPES (what the evaluator needs)
// ============================================================================

export interface CaseForReadiness {
  id: string;
  facilityId: string;
  scheduledDate: Date;
  procedureName: string;
  surgeonId: string;
}

export interface ReadinessInput {
  case_: CaseForReadiness;
  requirements: CaseRequirement[];
  catalog: Map<string, ItemCatalog>; // catalogId -> ItemCatalog
  inventory: InventoryItem[]; // Available items for this facility
  attestations: Attestation[]; // Attestations for this case
  surgeon: User;
  cutoffDate: Date; // The day-before cutoff (sterility must be valid through this date)
}

export interface ReadinessOutput {
  caseId: string;
  readinessState: ReadinessState;
  missingItems: MissingItemReason[];
  totalRequiredItems: number;
  totalVerifiedItems: number;
  hasAttestation: boolean;
  attestedAt?: Date;
  attestedByName?: string;
  hasSurgeonAcknowledgment: boolean;
  surgeonAcknowledgedAt?: Date;
}

// ============================================================================
// READINESS RULES
// ============================================================================

/**
 * Check if an item is sterile and sterility won't expire before the case
 */
function isItemSterile(item: InventoryItem, cutoffDate: Date): boolean {
  if (item.sterilityStatus !== 'STERILE') {
    return false;
  }
  if (item.sterilityExpiresAt && item.sterilityExpiresAt < cutoffDate) {
    return false;
  }
  return true;
}

/**
 * Check if an item is available for reservation
 */
function isItemAvailable(item: InventoryItem, caseId: string): boolean {
  // Available if: AVAILABLE status, or already reserved for THIS case
  if (item.availabilityStatus === 'AVAILABLE') {
    return true;
  }
  if (item.availabilityStatus === 'RESERVED' && item.reservedForCaseId === caseId) {
    return true;
  }
  return false;
}

/**
 * Check if an item is locatable (has a known location)
 */
function isItemLocatable(item: InventoryItem): boolean {
  return item.locationId !== undefined && item.locationId !== null;
}

/**
 * Check if an item has been verified recently
 * For v1.1, "verified" means lastVerifiedAt is set.
 * Future: could add time-based expiration of verification.
 */
function isItemVerified(item: InventoryItem): boolean {
  return item.lastVerifiedAt !== undefined && item.lastVerifiedAt !== null;
}

// ============================================================================
// CORE EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate case readiness.
 *
 * Readiness States:
 * - GREEN: All required items verified, locatable, sterile (if required), and available
 * - ORANGE: Some items not yet verified (pending verification)
 * - RED: Missing items, sterility issues, or availability issues
 */
export function evaluateCaseReadiness(input: ReadinessInput): ReadinessOutput {
  const { case_, requirements, catalog, inventory, attestations, cutoffDate } = input;

  const missingItems: MissingItemReason[] = [];
  let totalRequired = 0;
  let totalVerified = 0;

  // Group inventory by catalogId for efficient lookup
  const inventoryByCatalog = new Map<string, InventoryItem[]>();
  for (const item of inventory) {
    const existing = inventoryByCatalog.get(item.catalogId) || [];
    existing.push(item);
    inventoryByCatalog.set(item.catalogId, existing);
  }

  // Evaluate each requirement
  for (const req of requirements) {
    const catalogItem = catalog.get(req.catalogId);
    if (!catalogItem) {
      // Catalog item doesn't exist - critical error
      missingItems.push({
        catalogId: req.catalogId,
        catalogName: '[Unknown Item]',
        requiredQuantity: req.quantity,
        availableQuantity: 0,
        reason: 'NOT_IN_INVENTORY',
      });
      totalRequired += req.quantity;
      continue;
    }

    totalRequired += req.quantity;

    const availableItems = inventoryByCatalog.get(req.catalogId) || [];

    // Filter to items that meet ALL criteria
    const suitableItems = availableItems.filter(item => {
      // Must be available for this case
      if (!isItemAvailable(item, case_.id)) {
        return false;
      }
      // Must be locatable
      if (!isItemLocatable(item)) {
        return false;
      }
      // If item requires sterility, must be sterile
      if (catalogItem.requiresSterility && !isItemSterile(item, cutoffDate)) {
        return false;
      }
      return true;
    });

    const verifiedSuitableItems = suitableItems.filter(isItemVerified);

    if (suitableItems.length < req.quantity) {
      // Not enough suitable items - determine why
      const reason = determineShortageReason(
        availableItems,
        req.quantity,
        case_.id,
        catalogItem,
        cutoffDate
      );
      missingItems.push({
        catalogId: req.catalogId,
        catalogName: catalogItem.name,
        requiredQuantity: req.quantity,
        availableQuantity: suitableItems.length,
        reason,
      });
    } else {
      // We have enough items
      totalVerified += Math.min(verifiedSuitableItems.length, req.quantity);
    }
  }

  // Determine readiness state
  let readinessState: ReadinessState;
  if (missingItems.length > 0) {
    readinessState = 'RED';
  } else if (totalVerified < totalRequired) {
    readinessState = 'ORANGE';
  } else {
    readinessState = 'GREEN';
  }

  // Check attestations
  const caseReadinessAttestations = attestations.filter(
    a => a.caseId === case_.id && a.type === 'CASE_READINESS'
  );
  const surgeonAcknowledgments = attestations.filter(
    a => a.caseId === case_.id && a.type === 'SURGEON_ACKNOWLEDGMENT'
  );

  const latestAttestation = caseReadinessAttestations.length > 0
    ? caseReadinessAttestations.reduce((a, b) => a.createdAt > b.createdAt ? a : b)
    : undefined;

  const latestAcknowledgment = surgeonAcknowledgments.length > 0
    ? surgeonAcknowledgments.reduce((a, b) => a.createdAt > b.createdAt ? a : b)
    : undefined;

  return {
    caseId: case_.id,
    readinessState,
    missingItems,
    totalRequiredItems: totalRequired,
    totalVerifiedItems: totalVerified,
    hasAttestation: latestAttestation !== undefined,
    attestedAt: latestAttestation?.createdAt,
    attestedByName: undefined, // Caller must resolve user name
    hasSurgeonAcknowledgment: latestAcknowledgment !== undefined,
    surgeonAcknowledgedAt: latestAcknowledgment?.createdAt,
  };
}

/**
 * Determine the primary reason for item shortage
 */
function determineShortageReason(
  availableItems: InventoryItem[],
  requiredQuantity: number,
  caseId: string,
  catalogItem: ItemCatalog,
  cutoffDate: Date
): MissingItemReason['reason'] {
  if (availableItems.length === 0) {
    return 'NOT_IN_INVENTORY';
  }

  // Count items failing each criterion
  let notAvailable = 0;
  let notLocatable = 0;
  let notSterile = 0;
  let sterilityExpired = 0;

  for (const item of availableItems) {
    if (!isItemAvailable(item, caseId)) {
      notAvailable++;
      continue;
    }
    if (!isItemLocatable(item)) {
      notLocatable++;
      continue;
    }
    if (catalogItem.requiresSterility) {
      if (item.sterilityStatus !== 'STERILE') {
        notSterile++;
        continue;
      }
      if (item.sterilityExpiresAt && item.sterilityExpiresAt < cutoffDate) {
        sterilityExpired++;
        continue;
      }
    }
  }

  // Return the most critical/common reason
  if (notAvailable > 0 && notAvailable >= availableItems.length / 2) {
    return 'NOT_AVAILABLE';
  }
  if (notLocatable > 0 && notLocatable >= availableItems.length / 2) {
    return 'NOT_LOCATABLE';
  }
  if (sterilityExpired > 0) {
    return 'STERILITY_EXPIRED';
  }
  if (notSterile > 0) {
    return 'NOT_STERILE';
  }
  if (availableItems.length < requiredQuantity) {
    return 'INSUFFICIENT_QUANTITY';
  }
  return 'NOT_VERIFIED';
}

// ============================================================================
// BATCH EVALUATION (for day-before screen)
// ============================================================================

export interface BatchReadinessInput {
  cases: CaseForReadiness[];
  requirementsByCase: Map<string, CaseRequirement[]>;
  catalog: Map<string, ItemCatalog>;
  inventory: InventoryItem[];
  attestationsByCase: Map<string, Attestation[]>;
  surgeons: Map<string, User>;
  cutoffDate: Date;
}

export function evaluateBatchReadiness(input: BatchReadinessInput): ReadinessOutput[] {
  const results: ReadinessOutput[] = [];

  for (const case_ of input.cases) {
    const requirements = input.requirementsByCase.get(case_.id) || [];
    const attestations = input.attestationsByCase.get(case_.id) || [];
    const surgeon = input.surgeons.get(case_.surgeonId);

    if (!surgeon) {
      // Should not happen in production - log and skip
      continue;
    }

    const result = evaluateCaseReadiness({
      case_,
      requirements,
      catalog: input.catalog,
      inventory: input.inventory,
      attestations,
      surgeon,
      cutoffDate: input.cutoffDate,
    });

    results.push(result);
  }

  return results;
}
