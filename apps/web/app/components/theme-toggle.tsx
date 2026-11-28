'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('mockflow.theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const initial = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const saved = localStorage.getItem('mockflow.theme');
    const resolved: Theme = saved === 'dark' || saved === 'light' ? saved : initial;
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      className={`theme-toggle ${theme === 'dark' ? 'theme-toggle-dark' : ''}`}
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-icon theme-toggle-sun">
        <span aria-hidden="true">☼</span>
      </span>
      <span className="theme-toggle-icon theme-toggle-moon">
        <span aria-hidden="true">◐</span>
      </span>
      <span className="theme-toggle-knob" />
    </button>
  );
}
