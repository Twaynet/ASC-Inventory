'use client';

import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.875rem',
      marginBottom: '0.5rem',
    }} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span style={{ color: '#718096' }}>/</span>}
          {item.href ? (
            <Link href={item.href} style={{ color: '#4299e1', textDecoration: 'none' }}>{item.label}</Link>
          ) : (
            <span style={{ color: '#2d3748' }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
