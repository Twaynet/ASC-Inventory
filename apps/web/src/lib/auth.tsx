'use client';

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, getMe, type LoginResponse } from './api';
import { decodeJwtPayload } from './jwt-decode';
import {
  type Role,
  type Capability,
  normalizeRoles,
  deriveCapabilities,
  getAccessibleFeatures,
  generateDebugInfo,
  type DebugInfo,
  type FeatureDefinition,
  type AccessDecision,
} from './access-control';

/** User with optional isDemo flag extracted from JWT */
export type AppUser = LoginResponse['user'] & { isDemo?: boolean };

interface AuthContextType {
  user: AppUser | null;
  token: string | null;
  isLoading: boolean;
  login: (facilityKey: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('asc_token');
    if (storedToken) {
      getMe(storedToken)
        .then(({ user }) => {
          const jwt = decodeJwtPayload(storedToken);
          setUser({ ...user, isDemo: jwt?.isDemo === true });
          setToken(storedToken);
        })
        .catch(() => {
          localStorage.removeItem('asc_token');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (facilityKey: string, username: string, password: string) => {
    const response = await apiLogin(facilityKey, username, password);
    const jwt = decodeJwtPayload(response.token);
    setUser({ ...response.user, isDemo: jwt?.isDemo === true });
    setToken(response.token);
    localStorage.setItem('asc_token', response.token);
  };

  const logout = async () => {
    // Log the logout event before clearing state
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        // Ignore errors - still clear local state even if API call fails
      }
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('asc_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

/**
 * Hook for access control with multi-role support
 * Provides derived roles[], capabilities[], and feature access info
 */
export function useAccessControl() {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) {
      return {
        roles: [] as Role[],
        capabilities: [] as Capability[],
        features: [] as { feature: FeatureDefinition; decision: AccessDecision }[],
        debugInfo: null as DebugInfo | null,
        hasRole: (_role: Role) => false,
        hasCapability: (_cap: Capability) => false,
      };
    }

    // Use roles[] as the canonical source
    const roles = normalizeRoles(user.roles ?? [user.role]);
    const capabilities = deriveCapabilities(roles);
    const features = getAccessibleFeatures(roles, capabilities);
    const debugInfo = generateDebugInfo(roles, capabilities);

    return {
      roles,
      capabilities,
      features,
      debugInfo,
      hasRole: (role: Role) => roles.includes(role),
      hasCapability: (cap: Capability) => capabilities.includes(cap),
    };
  }, [user]);
}
