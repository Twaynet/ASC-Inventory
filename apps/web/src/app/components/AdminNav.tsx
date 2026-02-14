'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getOperationsHealthSummary } from '@/lib/api/operations';
import { getPendingReviews } from '@/lib/api';

interface AdminNavProps {
  userRoles: string[];
}

const ADMIN_SECTIONS = [
  {
    label: 'Operations',
    links: [
      { href: '/admin/cases', label: 'Cases' },
      { href: '/admin/surgery-requests', label: 'Surgery Requests' },
      { href: '/admin/pending-reviews', label: 'Pending Reviews', badgeKey: 'pendingReviews' as const },
      { href: '/admin/operations-health', label: 'Operations Health' },
      { href: '/admin/financial-readiness', label: 'Financial Readiness' },
    ],
  },
  {
    label: 'Inventory',
    links: [
      { href: '/admin/inventory', label: 'Inventory' },
      { href: '/admin/catalog', label: 'Catalog' },
      { href: '/admin/vendors', label: 'Vendors' },
      { href: '/admin/loaner-sets', label: 'Loaner Sets' },
      { href: '/admin/devices', label: 'Devices' },
      { href: '/preference-cards', label: 'Surgeon Preference Cards' },
      { href: '/admin/inventory/risk-queue', label: 'Risk Queue', badgeKey: 'openMissing' as const },
    ],
  },
  {
    label: 'Setup',
    links: [
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/locations', label: 'Locations' },
      { href: '/admin/general-settings', label: 'Settings' },
    ],
  },
  {
    label: 'Governance',
    links: [
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/phi-audit', label: 'PHI Audit' },
    ],
  },
];

type BadgeCounts = { openMissing: number; pendingReviews: number };

export function AdminNav({ userRoles }: AdminNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [badges, setBadges] = useState<BadgeCounts | null>(null);
  const fetchedRef = useRef(false);

  const loadBadges = useCallback(async () => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const [health, reviews] = await Promise.all([
        getOperationsHealthSummary(token),
        getPendingReviews(token),
      ]);
      setBadges({
        openMissing: health.missing.openCount,
        pendingReviews: reviews.pendingReviews.length,
      });
    } catch {
      // Silently degrade — no badges shown
    }
  }, [token]);

  useEffect(() => { loadBadges(); }, [loadBadges]);

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
        <div className="absolute top-full right-0 mt-2 bg-surface-primary rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] min-w-[200px] z-[1000] overflow-hidden">
          {ADMIN_SECTIONS.map((section, sIdx) => (
            <div key={section.label}>
              {sIdx > 0 && <div className="border-t border-border" />}
              <div className="px-4 pt-3 pb-1">
                <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-text-muted">
                  {section.label}
                </span>
              </div>
              {section.links.map((link) => {
                const isCurrent = pathname === link.href || pathname?.startsWith(link.href + '/');
                const badgeCount = link.badgeKey && badges ? badges[link.badgeKey] : 0;
                return (
                  <button
                    key={link.href}
                    className={`flex items-center justify-between w-full py-2 px-4 text-left border-none text-sm cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-[var(--color-blue-50)] text-accent font-medium'
                        : 'bg-transparent text-text-secondary hover:bg-surface-secondary'
                    }`}
                    onClick={() => router.push(link.href)}
                  >
                    {link.label}
                    {badgeCount > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.65rem] font-semibold bg-surface-tertiary text-text-secondary">
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
