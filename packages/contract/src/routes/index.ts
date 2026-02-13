/**
 * Contract registry — aggregates all route contracts.
 */

export { caseRoutes } from './cases.js';
export { inventoryRoutes } from './inventory.js';
export { catalogRoutes } from './catalog.js';
export { operationsRoutes } from './operations.js';

import { caseRoutes } from './cases.js';
import { inventoryRoutes } from './inventory.js';
import { catalogRoutes } from './catalog.js';
import { operationsRoutes } from './operations.js';

/** The full contract registry. */
export const contract = {
  cases: caseRoutes,
  inventory: inventoryRoutes,
  catalog: catalogRoutes,
  operations: operationsRoutes,
} as const;
