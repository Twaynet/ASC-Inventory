'use client';

/**
 * Soft in-app banner shown to demo users within 72 hours of expiry.
 * Does NOT render when expired (server enforces that) or when > 72h remain.
 */

interface DemoExpiryBannerProps {
  demoExpiresAt: string | null | undefined;
  isDemo: boolean | undefined;
}

export function DemoExpiryBanner({ demoExpiresAt, isDemo }: DemoExpiryBannerProps) {
  if (!isDemo || !demoExpiresAt) return null;

  const expiresDate = new Date(demoExpiresAt);
  const now = new Date();
  const msRemaining = expiresDate.getTime() - now.getTime();

  // Don't show if already expired or more than 72h remain
  if (msRemaining <= 0 || msRemaining > 72 * 60 * 60 * 1000) return null;

  const scheduleUrl = process.env.NEXT_PUBLIC_DEMO_SCHEDULE_URL;

  return (
    <div className="bg-[var(--color-orange-50,#fff7ed)] border border-[var(--color-orange,#f97316)] rounded-md px-4 py-2 mb-4 text-sm text-[var(--color-orange-900,#7c2d12)]">
      <div className="font-medium">
        Your demo access ends soon — you&rsquo;re welcome to come back anytime.
      </div>
      <div className="text-[var(--color-orange-700,#c2410c)] mt-1">
        Want to explore this with your team?
        {scheduleUrl && (
          <>
            {' '}
            <a
              href={scheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium text-[var(--color-orange-900,#7c2d12)] hover:text-[var(--color-orange,#f97316)]"
            >
              Schedule Live Session
            </a>
          </>
        )}
      </div>
    </div>
  );
}
