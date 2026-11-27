import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'MockFlow',
  description: 'Mock API control plane',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { const preference = localStorage.getItem('mockflow.theme') || 'system'; const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference; document.documentElement.dataset.theme = theme; } catch {}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
