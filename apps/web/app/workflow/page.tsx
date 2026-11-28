import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '../components/landing-nav';
import { PublicFooter } from '../components/public-footer';

export const metadata: Metadata = {
  title: 'Workflow — MockFlow',
  description:
    'Step-by-step MockFlow workflow: create a project, define endpoints and scenarios, publish with environment overrides, test runtime responses, and connect VS Code.',
};

const workflowStages = [
  {
    step: '01',
    title: 'Create or select a project workspace',
    summary:
      'Organize endpoints under a dedicated project name and URL-safe slug (for example, checkout-api). Your slug scopes all runtime URLs, environments, and request history.',
    detail: 'Overview → New project → Name, slug, and optional description',
    snippet: `Project: Checkout API
Slug:    checkout-api
Runtime: /runtime/p/checkout-api/{path}`,
  },
  {
    step: '02',
    title: 'Define API endpoints in draft mode',
    summary:
      'Add HTTP routes using GET, POST, PUT, PATCH, or DELETE. Endpoints start as drafts so you can shape paths and descriptions before exposing them on the runtime.',
    detail: 'APIs → New endpoint → Name, HTTP method, path, description',
    snippet: `GET  /v1/orders   [Draft]
POST /v1/orders   [Draft]`,
  },
  {
    step: '03',
    title: 'Configure response scenarios',
    summary:
      'Attach one or more scenarios to each endpoint. Set status codes, custom response headers, JSON payloads, artificial delays (0–10,000 ms), and mark one scenario as default.',
    detail: 'Scenario editor → New scenario → Status, delay, headers, JSON body',
    snippet: `{
  "name": "Default response",
  "type": "SUCCESS",
  "statusCode": 200,
  "delayMs": 0,
  "isDefault": true
}`,
  },
  {
    step: '04',
    title: 'Publish & map environment overrides',
    summary:
      'Publish the endpoint when it is ready to serve live traffic. Optionally create named environments (Staging, QA) and bind per-endpoint scenario overrides.',
    detail: 'APIs → Publish · Environments → New environment → Assign override',
    snippet: `Header: x-mockflow-environment: Staging
Target: GET /runtime/p/checkout-api/v1/orders -> Empty list (200)`,
  },
  {
    step: '05',
    title: 'Test live & inspect redacted request history',
    summary:
      'Send requests from the built-in Runtime endpoint tester or any HTTP client. Review recorded traffic in Request history with method/status filters, latency, and redacted headers.',
    detail: 'Runtime tester → Send test request · Request history → Filter & Details',
    snippet: `GET /v1/orders · 200 · 14 ms
Redacted headers: authorization: [REDACTED]`,
  },
  {
    step: '06',
    title: 'Integrate with VS Code',
    summary:
      'Install the MockFlow VS Code extension to scan your local repository for API routes, review discoveries into drafts, edit scenarios, and test published endpoints from your editor.',
    detail: 'VS Code Activity Bar → MockFlow → Scan Workspace for APIs',
    snippet: `MockFlow: Scan Workspace for APIs
MockFlow: Review Discovery
MockFlow: Edit Endpoint & Scenarios`,
  },
];

export default function WorkflowPage() {
  return (
    <div className="landing-page">
      <LandingNav />

      <main>
        <section className="subpage-hero">
          <div className="section-inner">
            <p className="hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              End-to-End Workflow
            </p>
            <h1>From local route draft to hosted mock runtime in six steps.</h1>
            <p className="subpage-lead">
              Every stage maps directly to the MockFlow control plane, runtime server, dashboard
              views, and VS Code extension.
            </p>
            <div className="hero-ctas">
              <Link href="/signup" className="button button-primary button-lg">
                Start a workspace
              </Link>
              <Link href="/capabilities" className="button button-secondary button-lg">
                Explore capabilities
              </Link>
              <Link href="/extension" className="button button-ghost button-lg">
                Get VS Code Extension
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="section-inner workflow-timeline">
            {workflowStages.map((stage) => (
              <article className="panel workflow-stage-card" key={stage.step}>
                <div className="workflow-stage-copy">
                  <span className="section-label">Step {stage.step}</span>
                  <h2>{stage.title}</h2>
                  <p>{stage.summary}</p>
                  <p className="workflow-stage-path">
                    <code>{stage.detail}</code>
                  </p>
                </div>
                <pre className="preview-code workflow-stage-code">
                  <code>{stage.snippet}</code>
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta-band">
          <div className="cta-band-inner">
            <div>
              <h2>Ready to run the workflow yourself?</h2>
              <p>Sign up to open the dashboard or download the VS Code extension.</p>
            </div>
            <div className="hero-ctas">
              <Link href="/signup" className="button button-lg button-cta-white">
                Create free account
              </Link>
              <Link href="/extension" className="button button-lg button-cta-outline">
                Download VS Code Extension
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
