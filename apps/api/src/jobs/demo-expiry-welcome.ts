/**
 * Demo Expiry Welcome Job
 *
 * Finds expired, non-blocked demo accounts that have NOT yet received a
 * "welcome back" email and sends one.  Designed to be invoked via cron
 * (`npm run demo:welcome`) or a future scheduler.
 *
 * Dependency-injection pattern:  the mailer is configurable for testing.
 */

import { createTransport, type Transporter } from 'nodemailer';
import { query } from '../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WelcomeCandidate {
  userId: string;
  email: string;
  name: string;
  expiresAt: string;
}

export interface MailSender {
  sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<void>;
}

export interface WelcomeJobResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function findWelcomeCandidates(): Promise<WelcomeCandidate[]> {
  const result = await query<{
    user_id: string;
    email: string;
    name: string;
    expires_at: string;
  }>(`
    SELECT da.user_id, da.email, u.name, da.expires_at
    FROM demo_account da
    JOIN "user" u ON u.id = da.user_id
    WHERE da.expires_at < NOW()
      AND da.is_blocked = false
      AND da.post_expiry_welcome_sent_at IS NULL
    ORDER BY da.expires_at ASC
  `);

  return result.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    expiresAt: r.expires_at,
  }));
}

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

export function buildWelcomeEmail(
  candidate: WelcomeCandidate,
  subject?: string,
): {
  subject: string;
  text: string;
} {
  const firstName = candidate.name.split(' ')[0] || 'there';

  return {
    subject: subject || 'Your OrthoWise demo has ended — ready when you are',
    text: [
      `Hi ${firstName},`,
      '',
      'Your OrthoWise demo access has expired.',
      '',
      'We hope you got a feel for how the system works — from case readiness',
      'to inventory tracking and the signal board.',
      '',
      'When you\'re ready to continue, reply to this email or reach out to',
      'schedule a live walkthrough with our team.',
      '',
      'Best,',
      'The OrthoWise Team',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Mark sent
// ---------------------------------------------------------------------------

export async function markWelcomeSent(userId: string): Promise<void> {
  await query(
    'UPDATE demo_account SET post_expiry_welcome_sent_at = NOW() WHERE user_id = $1',
    [userId],
  );
}

// ---------------------------------------------------------------------------
// Core job logic (injectable mailer)
// ---------------------------------------------------------------------------

export async function runWelcomeJob(
  mailer: MailSender,
  from: string,
  subject?: string,
): Promise<WelcomeJobResult> {
  const candidates = await findWelcomeCandidates();
  const result: WelcomeJobResult = { processed: candidates.length, sent: 0, failed: 0, skipped: 0 };

  for (const candidate of candidates) {
    if (!candidate.email) {
      result.skipped++;
      continue;
    }

    const email = buildWelcomeEmail(candidate, subject);

    try {
      await mailer.sendMail({ from, to: candidate.email, subject: email.subject, text: email.text });
      await markWelcomeSent(candidate.userId);
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error(
        JSON.stringify({
          code: 'DEMO_WELCOME_SEND_FAILED',
          userId: candidate.userId,
          email: candidate.email,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const DEMO_WELCOME_FROM = process.env.DEMO_WELCOME_FROM || process.env.SMTP_FROM;
  const DEMO_WELCOME_SUBJECT = process.env.DEMO_WELCOME_SUBJECT;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(JSON.stringify({ code: 'DEMO_WELCOME_SKIPPED', reason: 'SMTP not configured' }));
    process.exit(0);
  }

  if (!DEMO_WELCOME_FROM) {
    console.error(
      JSON.stringify({
        code: 'DEMO_WELCOME_ERROR',
        reason: 'No sender address configured (DEMO_WELCOME_FROM or SMTP_FROM required)',
      }),
    );
    process.exit(1);
  }

  const transporter: Transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  console.log(JSON.stringify({ code: 'DEMO_WELCOME_START' }));
  const result = await runWelcomeJob(transporter, DEMO_WELCOME_FROM, DEMO_WELCOME_SUBJECT);
  console.log(JSON.stringify({ code: 'DEMO_WELCOME_DONE', ...result }));

  process.exit(0);
}

// Run when invoked directly (not when imported by tests)
const isDirectRun = process.argv[1]?.includes('demo-expiry-welcome');
if (isDirectRun) {
  main().catch((err) => {
    console.error(JSON.stringify({ code: 'DEMO_WELCOME_FATAL', error: String(err) }));
    process.exit(1);
  });
}
