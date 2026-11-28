import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from './components/auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'MockFlow — Mock API Control Plane & Runtime',
  description:
    'Create, configure, publish, and test scenario-driven mock APIs without waiting for a backend.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const preference = localStorage.getItem('mockflow.theme') || 'system'; const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference; document.documentElement.dataset.theme = theme; } catch {}`,
          }}
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
