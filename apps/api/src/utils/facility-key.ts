/**
 * Facility Key Validation
 *
 * "PLATFORM" is a reserved login key for the non-tenant control plane.
 * It must never be used as a real facility_key.
 */

const RESERVED_FACILITY_KEYS = ['PLATFORM'] as const;

/**
 * Throws if the given facility key is reserved.
 * Use at any facility-creation or facility-update boundary.
 */
export function assertNotReservedFacilityKey(facilityKey: string): void {
  if (RESERVED_FACILITY_KEYS.includes(facilityKey.toUpperCase() as any)) {
    throw Object.assign(
      new Error(`Facility key "${facilityKey}" is reserved and cannot be used.`),
      { code: 'VALIDATION_ERROR', statusCode: 400 },
    );
  }
}
