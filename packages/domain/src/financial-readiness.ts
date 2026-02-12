/**
 * Financial Readiness Cache Computation (Phase 2)
 *
 * PURE DOMAIN LOGIC — deterministic, no side effects, no DB dependency.
 * Given the latest states from each source, computes the financial risk state.
 *
 * Rules (evaluated in order, first match wins):
 *   1. Override OVERRIDE_CLEARED → LOW
 *   2. Override OVERRIDE_AT_RISK → HIGH
 *   3. ASC VERIFIED_AT_RISK → HIGH
 *   4. Clinic DECLARED_AT_RISK → MEDIUM
 *   5. ASC VERIFIED_CLEARED AND clinic DECLARED_CLEARED → LOW
 *   6. Everything else → UNKNOWN (including ASC CLEARED + clinic UNKNOWN)
 */

import type { ClinicFinancialState, AscFinancialState, OverrideState, FinancialRiskState } from './types.js';

export interface FinancialReadinessInput {
  clinicState: ClinicFinancialState;
  ascState: AscFinancialState;
  overrideState: OverrideState;
}

export function computeFinancialRisk(input: FinancialReadinessInput): FinancialRiskState {
  const { clinicState, ascState, overrideState } = input;

  // Rule 1-2: Override takes precedence
  if (overrideState === 'OVERRIDE_CLEARED') return 'LOW';
  if (overrideState === 'OVERRIDE_AT_RISK') return 'HIGH';

  // Rule 3: ASC verified AT_RISK
  if (ascState === 'VERIFIED_AT_RISK') return 'HIGH';

  // Rule 4: Clinic declared AT_RISK (ASC not contradicting)
  if (clinicState === 'DECLARED_AT_RISK') return 'MEDIUM';

  // Rule 5: Both independently cleared
  if (ascState === 'VERIFIED_CLEARED' && clinicState === 'DECLARED_CLEARED') return 'LOW';

  // Rule 6: Everything else (UNKNOWN, partial data, ASC cleared + clinic unknown, etc.)
  return 'UNKNOWN';
}
