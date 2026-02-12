'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AdminNavProps {
  userRoles: string[];
}

const ADMIN_LINKS = [
  { href: '/admin/cases', label: 'Cases' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/locations', label: 'Locations' },
  { href: '/admin/catalog', label: 'Catalog' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/inventory/risk-queue', label: 'Risk Queue' },
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/loaner-sets', label: 'Loaner Sets' },
  { href: '/preference-cards', label: 'Surgeon Preference Cards' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/phi-audit', label: 'PHI Audit' },
  { href: '/admin/general-settings', label: 'General Settings' },
  { href: '/admin/pending-reviews', label: 'Pending Reviews' },
  { href: '/admin/surgery-requests', label: 'Surgery Requests' },
  { href: '/admin/financial-readiness', label: 'Financial Readiness' },
];

export function AdminNav({ userRoles }: AdminNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!userRoles.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className={`flex items-center gap-1.5 py-1 px-3 text-white border-none rounded text-xs font-medium cursor-pointer transition-colors bg-accent ${
          isOpen ? 'bg-[var(--color-blue-700)]' : 'hover:bg-[var(--color-blue-700)]'
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        Admin
        <span className="text-[0.625rem]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-surface-primary rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] min-w-[180px] z-[1000] overflow-hidden divide-y divide-border">
          {ADMIN_LINKS.map((link) => {
            const isCurrent = pathname === link.href || pathname?.startsWith(link.href + '/');
            return (
              <button
                key={link.href}
                className={`block w-full py-3 px-4 text-left border-none text-sm cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-[var(--color-blue-50)] text-accent font-medium'
                    : 'bg-transparent text-text-secondary hover:bg-surface-secondary'
                }`}
                onClick={() => router.push(link.href)}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
