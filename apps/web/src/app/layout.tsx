import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Footer } from './components/Footer';
import './globals.css';

export const metadata = {
  title: 'ASC Inventory Truth System',
  description: 'Day-before readiness review for ambulatory surgery centers',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="app-container">
            <main className="app-main">{children}</main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
