'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { AttentionItem } from '@/lib/api/attention';

interface AttentionDrawerProps {
  items: AttentionItem[];
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  CRITICAL: { bg: 'var(--color-red-bg)', border: 'var(--color-red)', text: 'var(--color-red-700)', label: 'Critical' },
  WARNING: { bg: 'var(--color-orange-bg)', border: 'var(--color-orange)', text: 'var(--color-orange-700)', label: 'Warning' },
  INFO: { bg: 'var(--color-blue-50)', border: 'var(--color-blue-500)', text: 'var(--color-blue-600)', label: 'Info' },
};

export function AttentionDrawer({ items, isOpen, onClose }: AttentionDrawerProps) {
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const criticalItems = items.filter((i) => i.severity === 'CRITICAL');
  const warningItems = items.filter((i) => i.severity === 'WARNING');
  const infoItems = items.filter((i) => i.severity === 'INFO');

  const groups = [
    { severity: 'CRITICAL', items: criticalItems },
    { severity: 'WARNING', items: warningItems },
    { severity: 'INFO', items: infoItems },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      ref={drawerRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '380px',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        zIndex: 200,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Attention ({items.length})
        </span>
        <button
          onClick={onClose}
          aria-label="Close attention panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '1.2rem',
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          No attention items
        </div>
      ) : (
        groups.map((group) => {
          const style = SEVERITY_STYLES[group.severity] || SEVERITY_STYLES.INFO;
          return (
            <div key={group.severity}>
              <div
                style={{
                  padding: '6px 16px',
                  background: 'var(--surface-secondary)',
                  borderBottom: '1px solid var(--border-default)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: style.border,
                }}
              >
                {style.label} ({group.items.length})
              </div>
              {group.items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-default)',
                    borderLeft: `3px solid ${style.border}`,
                    background: style.bg,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: style.text,
                      marginBottom: '2px',
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: style.text,
                      opacity: 0.85,
                      marginBottom: '6px',
                    }}
                  >
                    {item.detail}
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      onClose();
                      router.push(item.deepLink);
                    }}
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
