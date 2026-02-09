'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { usePersona } from '@/lib/persona';
import { AdminNav } from './AdminNav';
import { AttentionDrawer } from './AttentionDrawer';
import { useTheme } from '@/lib/useTheme';
import { getAttention, type AttentionItem } from '@/lib/api/attention';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { user, token, logout } = useAuth();
  const { roles } = useAccessControl();
  const { persona, availablePersonas, setPersona, labelFor } = usePersona();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const isOnDashboard = pathname === '/dashboard';

  // Attention state
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionOpen, setAttentionOpen] = useState(false);

  const loadAttention = useCallback(async () => {
    if (!token) return;
    try {
      const result = await getAttention(token);
      setAttentionItems(result.items);
    } catch {
      // Silently fail — attention is non-critical UI
    }
  }, [token]);

  // Fetch on mount and when navigating
  useEffect(() => {
    loadAttention();
  }, [loadAttention, pathname]);

  const badgeCount = attentionItems.length;

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
                width: '28px',
                height: '28px',
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
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAttentionOpen((prev) => !prev)}
              aria-label={`Attention items: ${badgeCount}`}
              title="Attention"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                background: badgeCount > 0 ? 'var(--surface-tertiary)' : 'var(--surface-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: '50%',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {badgeCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: 'var(--color-red, #ef4444)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    borderRadius: '9999px',
                    minWidth: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    lineHeight: 1,
                  }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
            <AttentionDrawer
              items={attentionItems}
              isOpen={attentionOpen}
              onClose={() => setAttentionOpen(false)}
            />
          </div>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
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
              width: '28px',
              height: '28px',
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
          <button className="btn btn-secondary btn-xs" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
