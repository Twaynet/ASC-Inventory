'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type Persona,
  PERSONA_STORAGE_KEY,
  getAvailablePersonas,
  getDefaultPersona,
  resolvePersona,
  getPersonaLabel,
} from '@asc/domain';
import { useAuth, useAccessControl } from './auth';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PersonaContextType {
  /** Currently active persona (always valid for the user's roles). */
  persona: Persona;
  /** All personas available to this user. */
  availablePersonas: Persona[];
  /** Switch the active persona. No-op if value is not in availablePersonas. */
  setPersona: (p: Persona) => void;
  /** Human label for a persona value. */
  labelFor: (p: Persona) => string;
}

const PersonaContext = createContext<PersonaContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { roles } = useAccessControl();

  const available = useMemo(() => getAvailablePersonas(roles), [roles]);

  const [persona, setPersonaState] = useState<Persona>(() => {
    if (typeof window === 'undefined') return available[0] ?? 'ADMIN';
    const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
    const resolved = resolvePersona(stored, roles);
    return resolved ?? getDefaultPersona(roles);
  });

  // Re-validate persona when roles change (e.g. after login)
  useEffect(() => {
    if (roles.length === 0) return;
    const resolved = resolvePersona(persona, roles);
    if (!resolved) {
      const def = getDefaultPersona(roles);
      setPersonaState(def);
      localStorage.setItem(PERSONA_STORAGE_KEY, def);
    }
  }, [roles, persona]);

  const setPersona = useCallback(
    (p: Persona) => {
      if (!available.includes(p)) return;
      setPersonaState(p);
      localStorage.setItem(PERSONA_STORAGE_KEY, p);
    },
    [available],
  );

  const value = useMemo(
    () => ({
      persona,
      availablePersonas: available,
      setPersona,
      labelFor: getPersonaLabel,
    }),
    [persona, available, setPersona],
  );

  return (
    <PersonaContext.Provider value={value}>
      {children}
    </PersonaContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) {
    throw new Error('usePersona must be used within PersonaProvider');
  }
  return ctx;
}
