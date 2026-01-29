'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AdminNav } from './AdminNav';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
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
                background: '#3182ce',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
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
          <AdminNav userRole={user?.role || ''} />
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
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.8)',
              borderRadius: '50%',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            ?
          </button>
          <span>{user?.name} ({user?.role})</span>
          <span>{user?.facilityName}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
