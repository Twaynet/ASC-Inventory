import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { PersonaProvider } from '@/lib/persona';
import { Footer } from './components/Footer';
import './globals.css';

export const metadata = {
  title: 'ASC Inventory Truth System',
  description: 'Day-before readiness review for ambulatory surgery centers',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var t = localStorage.getItem('theme');
            if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          })();
        `}} />
      </head>
      <body>
        <AuthProvider>
          <PersonaProvider>
            <div className="app-container">
              <main className="app-main">{children}</main>
              <Footer />
            </div>
          </PersonaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
