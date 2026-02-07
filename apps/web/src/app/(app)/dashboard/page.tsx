'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getCases, getUnassignedCases, getPendingReviews, getFlaggedReviews } from '@/lib/api';
import type { FeatureDefinition, AccessDecision } from '@/lib/access-control';

export default function SystemDashboard() {
  const { user, token } = useAuth();
  const { features, debugInfo, hasRole } = useAccessControl();
  const router = useRouter();
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [pendingCaseCount, setPendingCaseCount] = useState<number>(0);
  const [unassignedCaseCount, setUnassignedCaseCount] = useState<number>(0);
  const [adminPendingReviewsCount, setAdminPendingReviewsCount] = useState<number>(0);

  // LAW §3.1: PLATFORM_ADMIN is no-tenant identity - redirect to platform UI
  const isPlatformAdmin = hasRole('PLATFORM_ADMIN');

  // Fetch pending case requests count
  useEffect(() => {
    if (token) {
      getCases(token, { status: 'REQUESTED' })
        .then((result) => {
          setPendingCaseCount(result.cases.length);
        })
        .catch(() => {
          // Ignore errors for badge count
        });
    }
  }, [token]);

  // Fetch unassigned cases count (for ADMIN/SCHEDULER)
  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN') || userRoles.includes('SCHEDULER')) {
        getUnassignedCases(token)
          .then((result) => {
            setUnassignedCaseCount(result.count);
          })
          .catch(() => {
            // Ignore errors for badge count
          });
      }
    }
  }, [token, user]);

  // Fetch admin pending reviews count (for ADMIN only)
  useEffect(() => {
    if (token && user) {
      const userRoles = user.roles || [user.role];
      if (userRoles.includes('ADMIN')) {
        Promise.all([
          getPendingReviews(token),
          getFlaggedReviews(token),
        ])
          .then(([pendingResult, flaggedResult]) => {
            // Total = debrief pending + all flagged (staff + surgeon combined)
            const total = pendingResult.pendingReviews.length +
                          flaggedResult.totalUnresolved;
            setAdminPendingReviewsCount(total);
          })
          .catch(() => {
            // Ignore errors for badge count
          });
      }
    }
  }, [token, user]);

  // Group features by category
  const coreFeatures = features.filter((f) => f.feature.group === 'core');
  const caseWorkflowFeatures = features.filter((f) => f.feature.group === 'case-workflows');
  const adminFeatures = features.filter((f) => f.feature.group === 'admin');

  const handleCopyDebug = () => {
    if (debugInfo) {
      navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    }
  };

  return (
    <>
      <Header title="System Dashboard" />

      <main className="container-full dashboard-page">
        {/* Platform Admin Section - LAW §3.1 */}
        {isPlatformAdmin && (
          <section className="platform-admin-section">
            <h2>Platform Control Plane</h2>
            <p className="platform-description">
              You are logged in as a Platform Administrator. Access the Platform Administration console to manage system-wide configuration.
            </p>
            <button
              className="platform-btn"
              onClick={() => router.push('/platform')}
            >
              Open Platform Administration
            </button>
          </section>
        )}

        {/* Core Features */}
        <FeatureSection
          title="Core"
          features={coreFeatures}
          onNavigate={(path) => router.push(path)}
          badgeCounts={{
            'case-requests': pendingCaseCount,
            'unassigned-cases': unassignedCaseCount,
          }}
        />

        {/* Case Workflow Features */}
        <FeatureSection
          title="Case Workflows"
          features={caseWorkflowFeatures}
          onNavigate={(path) => router.push(path)}
        />

        {/* Admin Features */}
        {adminFeatures.some((f) => f.decision.allowed) && (
          <FeatureSection
            title="Admin"
            features={adminFeatures}
            onNavigate={(path) => router.push(path)}
            badgeCounts={{
              'admin-pending-reviews': adminPendingReviewsCount,
            }}
          />
        )}

        {/* Debug Panel */}
        <section className="debug-panel">
          <button
            className="debug-toggle"
            onClick={() => setDebugExpanded(!debugExpanded)}
          >
            {debugExpanded ? '▼' : '▶'} Debug Panel
          </button>

          {debugExpanded && debugInfo && (
            <div className="debug-content">
              <div className="debug-section">
                <h4>User Roles</h4>
                <div className="debug-tags">
                  {debugInfo.roles.map((role) => (
                    <span key={role} className="debug-tag role">{role}</span>
                  ))}
                </div>
              </div>

              <div className="debug-section">
                <h4>Derived Capabilities</h4>
                <div className="debug-tags">
                  {debugInfo.capabilities.map((cap) => (
                    <span key={cap} className="debug-tag capability">{cap}</span>
                  ))}
                </div>
              </div>

              <div className="debug-section">
                <h4>Feature Access Matrix</h4>
                <table className="debug-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Allowed</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugInfo.featureDecisions.map((fd) => (
                      <tr key={fd.featureId} className={fd.allowed ? 'allowed' : 'denied'}>
                        <td>{fd.featureTitle}</td>
                        <td>{fd.allowed ? '✓' : '✗'}</td>
                        <td className="reason">{fd.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="btn btn-secondary btn-sm" onClick={handleCopyDebug}>
                Copy Debug JSON
              </button>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .dashboard-page {
          padding: 2rem 1.5rem;
        }

        .platform-admin-section {
          background: linear-gradient(135deg, var(--color-blue-500) 0%, var(--color-accent) 100%);
          color: var(--text-on-primary);
          padding: 2rem;
          border-radius: 12px;
          margin-bottom: 2rem;
        }

        .platform-admin-section h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          border: none;
          padding: 0;
          color: var(--text-on-primary);
        }

        .platform-description {
          margin: 0 0 1.5rem 0;
          opacity: 0.9;
        }

        .platform-btn {
          background: var(--surface-primary);
          color: var(--color-blue-600);
          font-weight: 600;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .platform-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px var(--shadow-md);
        }

        .debug-panel {
          margin-top: 3rem;
          padding: 1rem;
          background: var(--surface-secondary);
          border-radius: 8px;
          border: 1px dashed var(--color-gray-400);
        }

        .debug-toggle {
          background: none;
          border: none;
          font-size: 0.875rem;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          font-family: monospace;
        }

        .debug-toggle:hover {
          color: var(--text-primary);
        }

        .debug-content {
          margin-top: 1rem;
        }

        .debug-section {
          margin-bottom: 1.5rem;
        }

        .debug-section h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .debug-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .debug-tag {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: monospace;
        }

        .debug-tag.role {
          background: var(--color-blue-100);
          color: var(--color-blue-600);
        }

        .debug-tag.capability {
          background: var(--surface-tertiary);
          color: var(--color-accent);
        }

        .debug-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
          font-family: monospace;
        }

        .debug-table th,
        .debug-table td {
          padding: 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--border-default);
        }

        .debug-table th {
          background: var(--surface-tertiary);
          font-weight: 600;
          color: var(--text-primary);
        }

        .debug-table td {
          color: var(--text-secondary);
        }

        .debug-table tr.allowed td:nth-child(2) {
          color: var(--color-green);
        }

        .debug-table tr.denied td:nth-child(2) {
          color: var(--color-red);
        }

        .debug-table .reason {
          color: var(--text-muted);
          font-size: 0.75rem;
        }
      `}</style>
    </>
  );
}

// --- Feature Section Component ---
interface FeatureSectionProps {
  title: string;
  features: { feature: FeatureDefinition; decision: AccessDecision }[];
  onNavigate: (path: string) => void;
  badgeCounts?: Record<string, number>;
}

function FeatureSection({ title, features, onNavigate, badgeCounts }: FeatureSectionProps) {
  // Filter to only show allowed features (or contextual info cards)
  const visibleFeatures = features.filter(
    (f) => f.decision.allowed || f.feature.isContextual
  );

  if (visibleFeatures.length === 0) {
    return null;
  }

  return (
    <section className="feature-section">
      <h2>{title}</h2>
      <div className="feature-grid">
        {visibleFeatures.map(({ feature, decision }) => (
          <FeatureCard
            key={feature.id}
            feature={feature}
            decision={decision}
            onNavigate={onNavigate}
            badgeCount={badgeCounts?.[feature.id]}
          />
        ))}
      </div>

      <style jsx>{`
        .feature-section {
          margin-bottom: 2rem;
        }

        .feature-section h2 {
          font-size: 1.25rem;
          margin: 0 0 1rem 0;
          color: var(--text-primary);
          border-bottom: 2px solid var(--border-default);
          padding-bottom: 0.5rem;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }
      `}</style>
    </section>
  );
}

// --- Feature Card Component ---
interface FeatureCardProps {
  feature: FeatureDefinition;
  decision: AccessDecision;
  onNavigate: (path: string) => void;
  badgeCount?: number;
}

function FeatureCard({ feature, decision, onNavigate, badgeCount }: FeatureCardProps) {
  const isClickable = decision.allowed && feature.path && !feature.isContextual;

  const handleClick = () => {
    if (isClickable && feature.path) {
      onNavigate(feature.path);
    }
  };

  return (
    <div
      className={`feature-card ${isClickable ? 'clickable' : ''} ${!decision.allowed ? 'disabled' : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
    >
      <div className="card-header">
        <h3>{feature.title}</h3>
        <div className="badges">
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className="badge count">{badgeCount}</span>
          )}
          {feature.badge && (
            <span className={`badge ${feature.badge.toLowerCase()}`}>
              {feature.badge}
            </span>
          )}
        </div>
      </div>
      <p className="description">{feature.description}</p>
      {feature.notes && <p className="notes">{feature.notes}</p>}
      {feature.isContextual && (
        <p className="contextual-note">{feature.contextualNote}</p>
      )}

      <style jsx>{`
        .feature-card {
          background: var(--surface-primary);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          padding: 1rem;
          transition: all 0.15s ease;
        }

        .feature-card.clickable {
          cursor: pointer;
        }

        .feature-card.clickable:hover {
          border-color: var(--color-blue-500);
          box-shadow: 0 2px 8px var(--shadow-sm);
          transform: translateY(-1px);
        }

        .feature-card.disabled {
          opacity: 0.5;
          background: var(--surface-secondary);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .card-header h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--text-primary);
        }

        .badge {
          font-size: 0.65rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .badge.admin {
          background: var(--color-red-bg);
          color: var(--color-red);
        }

        .badge.contextual {
          background: var(--surface-tertiary);
          color: var(--color-accent);
        }

        .badge.count {
          background: var(--color-blue-500);
          color: var(--text-on-primary);
          min-width: 1.25rem;
          text-align: center;
          border-radius: 9999px;
        }

        .badges {
          display: flex;
          gap: 0.375rem;
          align-items: center;
        }

        .description {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .notes {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
        }

        .contextual-note {
          margin: 0.5rem 0 0 0;
          font-size: 0.75rem;
          color: var(--color-accent);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
