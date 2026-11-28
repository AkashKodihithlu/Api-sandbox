'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuthSession } from './auth-provider';
import { BrandMark } from './brand';
import { MenuIcon } from './icons';
import { ThemeToggle } from './theme-toggle';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/workflow', label: 'Workflow' },
  { href: '/extension', label: 'VS Code Extension' },
];

export function LandingNav() {
  const { status } = useAuthSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="public-header-inner">
        <BrandMark href="/" />

        <nav className={`public-nav ${menuOpen ? 'public-nav-open' : ''}`} aria-label="Primary">
          {navLinks.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'public-nav-active' : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
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
            <MenuIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
