/**
 * AI Service — OpenAI proxy for explanation-only features.
 *
 * Rules:
 * - AI NEVER CHANGES STATE. AI ONLY EXPLAINS STATE.
 * - PHI minimized: no patient name, DOB, MRN.
 * - Structured outputs enforced via strict JSON schema.
 * - action_href validated against allow-list after model response.
 */

import OpenAI from 'openai';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CaseHeader {
  caseNumber: string;
  procedureName: string;
  surgeonName: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  orRoom: string | null;
  status: string;
  isActive: boolean;
}

export interface BlockerSnapshot {
  code: string;
  label: string;
  severity: 'warning' | 'critical';
  actionLabel: string;
  href: string;
  capability?: string;
}

export interface ReadinessSnapshot {
  overall: 'READY' | 'BLOCKED' | 'UNKNOWN';
  blockers: BlockerSnapshot[];
}

export interface ExplainReadinessInput {
  caseHeader: CaseHeader;
  readinessSnapshot: ReadinessSnapshot;
}

export interface ExplainReadinessNextStep {
  label: string;
  why: string;
  action_href: string | null;
  requires: string | null;
}

export interface ExplainReadinessResponse {
  title: string;
  summary: string;
  next_steps: ExplainReadinessNextStep[];
  handoff: string;
  safety_note: string;
}

export interface ExplainReadinessResult {
  response: ExplainReadinessResponse;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// ── PHI Redaction (belt + suspenders) ──────────────────────────────────────

const DOB_PATTERN = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const MRN_PATTERN = /\b(?:MRN|mrn)[:\s]*\w+/gi;

export function redactPhi(text: string): string {
  return text
    .replace(DOB_PATTERN, '[REDACTED-DATE]')
    .replace(SSN_PATTERN, '[REDACTED-SSN]')
    .replace(MRN_PATTERN, '[REDACTED-MRN]');
}

// ── Strict JSON Schema for Structured Outputs ─────────────────────────────

const EXPLAIN_READINESS_SCHEMA = {
  name: 'explain_readiness',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const },
      summary: { type: 'string' as const },
      next_steps: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            label: { type: 'string' as const },
            why: { type: 'string' as const },
            action_href: { type: ['string', 'null'] as const },
            requires: { type: ['string', 'null'] as const },
          },
          required: ['label', 'why', 'action_href', 'requires'] as const,
          additionalProperties: false,
        },
      },
      handoff: { type: 'string' as const },
      safety_note: { type: 'string' as const },
    },
    required: ['title', 'summary', 'next_steps', 'handoff', 'safety_note'] as const,
    additionalProperties: false,
  },
} as const;

// ── System Prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an ASC (Ambulatory Surgery Center) workflow explainer.

Your job is to explain case readiness status to clinical staff in a calm, clear way.

RULES:
- Do NOT invent blockers. Only explain the blockers provided in the input.
- Do NOT suggest actions beyond what is listed in the blockers.
- Keep the summary under 60 words.
- Keep each "why" under 30 words.
- Keep the handoff under 25 words — it will be read aloud by a circulator.
- The safety_note must always be: "AI explanation — verify checklist status before acting."
- action_href MUST be exactly one of the hrefs provided in the blockers, or null. Never invent URLs.
- requires should be a human-readable capability label (e.g., "Inventory Check-In"), not a raw enum.
- If readiness is READY with no blockers, say so positively and concisely.
- If readiness is UNKNOWN, explain that readiness data is not yet available.
- Never include patient names, dates of birth, or medical record numbers.`;

// ── Config ────────────────────────────────────────────────────────────────

// store=false behavior: do not request OpenAI to store data.
// ZDR/retention controls are platform-configurable and may be required for HIPAA workflows.
// These seams exist for future enterprise configuration.
const AI_CONFIG = {
  model: 'gpt-4o-mini',
  store: false,
  timeoutMs: 10_000,
};

// ── Main Function ─────────────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _client = new OpenAI({ apiKey, timeout: AI_CONFIG.timeoutMs });
  }
  return _client;
}

/** Reset client — for testing only */
export function _resetClient(): void {
  _client = null;
}

export async function explainReadiness(
  input: ExplainReadinessInput,
  logger?: { warn: (obj: object, msg: string) => void },
): Promise<ExplainReadinessResult> {
  const client = getClient();

  const allowedHrefs = new Set(input.readinessSnapshot.blockers.map(b => b.href));

  const userMessage = JSON.stringify({
    caseHeader: input.caseHeader,
    readiness: input.readinessSnapshot,
  });

  const response = await client.responses.create({
    model: AI_CONFIG.model,
    instructions: SYSTEM_PROMPT,
    input: userMessage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text: { format: { type: 'json_schema', ...EXPLAIN_READINESS_SCHEMA } } as any,
    store: AI_CONFIG.store,
  });

  // Extract text from response
  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('OpenAI returned empty response');
  }

  const parsed: ExplainReadinessResponse = JSON.parse(outputText);

  // Enforce action_href allow-list
  for (const step of parsed.next_steps) {
    if (step.action_href !== null && !allowedHrefs.has(step.action_href)) {
      logger?.warn(
        { escapedHref: step.action_href, allowedHrefs: [...allowedHrefs] },
        'AI returned action_href not in allow-list; replacing with null',
      );
      step.action_href = null;
    }
  }

  // Belt + suspenders: redact any PHI that might have leaked into output
  parsed.title = redactPhi(parsed.title);
  parsed.summary = redactPhi(parsed.summary);
  parsed.handoff = redactPhi(parsed.handoff);
  for (const step of parsed.next_steps) {
    step.label = redactPhi(step.label);
    step.why = redactPhi(step.why);
  }

  return {
    response: parsed,
    model: AI_CONFIG.model,
    promptTokens: response.usage?.input_tokens ?? 0,
    completionTokens: response.usage?.output_tokens ?? 0,
  };
}
