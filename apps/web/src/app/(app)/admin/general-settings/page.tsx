'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';
import { AdminSettingsSubnav } from '@/components/AdminSettingsSubnav';

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
  {
    id: 'facility',
    title: 'Facility Settings',
    description: 'Configure facility-level features like Timeout & Debrief checklists',
    path: '/admin/general-settings/facility',
    icon: '🏢',
  },
];

export default function AdminGeneralSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Check admin access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('ADMIN');

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

      <main className="container py-8">
        <AdminSettingsSubnav />
        <p className="text-text-muted mb-8 max-w-[600px]">
          Configure facility-specific options for forms and workflows. Changes apply to all users in your facility.
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
          {SETTINGS_CARDS.map((card) => (
            <div
              key={card.id}
              className="group flex items-center gap-4 bg-surface-primary border border-border rounded-xl p-6 cursor-pointer transition-all hover:border-accent hover:shadow-[0_4px_12px_rgba(96,165,250,0.15)] hover:-translate-y-0.5 focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(96,165,250,0.2)]"
              onClick={() => router.push(card.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push(card.path);
                }
              }}
            >
              <div className="text-[2.5rem] shrink-0">{card.icon}</div>
              <div className="flex-1 min-w-0">
                <h2 className="m-0 mb-2 text-lg text-text-primary">{card.title}</h2>
                <p className="m-0 text-sm text-text-muted leading-[1.4]">{card.description}</p>
              </div>
              <div className="text-2xl text-text-muted shrink-0 transition-transform group-hover:translate-x-1 group-hover:text-accent">→</div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
