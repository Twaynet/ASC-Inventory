/**
 * @asc/contract — Canonical API contract definitions.
 *
 * Exports route contracts, envelope helpers, and the contract registry.
 */

// Core types
export type { ContractRoute, HttpMethod } from './define-route.js';
export { defineRoute } from './define-route.js';

// Envelope helpers
export { DataEnvelope, ErrorEnvelope, SuccessEnvelope } from './envelope.js';

// Route contracts & registry
export { contract, caseRoutes, inventoryRoutes, catalogRoutes } from './routes/index.js';

// Re-export schemas that consumers may need for type inference
export { CaseApiSchema, type CaseApi } from './routes/cases.js';
export { CatalogItemApiSchema, type CatalogItemApi, CatalogIdentifierApiSchema, GS1DataSchema } from './routes/catalog.js';
