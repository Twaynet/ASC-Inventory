'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { usePersona } from '@/lib/persona';
import { AdminNav } from './AdminNav';
import { useTheme } from '@/lib/useTheme';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const { roles } = useAccessControl();
  const { persona, availablePersonas, setPersona, labelFor } = usePersona();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const isOnDashboard = pathname === '/dashboard';

  return (
    <header className="header">
      <div className="container header-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!isOnDashboard && (
            <button
              onClick={() => router.push('/dashboard')}
              aria-label="Go to System Dashboard"
              title="Home"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                background: 'var(--color-accent)',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--text-on-primary)',
                cursor: 'pointer',
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </button>
          )}
          <h1>{title}</h1>
        </div>
        <div className="header-user">
          <AdminNav userRoles={roles} />
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              background: 'var(--surface-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: '50%',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            {theme === 'light' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            )}
          </button>
          <button
            onClick={() => router.push('/help')}
            aria-label="Help & FAQ"
            title="Help & FAQ"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              background: 'var(--surface-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: '50%',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            ?
          </button>
          <span>
            {user?.name}
            {availablePersonas.length > 1 ? (
              <>
                {' ('}
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as typeof persona)}
                  aria-label="Active persona"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: 'inherit',
                    padding: 0,
                  }}
                >
                  {availablePersonas.map((p) => (
                    <option key={p} value={p} style={{ color: 'var(--text-primary)' }}>
                      {labelFor(p)}
                    </option>
                  ))}
                </select>
                {')'}
              </>
            ) : (
              <> ({labelFor(persona)})</>
            )}
          </span>
          <span>{user?.facilityName}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
