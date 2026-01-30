'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_LINKS = [
  { label: 'General Settings', href: '/admin/general-settings' },
  { label: 'Case Dashboard', href: '/admin/general-settings/case-dashboard' },
  { label: 'Operating Rooms', href: '/admin/general-settings/operating-rooms' },
  { label: 'Surgeons', href: '/admin/general-settings/surgeons' },
];

export function AdminSettingsSubnav() {
  const pathname = usePathname();

  return (
    <nav style={{
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1.5rem',
      borderBottom: '1px solid #e2e8f0',
      paddingBottom: '0.75rem',
    }} aria-label="Settings navigation">
      {SETTINGS_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              color: isActive ? 'white' : '#4a5568',
              fontWeight: 500,
              fontSize: '0.875rem',
              textDecoration: 'none',
              background: isActive ? '#4299e1' : 'transparent',
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
