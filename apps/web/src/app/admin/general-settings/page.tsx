'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';

interface SettingsCard {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: string;
}

const SETTINGS_CARDS: SettingsCard[] = [
  {
    id: 'operating-rooms',
    title: 'Operating Rooms',
    description: 'Manage operating rooms available at your facility for case scheduling',
    path: '/admin/general-settings/operating-rooms',
    icon: '🚪',
  },
  {
    id: 'surgeons',
    title: 'Surgeon Settings',
    description: 'Assign display colors and configure settings for surgeons',
    path: '/admin/general-settings/surgeons',
    icon: '👨‍⚕️',
  },
  {
    id: 'case-dashboard',
    title: 'Case Dashboard Settings',
    description: 'Configure Patient Flags, Anesthesia Modalities, Time Out & Debrief, and other case-specific options',
    path: '/admin/general-settings/case-dashboard',
    icon: '🏥',
  },
];

export default function AdminGeneralSettingsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <>
        <Header title="General Settings" />
        <main className="container">
          <div className="alert alert-error">
            Access denied. This page is only available to administrators.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="General Settings" />

      <main className="container general-settings-dashboard">
        <p className="page-description">
          Configure facility-specific options for forms and workflows. Changes apply to all users in your facility.
        </p>

        <div className="settings-grid">
          {SETTINGS_CARDS.map((card) => (
            <div
              key={card.id}
              className="settings-card"
              onClick={() => router.push(card.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push(card.path);
                }
              }}
            >
              <div className="card-icon">{card.icon}</div>
              <div className="card-content">
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              <div className="card-arrow">→</div>
            </div>
          ))}
        </div>
      </main>

      <style jsx>{`
        .general-settings-dashboard {
          padding: 2rem 0;
        }

        .page-description {
          color: #718096;
          margin-bottom: 2rem;
          max-width: 600px;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
        }

        .settings-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .settings-card:hover {
          border-color: #3182ce;
          box-shadow: 0 4px 12px rgba(49, 130, 206, 0.15);
          transform: translateY(-2px);
        }

        .settings-card:focus {
          outline: none;
          border-color: #3182ce;
          box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.2);
        }

        .card-icon {
          font-size: 2.5rem;
          flex-shrink: 0;
        }

        .card-content {
          flex: 1;
          min-width: 0;
        }

        .card-content h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.125rem;
          color: #2d3748;
        }

        .card-content p {
          margin: 0;
          font-size: 0.875rem;
          color: #718096;
          line-height: 1.4;
        }

        .card-arrow {
          font-size: 1.5rem;
          color: #a0aec0;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .settings-card:hover .card-arrow {
          transform: translateX(4px);
          color: #3182ce;
        }

        @media (max-width: 480px) {
          .settings-card {
            padding: 1rem;
          }

          .card-icon {
            font-size: 2rem;
          }
        }
      `}</style>
    </>
  );
}
