'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuthSession } from './auth-provider';
import { BrandMark } from './brand';
import { ThemeToggle } from './theme-toggle';

export function LandingNav() {
  const { status } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="public-header-inner">
        <BrandMark href="/" />

        <nav className={`public-nav ${menuOpen ? 'public-nav-open' : ''}`} aria-label="Primary">
          <a href="#capabilities" onClick={() => setMenuOpen(false)}>
            Capabilities
          </a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>
            Workflow
          </a>
          <a href="#extension" onClick={() => setMenuOpen(false)}>
            VS Code Extension
          </a>
        </nav>

        <div className="public-header-actions">
          <ThemeToggle />
          {status === 'authenticated' ? (
            <Link href="/dashboard" className="button button-primary">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/signin" className="button button-secondary">
                Sign in
              </Link>
              <Link href="/signup" className="button button-primary">
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            className="icon-button public-menu-button"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>
    </header>
  );
}
