import Link from 'next/link';
import { LandingNav } from './components/landing-nav';

const capabilities = [
  {
    title: 'Project workspaces & RBAC',
    description:
      'Organize mock APIs under isolated project slugs with Owner, Editor, and Viewer access enforced by the control plane.',
  },
  {
    title: 'Draft & publish lifecycle',
    description:
      'Define GET, POST, PUT, PATCH, and DELETE routes, configure responses in draft mode, and publish when ready.',
  },
  {
    title: 'Scenario-driven responses',
    description:
      'Configure status codes, custom headers, JSON payloads, and artificial delays (up to 10,000 ms) across SUCCESS, EMPTY, and error states.',
  },
  {
    title: 'Named environments',
    description:
      'Create environments like Staging or QA and bind per-endpoint scenario overrides via the x-mockflow-environment header.',
  },
  {
    title: 'Live runtime testing',
    description:
      'Send requests directly to /runtime/p/{project-slug}/{path} from the dashboard and inspect status, headers, and formatted JSON.',
  },
  {
    title: 'Redacted request history',
    description:
      'Inspect recorded runtime traffic with automatic header redaction, latency metrics, method/status filters, and pagination.',
  },
];

const extensionFeatures = [
  'Workspace API discovery: scan your local codebase for routes, review findings, or ignore false positives.',
  'Projects & API Discovery tree views right inside the VS Code activity bar.',
  'Configure endpoints, response scenarios, and request JSON Schemas without leaving the editor.',
  'Publish or unpublish endpoints, copy hosted runtime URLs, and run live endpoint tests from VS Code commands.',
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNav />

      <main>
        <section className="hero-section">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-eyebrow">Mock API Control Plane &amp; Runtime</p>
              <h1>Ship frontend and integrations without waiting on a backend.</h1>
              <p className="hero-lead">
                MockFlow lets developers create, configure, publish, and test scenario-driven mock
                APIs with isolated project URLs, environment overrides, and redacted request logs.
              </p>
              <div className="hero-ctas">
                <Link href="/signup" className="button button-primary button-lg">
                  Get started
                </Link>
                <Link href="/signin" className="button button-secondary button-lg">
                  Sign in
                </Link>
                <a href="#capabilities" className="button button-ghost button-lg">
                  Explore capabilities
                </a>
              </div>
            </div>

            <div className="hero-preview panel" aria-label="MockFlow endpoint preview">
              <div className="panel-header preview-header">
                <span className="preview-title">
                  <span className="method method-get">GET</span>
                  <code>/v1/orders</code>
                </span>
                <span className="status-pill status-pill-published">Published</span>
              </div>
              <div className="preview-body">
                <div className="preview-meta">
                  <span>
                    Runtime: <code>/runtime/p/checkout-api/v1/orders</code>
                  </span>
                  <span>
                    Environment: <code>Staging</code>
                  </span>
                </div>
                <div className="preview-scenarios">
                  <div className="preview-scenario preview-scenario-active">
                    <strong>Default response</strong>
                    <span>200 · SUCCESS · 0 ms</span>
                  </div>
                  <div className="preview-scenario">
                    <strong>Empty list</strong>
                    <span>200 · EMPTY · 120 ms</span>
                  </div>
                  <div className="preview-scenario">
                    <strong>Unauthorized</strong>
                    <span>401 · UNAUTHORIZED · 0 ms</span>
                  </div>
                </div>
                <pre className="preview-code">
                  <code>{`{
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

        <section id="capabilities" className="landing-section">
          <div className="section-inner">
            <div className="section-heading">
              <h2>Everything you need to mock and verify APIs</h2>
              <p>
                Built around a Fastify control plane, a dedicated mock runtime, and a PostgreSQL-backed
                configuration store.
              </p>
            </div>
            <div className="capabilities-grid">
              {capabilities.map((item) => (
                <article className="panel capability-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="landing-section landing-section-alt">
          <div className="section-inner">
            <div className="section-heading">
              <h2>From draft to hosted mock in four steps</h2>
              <p>A predictable workflow designed for local development and team collaboration.</p>
            </div>
            <div className="workflow-steps">
              <div className="panel workflow-step">
                <span className="step-index">1</span>
                <h3>Create a project</h3>
                <p>Pick a project name and unique URL slug to scope your endpoints and logs.</p>
              </div>
              <div className="panel workflow-step">
                <span className="step-index">2</span>
                <h3>Define endpoints &amp; scenarios</h3>
                <p>Add HTTP routes and configure status codes, headers, JSON bodies, and delays.</p>
              </div>
              <div className="panel workflow-step">
                <span className="step-index">3</span>
                <h3>Publish &amp; override</h3>
                <p>Publish endpoints to the runtime and optionally map environment overrides.</p>
              </div>
              <div className="panel workflow-step">
                <span className="step-index">4</span>
                <h3>Test &amp; inspect history</h3>
                <p>Execute live requests in the dashboard and review redacted request history.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="extension" className="landing-section">
          <div className="section-inner extension-grid">
            <div>
              <p className="hero-eyebrow">Editor Integration</p>
              <h2>MockFlow VS Code Extension</h2>
              <p className="extension-lead">
                Keep API discovery and mock configuration close to your code. The MockFlow VS Code
                extension is included in this monorepo at <code>apps/vscode-extension</code> and
                connects directly to your control-plane and runtime servers.
              </p>
              <ul className="extension-list">
                {extensionFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="hero-ctas">
                <Link href="/signup" className="button button-primary">
                  Create an account to connect
                </Link>
                <Link href="/signin" className="button button-secondary">
                  Sign in to dashboard
                </Link>
              </div>
            </div>

            <div className="panel extension-card">
              <div className="panel-header">
                <h3>Included Extension Commands</h3>
              </div>
              <div className="extension-commands">
                <div className="extension-cmd">
                  <code>MockFlow: Scan Workspace for APIs</code>
                  <span>Discover routes in your repository</span>
                </div>
                <div className="extension-cmd">
                  <code>MockFlow: Review Discovery</code>
                  <span>Promote discovered routes into drafts</span>
                </div>
                <div className="extension-cmd">
                  <code>MockFlow: Edit Endpoint &amp; Scenarios</code>
                  <span>Update responses and request schemas</span>
                </div>
                <div className="extension-cmd">
                  <code>MockFlow: Publish / Unpublish Endpoint</code>
                  <span>Toggle live runtime availability</span>
                </div>
                <div className="extension-cmd">
                  <code>MockFlow: Copy Hosted URL</code>
                  <span>Copy the runtime endpoint URL</span>
                </div>
                <div className="extension-cmd">
                  <code>MockFlow: Test Published Endpoint</code>
                  <span>Run quick runtime checks from VS Code</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta-band">
          <div className="section-inner cta-band-inner">
            <div>
              <h2>Ready to start mocking?</h2>
              <p>Create an account or sign in to open your MockFlow workspace dashboard.</p>
            </div>
            <div className="hero-ctas">
              <Link href="/signup" className="button button-primary button-lg">
                Create free account
              </Link>
              <Link href="/signin" className="button button-secondary button-lg">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <strong>MockFlow</strong>
            <p className="footer-note">
              Monorepo workspace: control plane (<code>apps/api</code>), runtime (
              <code>apps/runtime</code>), web UI (<code>apps/web</code>), and VS Code extension (
              <code>apps/vscode-extension</code>).
            </p>
          </div>
          <div className="footer-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">Workflow</a>
            <a href="#extension">VS Code Extension</a>
            <Link href="/signin">Sign in</Link>
            <Link href="/signup">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
