'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthSession } from '../components/auth-provider';
import { BrandMark } from '../components/brand';
import { ApisView } from '../components/dashboard/apis-view';
import { EnvironmentsView } from '../components/dashboard/environments-view';
import { ProjectsView } from '../components/dashboard/projects-view';
import { RequestHistoryView } from '../components/dashboard/request-history-view';
import { SettingsView } from '../components/dashboard/settings-view';
import { Empty } from '../components/dashboard/shared';
import {
  ApiIcon,
  EnvironmentIcon,
  HistoryIcon,
  MenuIcon,
  OverviewIcon,
  SettingsIcon,
} from '../components/icons';
import { ThemeToggle } from '../components/theme-toggle';
import {
  ApiDefinition,
  ControlPlaneClient,
  ControlPlaneError,
  Environment,
  Project,
  RequestHistory,
  Scenario,
} from '../lib/control-plane';

type View = 'overview' | 'apis' | 'environments' | 'requests' | 'settings';

const views: Array<[View, string]> = [
  ['overview', 'Overview'],
  ['apis', 'APIs'],
  ['environments', 'Environments'],
  ['requests', 'Request history'],
  ['settings', 'Settings'],
];

function NavIcon({ view }: { view: View }) {
  switch (view) {
    case 'overview':
      return <OverviewIcon width={15} height={15} />;
    case 'apis':
      return <ApiIcon width={15} height={15} />;
    case 'environments':
      return <EnvironmentIcon width={15} height={15} />;
    case 'requests':
      return <HistoryIcon width={15} height={15} />;
    case 'settings':
      return <SettingsIcon width={15} height={15} />;
  }
}

const descriptions: Record<View, string> = {
  overview: 'Projects available to your current control-plane session.',
  apis: 'Create, publish, test, and configure mock endpoints.',
  environments: 'Configure named environment context for a project.',
  requests: 'Inspect redacted traffic when request history is available.',
  settings: 'Manage your local dashboard session.',
};

const EMPTY_HISTORY: RequestHistory = {
  data: [],
  pagination: { page: 1, pageSize: 20, total: 0 },
};

export default function DashboardPage() {
  const router = useRouter();
  const { status, token, email, signOut, handleUnauthorized } = useAuthSession();

  const [view, setView] = useState<View>('overview');
  const [menu, setMenu] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [apis, setApis] = useState<ApiDefinition[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [requestHistory, setRequestHistory] = useState<RequestHistory>(EMPTY_HISTORY);
  const [selectedApiId, setSelectedApiId] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingProjectData, setLoadingProjectData] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectRequestSeq = useRef(0);
  const scenarioRequestSeq = useRef(0);
  const activeProjectRef = useRef('');

  const client = useMemo(() => new ControlPlaneClient(token ?? undefined), [token]);
  const project = projects.find((item) => item.id === projectId);
  const selectedApi = apis.find((item) => item.id === selectedApiId);

  const handleError = useCallback(
    (cause: unknown) => {
      if (cause instanceof ControlPlaneError && cause.status === 401 && token) {
        handleUnauthorized('Your session has expired. Please sign in again.');
        router.replace('/signin');
        return;
      }
      setError(
        cause instanceof ControlPlaneError ? cause.message : 'Could not reach the control plane.',
      );
    },
    [token, handleUnauthorized, router],
  );

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setLoadingProjects(true);
    try {
      setError(null);
      const data = await client.projects();
      setProjects(data);
      setProjectId((current) =>
        data.some((item) => item.id === current) ? current : data[0]?.id || '',
      );
    } catch (cause) {
      handleError(cause);
    } finally {
      setLoadingProjects(false);
    }
  }, [token, client, handleError]);

  const loadProjectData = useCallback(
    async (id = projectId) => {
      const requestSeq = ++projectRequestSeq.current;
      if (!token || !id) {
        activeProjectRef.current = '';
        scenarioRequestSeq.current += 1;
        setApis([]);
        setEnvironments([]);
        setRequestHistory(EMPTY_HISTORY);
        setSelectedApiId('');
        setScenarios([]);
        setLoadingProjectData(false);
        return;
      }
      if (activeProjectRef.current !== id) {
        activeProjectRef.current = id;
        scenarioRequestSeq.current += 1;
        setApis([]);
        setEnvironments([]);
        setRequestHistory(EMPTY_HISTORY);
        setSelectedApiId('');
        setScenarios([]);
      }
      setLoadingProjectData(true);
      try {
        setError(null);
        const [apiData, environmentData, history] = await Promise.all([
          client.apis(id),
          client.environments(id),
          client.requestHistory(id),
        ]);
        if (requestSeq !== projectRequestSeq.current) return;
        setApis(apiData);
        setEnvironments(environmentData);
        setRequestHistory(history);
        setSelectedApiId((current) =>
          apiData.some((api) => api.id === current) ? current : apiData[0]?.id || '',
        );
      } catch (cause) {
        if (requestSeq !== projectRequestSeq.current) return;
        handleError(cause);
      } finally {
        if (requestSeq === projectRequestSeq.current) {
          setLoadingProjectData(false);
        }
      }
    },
    [token, projectId, client, handleError],
  );

  const loadScenarios = useCallback(
    async (id = selectedApiId) => {
      const requestSeq = ++scenarioRequestSeq.current;
      if (!token || !id) {
        setScenarios([]);
        setLoadingScenarios(false);
        return;
      }
      setLoadingScenarios(true);
      try {
        const data = await client.scenarios(id);
        if (requestSeq !== scenarioRequestSeq.current) return;
        setScenarios(data);
      } catch (cause) {
        if (requestSeq !== scenarioRequestSeq.current) return;
        handleError(cause);
      } finally {
        if (requestSeq === scenarioRequestSeq.current) {
          setLoadingScenarios(false);
        }
      }
    },
    [token, selectedApiId, client, handleError],
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && token) {
      void loadProjects();
    }
  }, [status, token, loadProjects]);

  useEffect(() => {
    if (status === 'authenticated' && token) {
      void loadProjectData(projectId);
    }
  }, [status, token, projectId, loadProjectData]);

  useEffect(() => {
    if (status === 'authenticated' && token) {
      void loadScenarios(selectedApiId);
    }
  }, [status, token, selectedApiId, loadScenarios]);

  function handleSignOut() {
    signOut('Signed out.');
    router.replace('/signin');
  }

  if (status === 'checking' || status === 'unauthenticated') {
    return (
      <main className="auth-main" style={{ minHeight: '100vh' }}>
        <section className="panel auth-card" role="status" aria-live="polite">
          <div className="panel-header">
            <h1>{status === 'checking' ? 'Checking session' : 'Redirecting to sign in'}</h1>
          </div>
          <Empty
            title={status === 'checking' ? 'Verifying session' : 'Authentication required'}
            description={
              status === 'checking'
                ? 'Confirming your saved session with the control plane…'
                : 'Redirecting you to the sign-in page…'
            }
          />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <BrandMark href="/" />
        </div>
        <nav className="navigation">
          <p className="nav-label">Workspace</p>
          {views.slice(0, 4).map(([id, label]) => (
            <button
              className={`nav-item ${view === id ? 'nav-item-active' : ''}`}
              key={id}
              onClick={() => {
                setView(id);
                setMenu(false);
              }}
              type="button"
            >
              <NavIcon view={id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={`nav-item ${view === 'settings' ? 'nav-item-active' : ''}`}
            onClick={() => {
              setView('settings');
              setMenu(false);
            }}
            type="button"
          >
            <NavIcon view="settings" />
            <span>Settings</span>
          </button>
          <div className="account-row">
            <span className="account-avatar">{email ? email.slice(0, 1).toUpperCase() : '?'}</span>
            <span className="account-copy">
              <strong>{email || 'Signed in'}</strong>
              <small>Control plane session</small>
            </span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-button"
              type="button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <MenuIcon />
            </button>

            <select
              aria-label="Active project"
              className="project-picker"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setNotice(null);
                setError(null);
              }}
              disabled={loadingProjects}
            >
              <option value="">
                {loadingProjects ? 'Loading projects…' : 'Select project'}
              </option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="topbar-actions">
            <ThemeToggle />
            <button className="button button-secondary" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{views.find(([id]) => id === view)?.[1]}</h1>
              <p>{descriptions[view]}</p>
            </div>
            {view === 'apis' && project && (
              <button
                className="button button-primary"
                type="button"
                onClick={() =>
                  document.getElementById('create-api')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Create API
              </button>
            )}
          </div>

          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {view === 'settings' ? (
            <SettingsView email={email} project={project} onSignOut={handleSignOut} />
          ) : view === 'overview' ? (
            <ProjectsView
              projects={projects}
              selectedProjectId={projectId}
              loading={loadingProjects}
              client={client}
              onSelectProject={(id) => {
                setProjectId(id);
                setError(null);
              }}
              onOpenApis={(id) => {
                setProjectId(id);
                setView('apis');
                setError(null);
              }}
              onRefreshProjects={loadProjects}
              onNotify={(msg) => {
                setError(null);
                setNotice(msg);
              }}
              onError={handleError}
            />
          ) : !project ? (
            <section className="panel">
              <Empty
                title="Select a project"
                description="Choose a project from the top bar or create one in Overview before managing its configuration."
              />
            </section>
          ) : view === 'apis' ? (
            <ApisView
              project={project}
              apis={apis}
              environments={environments}
              selectedApi={selectedApi}
              scenarios={scenarios}
              loadingApis={loadingProjectData}
              loadingScenarios={loadingScenarios}
              client={client}
              selectApi={setSelectedApiId}
              refreshProject={() => loadProjectData(project.id)}
              refreshScenarios={() => loadScenarios(selectedApiId)}
              notify={(msg) => {
                setError(null);
                setNotice(msg);
              }}
              onError={handleError}
            />
          ) : view === 'environments' ? (
            <EnvironmentsView
              project={project}
              environments={environments}
              loading={loadingProjectData}
              client={client}
              onRefresh={() => loadProjectData(project.id)}
              onNotify={(msg) => {
                setError(null);
                setNotice(msg);
              }}
              onError={handleError}
            />
          ) : (
            <RequestHistoryView
              project={project}
              initialHistory={requestHistory}
              loadingInitial={loadingProjectData}
              client={client}
              onError={handleError}
            />
          )}
        </div>
      </section>

      {menu && (
        <button
          className="backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
    </main>
  );
}
