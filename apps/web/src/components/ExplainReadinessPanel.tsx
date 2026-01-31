'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  explainReadiness,
  type ExplainReadinessRequest,
  type ExplainReadinessResponse,
} from '@/lib/api/ai';
import type { ReadinessSummary } from '@/lib/readiness/summary';
import type { CaseDashboardData } from '@/lib/api/case-dashboard';

interface ExplainReadinessPanelProps {
  token: string;
  caseId: string;
  dashboard: CaseDashboardData;
  readiness: ReadinessSummary;
}

export function ExplainReadinessPanel({
  token,
  caseId,
  dashboard,
  readiness,
}: ExplainReadinessPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'result' | 'error'>('idle');
  const [result, setResult] = useState<ExplainReadinessResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleExplain = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const payload: ExplainReadinessRequest = {
        caseId,
        caseHeader: {
          caseNumber: dashboard.caseNumber,
          procedureName: dashboard.procedureName,
          surgeonName: dashboard.surgeon ?? null,
          scheduledDate: dashboard.scheduledDate ?? null,
          scheduledTime: dashboard.scheduledTime ?? null,
          orRoom: dashboard.orRoom ?? null,
          status: dashboard.status,
          isActive: dashboard.isActive,
        },
        readinessSnapshot: {
          overall: readiness.overall,
          blockers: readiness.blockers.map(b => ({
            code: b.code,
            label: b.label,
            severity: b.severity,
            actionLabel: b.actionLabel,
            href: b.href,
            ...(b.capability ? { capability: b.capability } : {}),
          })),
        },
      };
      const res = await explainReadiness(token, payload);
      setResult(res);
      setState('result');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get explanation';
      setError(msg);
      setState('error');
    }
  }, [token, caseId, dashboard, readiness]);

  const handleCopyHandoff = useCallback(() => {
    if (result?.handoff) {
      navigator.clipboard.writeText(result.handoff).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [result]);

  if (state === 'idle') {
    return (
      <button
        className="btn btn-secondary btn-sm"
        onClick={handleExplain}
        style={{ marginTop: '0.5rem' }}
      >
        Explain readiness
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div className="ai-explain-panel" style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="status-icon">...</span>
          <span>Getting explanation...</span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="ai-explain-panel" style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid #dc3545', borderRadius: '6px', backgroundColor: '#fff5f5' }}>
        <p style={{ margin: 0, color: '#dc3545' }}>{error}</p>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleExplain}
          style={{ marginTop: '0.5rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="ai-explain-panel" style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', backgroundColor: '#f8f9fa' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{result.title}</div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{result.summary}</p>

      {result.next_steps.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Next steps</div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
            {result.next_steps.map((step, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>
                {step.action_href ? (
                  <a
                    href={step.action_href}
                    onClick={(e) => { e.preventDefault(); router.push(step.action_href!); }}
                    style={{ fontWeight: 500 }}
                  >
                    {step.label}
                  </a>
                ) : (
                  <span style={{ fontWeight: 500 }}>{step.label}</span>
                )}
                {' '}<span style={{ color: '#666' }}>— {step.why}</span>
                {step.requires && (
                  <span style={{ color: '#888', fontSize: '0.8rem' }}> (requires {step.requires})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ padding: '0.5rem', backgroundColor: '#e9ecef', borderRadius: '4px', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>{result.handoff}</span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleCopyHandoff}
          style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', color: '#888' }}>{result.safety_note}</div>
    </div>
  );
}
