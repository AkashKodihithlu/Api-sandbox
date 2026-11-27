'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type View = 'overview' | 'apis' | 'environments' | 'requests' | 'settings';

const views: Array<{ id: View; label: string; icon: ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <GridIcon /> },
  { id: 'apis', label: 'APIs', icon: <ApiIcon /> },
  { id: 'environments', label: 'Environments', icon: <LayersIcon /> },
  { id: 'requests', label: 'Request history', icon: <HistoryIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

const descriptions: Record<View, string> = {
  overview: 'Select a project to inspect and manage its mock APIs.',
  apis: 'Create and manage the endpoints available in this project.',
  environments: 'Configure environment-specific response scenarios.',
  requests: 'Inspect redacted request activity for the selected project.',
  settings: 'Manage project access and configuration.',
};

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export default function HomePage() {
  const [activeView, setActiveView] = useState<View>('overview');
  const [theme, setTheme] = useState<Theme>('light');
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const initialTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const storedTheme = window.localStorage.getItem('mockflow.theme') as Theme | null;
    const resolvedTheme = storedTheme ?? initialTheme;
    setTheme(resolvedTheme);
    applyTheme(resolvedTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    window.localStorage.setItem('mockflow.theme', nextTheme);
    applyTheme(nextTheme);
  }

  const title = views.find((view) => view.id === activeView)?.label ?? 'Overview';

  return (
    <main className="app-shell">
      <aside className={`sidebar ${navigationOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><span>MockFlow</span></div>
        <nav className="navigation">
          <p className="nav-label">Workspace</p>
          {views.slice(0, 4).map((view) => <button className={`nav-item ${activeView === view.id ? 'nav-item-active' : ''}`} key={view.id} onClick={() => { setActiveView(view.id); setNavigationOpen(false); }} type="button">{view.icon}<span>{view.label}</span></button>)}
        </nav>
        <div className="sidebar-footer">
          <button className={`nav-item ${activeView === 'settings' ? 'nav-item-active' : ''}`} onClick={() => { setActiveView('settings'); setNavigationOpen(false); }} type="button"><SettingsIcon /><span>Settings</span></button>
          <div className="account-row"><span className="account-avatar" aria-hidden="true">?</span><span className="account-copy"><strong>Not signed in</strong><small>Control plane session</small></span></div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" type="button" aria-label="Open navigation" onClick={() => setNavigationOpen((open) => !open)}><MenuIcon /></button>
          <div className="project-selector" aria-label="Current project"><span className="project-dot" aria-hidden="true" /><span>No project selected</span><ChevronIcon /></div>
          <div className="topbar-actions"><button className={`theme-toggle ${theme === 'dark' ? 'theme-toggle-dark' : ''}`} type="button" role="switch" aria-checked={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}><span className="theme-toggle-icon theme-toggle-sun"><SunIcon /></span><span className="theme-toggle-icon theme-toggle-moon"><MoonIcon /></span><span className="theme-toggle-knob" /></button></div>
        </header>
        <div className="content">
          <div className="page-heading"><div><h1>{title}</h1><p>{descriptions[activeView]}</p></div>{activeView === 'apis' && <button className="button button-primary" type="button" disabled>Create API</button>}</div>
          <DashboardContent view={activeView} />
        </div>
      </section>
      {navigationOpen && <button className="backdrop" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} type="button" />}
    </main>
  );
}

function DashboardContent({ view }: { view: View }) {
  if (view === 'settings') return <section className="settings-list" aria-label="Project settings"><SettingRow label="Project access" description="Select a project to manage members and roles." /><SettingRow label="Runtime endpoint" description="Published endpoint settings become available after a project is selected." /><SettingRow label="Danger zone" description="Project deletion is unavailable until a project is selected." destructive /></section>;
  if (view === 'requests') return <section className="panel request-panel"><div className="filter-row" aria-label="Request filters"><button className="filter-control" type="button" disabled>All methods <ChevronIcon /></button><button className="filter-control" type="button" disabled>All status codes <ChevronIcon /></button><button className="filter-control" type="button" disabled>All time <ChevronIcon /></button></div><EmptyState title="No request history" description="Request activity will appear here after a project and its published endpoints receive traffic." /></section>;
  const tableTitle = view === 'apis' ? 'Endpoints' : view === 'environments' ? 'Environments' : 'Project activity';
  const emptyTitle = view === 'apis' ? 'No endpoints to show' : view === 'environments' ? 'No environments to show' : 'No project selected';
  const emptyDescription = view === 'apis' ? 'Select a project to create and manage its mock API endpoints.' : view === 'environments' ? 'Select a project to configure environment-specific mock scenarios.' : 'Choose a project from the control plane to begin managing its mock APIs.';
  return <section className="panel"><div className="panel-header"><h2>{tableTitle}</h2></div>{view !== 'overview' && <div className="table-header" aria-hidden="true"><span>{view === 'apis' ? 'Method' : 'Name'}</span><span>{view === 'apis' ? 'Path' : 'Description'}</span><span>Status</span></div>}<EmptyState title={emptyTitle} description={emptyDescription} /></section>;
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><div className="empty-mark" aria-hidden="true"><ApiIcon /></div><h3>{title}</h3><p>{description}</p></div>; }
function SettingRow({ label, description, destructive = false }: { label: string; description: string; destructive?: boolean }) { return <div className="setting-row"><div><h2>{label}</h2><p>{description}</p></div><button className={`button button-secondary ${destructive ? 'button-destructive' : ''}`} type="button" disabled>Unavailable</button></div>; }
function GridIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>; }
function ApiIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18-6-6 6-6M15 6l6 6-6 6M14 4l-4 16" /></svg>; }
function LayersIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Zm-8 9 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" /></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3.5 2" /></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.3 2.3-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6 17l.1-.1A1.7 1.7 0 0 0 6.4 15a1.7 1.7 0 0 0-1.5-1H4.7v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L6 7.8 8.3 5l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.3 2.3-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z" /></svg>; }
function SunIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function MoonIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.1A8.5 8.5 0 0 1 8.9 3.3 8.5 8.5 0 1 0 20.7 15.1Z" /></svg>; }
function ChevronIcon() { return <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>; }
function MenuIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
