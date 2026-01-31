# AI Conventions

## Core Principles

1. **AI is explanation-only.** AI endpoints read existing state and produce human-readable explanations. They never create, update, or delete any record.

2. **AI never changes truth.** The readiness model (`computeReadinessSummary`) is the single source of truth. AI explains what the model already computed — it does not re-derive readiness or invent blockers.

3. **Structured outputs required.** All AI responses use OpenAI Structured Outputs (`response_format: json_schema, strict: true`). This guarantees the response matches a known schema and can be rendered without defensive parsing.

4. **PHI minimization.** AI prompts must not include: patient name, date of birth, MRN, SSN, or any direct patient identifier. Allowed: case number, procedure name, surgeon name, scheduled date/time, room, readiness blockers. A server-side `redactPhi()` function provides belt-and-suspenders protection on AI output.

5. **No client-side API keys.** OpenAI is called exclusively from the API server via `OPENAI_API_KEY` environment variable. The browser never has access to AI provider credentials.

6. **Feature-flagged.** AI features are gated by environment variable (e.g., `AI_EXPLAIN_READINESS_ENABLED=true`). Default is OFF. This allows instant rollback.

## How to Enable

Set these environment variables on the API server:

```bash
AI_EXPLAIN_READINESS_ENABLED=true
OPENAI_API_KEY=sk-...
```

No database migration or facility setting change is required.

## Endpoints

| Endpoint | Method | Gate | Purpose |
|----------|--------|------|---------|
| `/api/ai/explain-readiness` | POST | CASE_VIEW + feature flag | Explain case readiness blockers |

## Data Flow

1. Client computes `ReadinessSummary` using `computeReadinessSummary()` (deterministic, no AI).
2. Client sends readiness snapshot + minimal case header to API.
3. API validates input, checks auth + feature flag + rate limit.
4. API builds prompt from validated input (no raw PHI).
5. API calls OpenAI with strict JSON schema.
6. API validates model output: enforces `action_href` allow-list, runs `redactPhi()`.
7. API logs usage metadata (model, tokens, caseId, userId) — never logs prompt body.
8. Client renders structured response.

## Security Controls

- **action_href enforcement:** Model output `action_href` values must match hrefs from the input blockers. Any unknown href is replaced with `null` and a warning is logged.
- **Rate limiting:** 10 requests per user per minute (in-memory).
- **Timeout:** 10 second timeout on OpenAI calls.
- **Capability gate:** Requires `CASE_VIEW` capability.

## Data Retention / ZDR

The API sends `store: false` to OpenAI, requesting that input/output not be stored for training. Zero Data Retention (ZDR) and specific retention controls are platform-configurable via OpenAI enterprise agreements and may be required for HIPAA-covered workflows. Consult compliance before enabling in production with real patient-adjacent data.
