/**
 * Owner Notification Utility
 *
 * Best-effort email notification to the site owner on demo access events.
 * Uses nodemailer if SMTP env vars are configured; otherwise logs a structured
 * event to the console so events are still observable via log aggregation.
 *
 * MUST NOT throw — callers fire-and-forget.
 */

import { createTransport, type Transporter } from 'nodemailer';

// ---------------------------------------------------------------------------
// Configuration (read once at module load)
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@orthowise.dev';
const OWNER_EMAIL = process.env.OWNER_NOTIFICATION_EMAIL;

const smtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && OWNER_EMAIL);

let transporter: Transporter | null = null;

if (smtpConfigured) {
  transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DemoNotificationPayload {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: 'GRANTED' | 'DENIED';
  expiresAt?: string | null;
  denialReason?: string | null;
}

/**
 * Send owner notification about a demo access event.
 * Never throws — logs on failure.
 */
export async function notifyOwner(payload: DemoNotificationPayload): Promise<void> {
  if (!smtpConfigured || !transporter) {
    console.log(
      JSON.stringify({
        code: 'DEMO_OWNER_NOTIFY_SKIPPED',
        reason: 'SMTP not configured',
        ...payload,
      }),
    );
    return;
  }

  const subject = payload.outcome === 'GRANTED'
    ? `[Demo] Access granted: ${payload.email}`
    : `[Demo] Access denied: ${payload.email}`;

  const lines = [
    `Outcome: ${payload.outcome}`,
    `Email:   ${payload.email}`,
    `IP:      ${payload.ipAddress ?? 'unknown'}`,
    `UA:      ${payload.userAgent ?? 'unknown'}`,
  ];

  if (payload.outcome === 'GRANTED' && payload.expiresAt) {
    lines.push(`Expires: ${payload.expiresAt}`);
  }
  if (payload.outcome === 'DENIED' && payload.denialReason) {
    lines.push(`Reason:  ${payload.denialReason}`);
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: OWNER_EMAIL,
      subject,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        code: 'DEMO_OWNER_NOTIFY_FAILED',
        error: err instanceof Error ? err.message : String(err),
        ...payload,
      }),
    );
  }
}
