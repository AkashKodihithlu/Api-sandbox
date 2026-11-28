import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ApiIcon,
  EnvironmentIcon,
  HistoryIcon,
  OverviewIcon,
  SettingsIcon,
  TerminalIcon,
} from '../components/icons';
import { LandingNav } from '../components/landing-nav';
import { PublicFooter } from '../components/public-footer';

export const metadata: Metadata = {
  title: 'Capabilities — MockFlow',
  description:
    'Explore MockFlow capabilities: project RBAC, draft/publish endpoints, scenario responses, environment overrides, live runtime testing, and redacted request history.',
};

const capabilitySections = [
  {
    id: 'projects',
    icon: <OverviewIcon width={16} height={16} />,
    label: 'Workspaces & RBAC',
    title: 'Project workspaces with role-based access',
    description:
      'Scope mock endpoints, environments, and request logs under unique project slugs. The Fastify control plane enforces Owner, Editor, and Viewer permissions on every operation.',
    bullets: [
      'Create, update, archive, or delete projects with unique URL slugs',
      'Owner role manages project settings, slug updates, and deletion',
      'Editor role creates, edits, and publishes APIs, scenarios, and environments',
      'Viewer role inspects project endpoints, scenarios, and request history read-only',
    ],
  },
  {
    id: 'endpoints',
    icon: <ApiIcon width={16} height={16} />,
    label: 'Endpoint Management',
    title: 'Draft & publish HTTP route lifecycle',
    description:
      'Define REST endpoints across GET, POST, PUT, PATCH, and DELETE methods. Iterate safely in draft mode before exposing routes on the public mock runtime.',
    bullets: [
      'Configure route name, HTTP method, path, and optional description',
      'Attach optional request JSON Schema definitions for contract clarity',
      'Toggle publish state without losing scenario configurations',
      'Draft endpoints stay isolated from live runtime traffic until published',
    ],
  },
  {
    id: 'scenarios',
    icon: <TerminalIcon width={16} height={16} />,
    label: 'Scenario Engine',
    title: 'Scenario-driven responses & latency simulation',
    description:
      'Model multiple behaviors per endpoint—such as SUCCESS, EMPTY, VALIDATION_ERROR, UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, or INTERNAL_ERROR—and switch defaults cleanly.',
    bullets: [
      'Custom HTTP status codes with automatic no-body checks on 1xx, 204, 205, and 304',
      'Custom JSON response headers and structured JSON response payloads',
      'Configurable artificial response delays from 0 ms up to 10,000 ms',
      'Designate any scenario as the endpoint default response',
    ],
  },
  {
    id: 'environments',
    icon: <EnvironmentIcon width={16} height={16} />,
    label: 'Environment Overrides',
    title: 'Named environments via request header',
    description:
      'Create project environments like Staging or QA and bind per-endpoint scenario overrides. Clients select an environment at runtime using a single HTTP header.',
    bullets: [
      'Create and rename project environments from the Environments tab',
      'Map any endpoint to a specific scenario override per environment',
      'Pass x-mockflow-environment: <name> on runtime requests to activate overrides',
      'Falls back cleanly to the endpoint default scenario when no override applies',
    ],
  },
  {
    id: 'runtime-testing',
    icon: <SettingsIcon width={16} height={16} />,
    label: 'Live Runtime',
    title: 'Built-in runtime endpoint tester',
    description:
      'Verify published endpoints directly inside the dashboard without switching to an external HTTP client. Inspect status codes, latency, headers, and formatted JSON.',
    bullets: [
      'Targets /runtime/p/{project-slug}{path} directly from the APIs view',
      'Supports custom request headers, JSON request bodies, and environment selection',
      'Displays response status, measured round-trip duration, headers, and pretty JSON',
    ],
  },
  {
    id: 'history',
    icon: <HistoryIcon width={16} height={16} />,
    label: 'Observability',
    title: 'Redacted request history & filtering',
    description:
      'Every runtime request is logged to PostgreSQL with sensitive headers automatically redacted, giving teams visibility into mock traffic without leaking credentials.',
    bullets: [
      'Filter recorded requests by HTTP method and response status code',
      'Paginated log list with expandable request details and latency metrics',
      'Automatic header redaction before logs are persisted and returned',
    ],
  },
];

export default function CapabilitiesPage() {
  return (
    <div className="landing-page">
      <LandingNav />

      <main>
        <section className="subpage-hero">
          <div className="section-inner">
            <p className="hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              Platform Capabilities
            </p>
            <h1>Everything built into MockFlow, from control plane to runtime.</h1>
            <p className="subpage-lead">
              MockFlow pairs a Fastify control-plane API and PostgreSQL store with an isolated mock
              runtime and a VS Code extension—built for predictable frontend and integration work.
            </p>
            <div className="hero-ctas">
              <Link href="/signup" className="button button-primary button-lg">
                Get started
              </Link>
              <Link href="/workflow" className="button button-secondary button-lg">
                See the workflow
              </Link>
              <Link href="/extension" className="button button-ghost button-lg">
                VS Code Extension
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="section-inner capability-detail-list">
            {capabilitySections.map((item, idx) => (
              <article className="panel capability-detail-card" key={item.id} id={item.id}>
                <div className="capability-detail-body">
                  <div className="capability-detail-head">
                    <div className="capability-icon" aria-hidden="true">
                      {item.icon}
                    </div>
                    <span className="section-label" style={{ marginBottom: 0 }}>
                      {String(idx + 1).padStart(2, '0')} · {item.label}
                    </span>
                  </div>
                  <h2>{item.title}</h2>
                  <p className="capability-detail-desc">{item.description}</p>
                  <ul className="extension-list" style={{ marginBottom: 0 }}>
                    {item.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-alt">
          <div className="section-inner extension-grid">
            <div>
              <span className="section-label">Runtime Contract</span>
              <h2>Predictable URL &amp; header behavior</h2>
              <p className="extension-lead">
                Published endpoints are served at <code>/runtime/p/{'{project-slug}'}{'{path}'}</code>{' '}
                (and directly on port <code>4001</code> at <code>/p/{'{project-slug}'}{'{path}'}</code>
                ). Add <code>x-mockflow-environment</code> to route traffic through an environment
                override.
              </p>
              <div className="hero-ctas">
                <Link href="/workflow" className="button button-primary">
                  Walk through workflow
                </Link>
                <Link href="/extension" className="button button-secondary">
                  Download VS Code Extension
                </Link>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header panel-header-split">
                <h3>Example Runtime Request</h3>
                <span className="status-pill status-pill-published">200 OK</span>
              </div>
              <div className="preview-body">
                <pre className="preview-code">
                  <code>{`curl -i http://localhost:4001/p/checkout-api/v1/orders \\
  -H "x-mockflow-environment: Staging"

# Response
HTTP/1.1 200 OK
content-type: application/json
{
  "orders": [
    { "id": "ord_1042", "status": "paid", "total": 4900 }
  ],
  "hasMore": false
}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta-band">
          <div className="cta-band-inner">
            <div>
              <h2>Ready to configure your first mock API?</h2>
              <p>Create an account or sign in to open your MockFlow workspace.</p>
            </div>
            <div className="hero-ctas">
              <Link href="/signup" className="button button-lg button-cta-white">
                Create free account
              </Link>
              <Link href="/signin" className="button button-lg button-cta-outline">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
