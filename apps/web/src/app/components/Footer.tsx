'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const version = '1.4.0';
const buildTime = process.env.BUILD_TIME || 'dev';

export function Footer() {
  const [formattedTime, setFormattedTime] = useState<string>(buildTime);

  useEffect(() => {
    // Format on client only to avoid hydration mismatch
    if (buildTime && buildTime !== 'dev') {
      try {
        const date = new Date(buildTime);
        setFormattedTime(
          date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      } catch {
        setFormattedTime(buildTime);
      }
    }
  }, []);

  return (
    <footer className="app-footer">
      <span>ASC Inventory v{version}</span>
      <span className="footer-separator">|</span>
      <span>Built: {formattedTime}</span>
      <span className="footer-separator">|</span>
      <Link href="/help" style={{ color: 'inherit', textDecoration: 'none' }}>Help</Link>
    </footer>
  );
}
