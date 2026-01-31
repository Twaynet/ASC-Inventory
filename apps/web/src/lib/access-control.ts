/**
 * Access Control System for ASC Inventory
 *
 * Supports multi-role users in cross-trained ASC environments.
 * Access = UNION of all capabilities from all assigned roles.
 */

import {
  type UserRole,
  type Capability,
  ROLE_CAPABILITIES,
  deriveCapabilities as _domainDeriveCapabilities,
} from '@asc/domain';

// Re-export canonical types so existing consumers don't break
export type { Capability };
export type Role = UserRole;
export { ROLE_CAPABILITIES };

// --- Feature Definitions ---
export interface FeatureDefinition {
  id: string;
  title: string;
  description: string;
  path: string | null; // null for contextual features
  group: 'core' | 'case-workflows' | 'admin';
  requiredRoles?: Role[];
  requiredCapabilities?: Capability[];
  isContextual?: boolean; // requires caseId
  contextualNote?: string;
  badge?: string;
  notes?: string;
}

export const FEATURES: FeatureDefinition[] = [
  // --- Core (all authenticated) ---
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'View surgical schedule by day, week, or month',
    path: '/calendar',
    group: 'core',
  },
  {
    id: 'case-requests',
    title: 'Case Requests',
    description: 'Request new surgical cases and view your submissions',
    path: '/cases',
    group: 'core',
  },
  {
    id: 'preference-cards',
    title: 'Surgeon Preference Cards',
    description: 'Manage surgeon preference cards (SPCs)',
    path: '/preference-cards',
    group: 'core',
  },
  {
    id: 'pending-reviews',
    title: 'My Pending Reviews',
    description: 'View your pending review items',
    path: '/pending-reviews',
    group: 'core',
  },
  {
    id: 'surgeon-checklists',
    title: 'My Checklists',
    description: 'View your completed checklists and add feedback',
    path: '/surgeon/my-checklists',
    group: 'core',
    requiredRoles: ['SURGEON'],
  },
  {
    id: 'unassigned-cases',
    title: 'Unassigned Cases',
    description: 'View scheduled cases not yet assigned to a room',
    path: '/unassigned-cases',
    group: 'core',
    requiredRoles: ['ADMIN', 'SCHEDULER'],
  },

  // --- Case Workflows (contextual) ---
  {
    id: 'case-dashboard',
    title: 'Case Dashboard',
    description: 'View and manage case details, attestation, and overrides',
    path: null,
    group: 'case-workflows',
    requiredCapabilities: ['CASE_VIEW'],
    isContextual: true,
    contextualNote: 'Open from Calendar or search',
    badge: 'Contextual',
  },
  {
    id: 'case-verify',
    title: 'Readiness Verification',
    description: 'Scan and verify case readiness',
    path: null,
    group: 'case-workflows',
    requiredCapabilities: ['VERIFY_SCAN'],
    isContextual: true,
    contextualNote: 'Open from Case Dashboard',
    badge: 'Contextual',
  },
  {
    id: 'or-debrief',
    title: 'Debrief',
    description: 'Complete post-operative debrief checklist',
    path: null,
    group: 'case-workflows',
    requiredCapabilities: ['OR_DEBRIEF'],
    isContextual: true,
    contextualNote: 'Open from Case Dashboard',
    badge: 'Contextual',
  },
  {
    id: 'or-timeout',
    title: 'OR Timeout',
    description: 'Record surgical timeout or cancellation',
    path: null,
    group: 'case-workflows',
    requiredCapabilities: ['OR_TIMEOUT'],
    isContextual: true,
    contextualNote: 'Open from Case Dashboard',
    badge: 'Contextual',
  },

  // --- Admin ---
  {
    id: 'admin-cases',
    title: 'Cases',
    description: 'Approve, reject, and manage all surgical cases',
    path: '/admin/cases',
    group: 'admin',
    requiredRoles: ['ADMIN', 'SCHEDULER'],
    badge: 'Admin',
  },
  {
    id: 'admin-users',
    title: 'Users',
    description: 'Manage user accounts and role assignments',
    path: '/admin/users',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['USER_MANAGE'],
    badge: 'Admin',
  },
  {
    id: 'admin-locations',
    title: 'Locations',
    description: 'Manage facility locations and OR rooms',
    path: '/admin/locations',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['LOCATION_MANAGE'],
    badge: 'Admin',
  },
  {
    id: 'admin-catalog',
    title: 'Catalog',
    description: 'Manage equipment and supply catalog',
    path: '/admin/catalog',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['CATALOG_MANAGE'],
    badge: 'Admin',
  },
  {
    id: 'admin-inventory',
    title: 'Inventory',
    description: 'View and manage inventory levels',
    path: '/admin/inventory',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['INVENTORY_MANAGE'],
    badge: 'Admin',
  },
  {
    id: 'admin-inventory-checkin',
    title: 'Inventory Check-In',
    description: 'Check in received inventory items',
    path: '/admin/inventory/check-in',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['INVENTORY_CHECKIN'],
    badge: 'Admin',
  },
  {
    id: 'admin-reports',
    title: 'Reports',
    description: 'View operational reports and export data',
    path: '/admin/reports',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['REPORTS_VIEW'],
    badge: 'Admin',
  },
  {
    id: 'admin-general-settings',
    title: 'General Settings',
    description: 'Configure rooms, feature toggles, and case options',
    path: '/admin/general-settings',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    requiredCapabilities: ['SETTINGS_MANAGE'],
    badge: 'Admin',
  },
  {
    id: 'admin-pending-reviews',
    title: 'All Pending Reviews',
    description: 'Manage all pending reviews across users',
    path: '/admin/pending-reviews',
    group: 'admin',
    requiredRoles: ['ADMIN'],
    badge: 'Admin',
  },
];

// --- Access Decision Result ---
export interface AccessDecision {
  allowed: boolean;
  reason: string;
  matchedRole?: Role;
  matchedCapability?: Capability;
}

// --- Helper Functions ---

/**
 * Normalize roles to a typed array. Accepts string[] only.
 *
 * TODO(PERSONA-REMOVE-LEGACY): The string overload was removed. If callers
 * still pass a single string, fix the call site — do not re-add the overload.
 */
export function normalizeRoles(roles: string[]): Role[] {
  return roles as Role[];
}

/**
 * Derive all capabilities from a set of roles (UNION).
 * Delegates to canonical implementation in @asc/domain.
 */
export function deriveCapabilities(roles: Role[]): Capability[] {
  return _domainDeriveCapabilities(roles);
}

/**
 * Check if user has access to a feature
 * Returns detailed decision with reason
 */
export function checkFeatureAccess(
  feature: FeatureDefinition,
  userRoles: Role[],
  userCapabilities: Capability[]
): AccessDecision {
  // Core features with no requirements = authenticated-only
  if (!feature.requiredRoles?.length && !feature.requiredCapabilities?.length) {
    return {
      allowed: true,
      reason: 'Authenticated-only feature (no role/capability requirements)',
    };
  }

  // Check roles (OR logic)
  if (feature.requiredRoles?.length) {
    for (const reqRole of feature.requiredRoles) {
      if (userRoles.includes(reqRole)) {
        return {
          allowed: true,
          reason: `User has required role: ${reqRole}`,
          matchedRole: reqRole,
        };
      }
    }
  }

  // Check capabilities (OR logic)
  if (feature.requiredCapabilities?.length) {
    for (const reqCap of feature.requiredCapabilities) {
      if (userCapabilities.includes(reqCap)) {
        return {
          allowed: true,
          reason: `User has required capability: ${reqCap}`,
          matchedCapability: reqCap,
        };
      }
    }
  }

  // Build denial reason
  const requirements: string[] = [];
  if (feature.requiredRoles?.length) {
    requirements.push(`roles: ${feature.requiredRoles.join(' OR ')}`);
  }
  if (feature.requiredCapabilities?.length) {
    requirements.push(`capabilities: ${feature.requiredCapabilities.join(' OR ')}`);
  }

  return {
    allowed: false,
    reason: `Missing required ${requirements.join(' OR ')}`,
  };
}

/**
 * Get all accessible features for a user
 */
export function getAccessibleFeatures(
  userRoles: Role[],
  userCapabilities: Capability[]
): { feature: FeatureDefinition; decision: AccessDecision }[] {
  return FEATURES.map((feature) => ({
    feature,
    decision: checkFeatureAccess(feature, userRoles, userCapabilities),
  }));
}

/**
 * Generate debug info for the Debug Panel
 */
export interface DebugInfo {
  roles: Role[];
  capabilities: Capability[];
  featureDecisions: {
    featureId: string;
    featureTitle: string;
    allowed: boolean;
    reason: string;
  }[];
}

export function generateDebugInfo(
  userRoles: Role[],
  userCapabilities: Capability[]
): DebugInfo {
  const featureDecisions = FEATURES.map((feature) => {
    const decision = checkFeatureAccess(feature, userRoles, userCapabilities);
    return {
      featureId: feature.id,
      featureTitle: feature.title,
      allowed: decision.allowed,
      reason: decision.reason,
    };
  });

  return {
    roles: userRoles,
    capabilities: userCapabilities,
    featureDecisions,
  };
}
