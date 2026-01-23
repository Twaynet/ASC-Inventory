'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useAccessControl } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { getCases, getUnassignedCases } from '@/lib/api';
import type { FeatureDefinition, AccessDecision } from '@/lib/access-control';

export default function SystemDashboard() {
  const { user, token, isLoading, logout } = useAuth();
  const { features, debugInfo } = useAccessControl();
  const router = useRouter();
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [pendingCaseCount, setPendingCaseCount] = useState<number>(0);
  const [unassignedCaseCount, setUnassignedCaseCount] = useState<number>(0);

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

  // Redirect to login if not authenticated
  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

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
          padding: 2rem 0;
        }

        .debug-panel {
          margin-top: 3rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px dashed #ccc;
        }

        .debug-toggle {
          background: none;
          border: none;
          font-size: 0.875rem;
          color: #666;
          cursor: pointer;
          padding: 0;
          font-family: monospace;
        }

        .debug-toggle:hover {
          color: #333;
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
          color: #333;
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
          background: #e3f2fd;
          color: #1565c0;
        }

        .debug-tag.capability {
          background: #f3e5f5;
          color: #7b1fa2;
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
          border-bottom: 1px solid #ddd;
        }

        .debug-table th {
          background: #eee;
          font-weight: 600;
        }

        .debug-table tr.allowed td:nth-child(2) {
          color: #2e7d32;
        }

        .debug-table tr.denied td:nth-child(2) {
          color: #c62828;
        }

        .debug-table .reason {
          color: #666;
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
          color: #2d3748;
          border-bottom: 2px solid #e2e8f0;
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
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          transition: all 0.15s ease;
        }

        .feature-card.clickable {
          cursor: pointer;
        }

        .feature-card.clickable:hover {
          border-color: #3182ce;
          box-shadow: 0 2px 8px rgba(49, 130, 206, 0.15);
          transform: translateY(-1px);
        }

        .feature-card.disabled {
          opacity: 0.5;
          background: #f7fafc;
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
          color: #2d3748;
        }

        .badge {
          font-size: 0.65rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .badge.admin {
          background: #fed7d7;
          color: #c53030;
        }

        .badge.contextual {
          background: #e9d8fd;
          color: #6b46c1;
        }

        .badge.count {
          background: #3b82f6;
          color: white;
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
          color: #4a5568;
          line-height: 1.4;
        }

        .notes {
          margin: 0;
          font-size: 0.75rem;
          color: #718096;
          font-style: italic;
        }

        .contextual-note {
          margin: 0.5rem 0 0 0;
          font-size: 0.75rem;
          color: #805ad5;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
