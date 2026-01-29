'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from '@/app/components/Header';

export default function HelpPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      <Header title="Help & FAQ" />
      <main className="container-full help-page">

        <section className="help-section">
          <h2>Getting Started</h2>

          <details>
            <summary>How do I log in?</summary>
            <div className="answer">
              <p>Enter your <strong>Facility Key</strong>, <strong>Username</strong>, and <strong>Password</strong> on the login page. Your facility key identifies your surgery center — your administrator can provide it if you don&apos;t have it.</p>
            </div>
          </details>

          <details>
            <summary>What is the Dashboard?</summary>
            <div className="answer">
              <p>The Dashboard is your home screen. It shows feature cards based on your role — only the features you have access to will appear. Click any card to navigate to that section.</p>
            </div>
          </details>

          <details>
            <summary>What are the different user roles?</summary>
            <div className="answer">
              <table className="help-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Admin</td><td>Full access to all features including user management, settings, and reports</td></tr>
                  <tr><td>Scheduler</td><td>Manage the calendar, approve and schedule cases, assign rooms</td></tr>
                  <tr><td>Inventory Tech</td><td>Manage inventory, check in items, handle the risk queue</td></tr>
                  <tr><td>Circulator</td><td>View cases, complete surgical timeouts and debriefs</td></tr>
                  <tr><td>Scrub</td><td>View cases, sign off on timeouts and debriefs</td></tr>
                  <tr><td>Surgeon</td><td>View your cases, manage preference cards, sign debriefs</td></tr>
                  <tr><td>Anesthesia</td><td>View cases and participate in OR workflows</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>Calendar</h2>

          <details>
            <summary>How do I switch calendar views?</summary>
            <div className="answer">
              <p>Use the <strong>Month</strong>, <strong>Week</strong>, and <strong>Day</strong> buttons at the top of the calendar to switch views. You can also click on a specific date in Month view to jump to that day.</p>
            </div>
          </details>

          <details>
            <summary>What do the colored dots on cases mean?</summary>
            <div className="answer">
              <ul>
                <li><span className="dot green"></span> <strong>Green</strong> — All required items are available. The case is ready.</li>
                <li><span className="dot orange"></span> <strong>Orange</strong> — Some items are missing or pending. Needs attention.</li>
                <li><span className="dot red"></span> <strong>Red</strong> — Critical items are missing. The case is not ready.</li>
              </ul>
            </div>
          </details>

          <details>
            <summary>How do I view case details from the calendar?</summary>
            <div className="answer">
              <p>Click on any case in the calendar to open its details. From Day view, you can see all cases for that day organized by time or by operating room.</p>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>Cases</h2>

          <details>
            <summary>How do I request a new case?</summary>
            <div className="answer">
              <p>Navigate to <strong>Case Requests</strong> from the Dashboard. Click <strong>New Case Request</strong> and fill in the surgeon, procedure, preferred date/time, and any notes. The request will be sent to a scheduler for approval.</p>
            </div>
          </details>

          <details>
            <summary>What is the case lifecycle?</summary>
            <div className="answer">
              <ol>
                <li><strong>Requested</strong> — A case has been submitted and awaits scheduler approval.</li>
                <li><strong>Scheduled</strong> — The case is approved and placed on the calendar.</li>
                <li><strong>Ready</strong> — All required items and preparations are confirmed.</li>
                <li><strong>In Progress</strong> — The procedure is underway.</li>
                <li><strong>Completed</strong> — The procedure is finished and documented.</li>
              </ol>
            </div>
          </details>

          <details>
            <summary>How do I check if a case is ready?</summary>
            <div className="answer">
              <p>Open the case to see its readiness dashboard. Each required item from the surgeon&apos;s preference card is listed with its availability status. Green means available, red means missing.</p>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>Surgeon Preference Cards</h2>

          <details>
            <summary>What is a Preference Card?</summary>
            <div className="answer">
              <p>A Preference Card documents everything a surgeon needs for a specific procedure — instruments, equipment, supplies, medications, positioning preferences, and special notes. It ensures consistent OR setup every time.</p>
            </div>
          </details>

          <details>
            <summary>How do I view or edit a Preference Card?</summary>
            <div className="answer">
              <p>Go to <strong>Preference Cards</strong> from the Dashboard. Select a surgeon and procedure to view the card. If you have edit access, you can update any section. Changes are tracked with version history.</p>
            </div>
          </details>

          <details>
            <summary>Can I create a new Preference Card from an existing one?</summary>
            <div className="answer">
              <p>Yes. Open an existing card and use the <strong>Clone</strong> feature to create a copy. You can then modify it for a different procedure or surgeon.</p>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>OR Workflows</h2>

          <details>
            <summary>What is the Surgical Timeout?</summary>
            <div className="answer">
              <p>The Surgical Timeout is a safety checklist completed before the procedure begins. It verifies patient identity, procedure details, and required equipment. All team members must confirm before proceeding.</p>
            </div>
          </details>

          <details>
            <summary>What is the Debrief?</summary>
            <div className="answer">
              <p>The Debrief is completed after the procedure. It documents what happened, any issues encountered, and collects signatures from the OR team (circulator, scrub, surgeon). Staff who have left can sign asynchronously via <strong>Pending Reviews</strong>.</p>
            </div>
          </details>

          <details>
            <summary>What if someone missed signing a Debrief?</summary>
            <div className="answer">
              <p>Outstanding signatures appear in <strong>Pending Reviews</strong> on the Dashboard. The staff member can sign from there at any time.</p>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>Admin Features</h2>
          <p className="section-note">These features are available to users with the Admin role.</p>

          <details>
            <summary>How do I manage users?</summary>
            <div className="answer">
              <p>Go to <strong>Admin &gt; Users</strong>. You can add new users, assign roles, and activate or deactivate accounts. Users can hold multiple roles.</p>
            </div>
          </details>

          <details>
            <summary>How do I approve case requests?</summary>
            <div className="answer">
              <p>Pending case requests appear in <strong>Case Requests</strong> with a badge count on the Dashboard. Open the request, review the details, assign a room and time, then approve it to add it to the calendar.</p>
            </div>
          </details>

          <details>
            <summary>How do I assign operating rooms?</summary>
            <div className="answer">
              <p>Rooms can be assigned when approving a case request, or later from the case details. Go to <strong>Unassigned Cases</strong> to see all cases that still need a room assignment.</p>
            </div>
          </details>

          <details>
            <summary>How do I manage inventory and catalog?</summary>
            <div className="answer">
              <p>Use <strong>Admin &gt; Catalog</strong> to organize items into groups and sets. Use <strong>Admin &gt; Inventory</strong> to track stock levels, check in new items, and manage the risk queue for flagged items.</p>
            </div>
          </details>
        </section>

        <section className="help-section">
          <h2>Troubleshooting</h2>

          <details>
            <summary>I can&apos;t see certain features on my Dashboard</summary>
            <div className="answer">
              <p>The Dashboard only shows features your role has access to. If you need access to additional features, contact your administrator to update your role.</p>
            </div>
          </details>

          <details>
            <summary>I&apos;m getting &quot;Facility not found&quot; when logging in</summary>
            <div className="answer">
              <p>Make sure the Facility Key field matches your surgery center&apos;s key exactly. It is case-sensitive. Contact your administrator if you&apos;re unsure of the correct key.</p>
            </div>
          </details>

          <details>
            <summary>A case shows as &quot;not ready&quot; but I think everything is available</summary>
            <div className="answer">
              <p>Open the case details and check each line item. Items must be checked in through inventory to register as available. If an item was recently received, it may need to be checked in by an Inventory Tech.</p>
            </div>
          </details>
        </section>

      </main>

      <style jsx>{`
        .help-page {
          padding: 2rem 1.5rem;
          max-width: 800px;
          margin: 0 auto;
        }

        .help-section {
          margin-bottom: 2.5rem;
        }

        .help-section h2 {
          font-size: 1.25rem;
          color: #2d3748;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 0.5rem;
          margin: 0 0 1rem 0;
        }

        .section-note {
          font-size: 0.85rem;
          color: #718096;
          font-style: italic;
          margin: 0 0 1rem 0;
        }

        details {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 0.5rem;
          background: white;
        }

        summary {
          padding: 0.875rem 1rem;
          font-weight: 500;
          color: #2d3748;
          cursor: pointer;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        summary::-webkit-details-marker {
          display: none;
        }

        summary::before {
          content: '▶';
          font-size: 0.7rem;
          color: #a0aec0;
          transition: transform 0.15s ease;
        }

        details[open] summary::before {
          transform: rotate(90deg);
        }

        summary:hover {
          color: #3182ce;
        }

        .answer {
          padding: 0 1rem 1rem 1.75rem;
          color: #4a5568;
          font-size: 0.9rem;
          line-height: 1.6;
        }

        .answer p {
          margin: 0 0 0.5rem 0;
        }

        .answer p:last-child {
          margin-bottom: 0;
        }

        .answer ul, .answer ol {
          margin: 0.5rem 0;
          padding-left: 1.25rem;
        }

        .answer li {
          margin-bottom: 0.375rem;
        }

        .dot {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 0.25rem;
          vertical-align: middle;
        }

        .dot.green { background: #22c55e; }
        .dot.orange { background: #f97316; }
        .dot.red { background: #ef4444; }

        .help-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          margin-top: 0.5rem;
        }

        .help-table th,
        .help-table td {
          padding: 0.5rem 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }

        .help-table th {
          background: #f7fafc;
          font-weight: 600;
          color: #2d3748;
        }

        .help-table td:first-child {
          font-weight: 500;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}
