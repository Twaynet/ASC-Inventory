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
  { href: '/admin/general-settings', label: 'General Settings' },
  { href: '/admin/pending-reviews', label: 'Pending Reviews' },
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

  const isAdminPage = pathname?.startsWith('/admin');

  return (
    <div className="admin-nav" ref={menuRef}>
      <button
        className={`admin-nav-toggle ${isOpen ? 'open' : ''} ${isAdminPage ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        Admin
        <span className="admin-nav-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="admin-nav-dropdown">
          {ADMIN_LINKS.map((link) => (
            <button
              key={link.href}
              className={`admin-nav-item ${pathname === link.href || pathname?.startsWith(link.href + '/') ? 'current' : ''}`}
              onClick={() => router.push(link.href)}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .admin-nav {
          position: relative;
        }

        .admin-nav-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #4a5568;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .admin-nav-toggle:hover,
        .admin-nav-toggle.open {
          background: #2d3748;
        }

        .admin-nav-toggle.active {
          background: #3182ce;
        }

        .admin-nav-toggle.active:hover,
        .admin-nav-toggle.active.open {
          background: #2b6cb0;
        }

        .admin-nav-arrow {
          font-size: 0.625rem;
        }

        .admin-nav-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 180px;
          z-index: 1000;
          overflow: hidden;
        }

        .admin-nav-item {
          display: block;
          width: 100%;
          padding: 0.75rem 1rem;
          text-align: left;
          background: none;
          border: none;
          font-size: 0.875rem;
          color: #4a5568;
          cursor: pointer;
          transition: background 0.15s;
        }

        .admin-nav-item:hover {
          background: #f7fafc;
        }

        .admin-nav-item.current {
          background: #ebf8ff;
          color: #3182ce;
          font-weight: 500;
        }

        .admin-nav-item + .admin-nav-item {
          border-top: 1px solid #e2e8f0;
        }
      `}</style>
    </div>
  );
}
