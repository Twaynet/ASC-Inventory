'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route redirect: /case-cards -> /preference-cards
 *
 * This route is maintained for backward compatibility.
 * The canonical route for Surgeon Preference Cards is /preference-cards.
 *
 * Per LAW_NOMENCLATURE.md: SPCs must not be called "case cards" in UI.
 * This redirect ensures existing bookmarks and links continue to work.
 */
export default function CaseCardsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/preference-cards');
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      Redirecting to Preference Cards...
    </div>
  );
}
