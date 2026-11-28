import type { Metadata } from 'next';
import Link from 'next/link';
import { TerminalIcon } from '../components/icons';
import { LandingNav } from '../components/landing-nav';
import { PublicFooter } from '../components/public-footer';

export const metadata: Metadata = {
  title: 'VS Code Extension — MockFlow',
  description:
    'Download the MockFlow VS Code Extension (.vsix) v0.1.0 without signing in. Discover workspace APIs, edit scenarios, publish endpoints, and test runtime URLs.',
};

const VSIX_FILENAME = 'mockflow-vscode-extension-0.1.0.vsix';
const VSIX_PATH = `/downloads/${VSIX_FILENAME}`;

const extensionCommands = [
  { cmd: 'MockFlow: Sign In', desc: 'Authenticate your editor session with the control plane' },
  { cmd: 'MockFlow: Sign Out', desc: 'Clear your stored VS Code session' },
  { cmd: 'MockFlow: Select Project', desc: 'Choose the active MockFlow project workspace' },
  { cmd: 'MockFlow: Refresh', desc: 'Reload Projects and API Discovery tree views' },
  { cmd: 'MockFlow: Scan Workspace for APIs', desc: 'Scan local source files for API routes' },
  { cmd: 'MockFlow: Review Discovery', desc: 'Promote discovered routes into API drafts' },
  { cmd: 'MockFlow: Ignore Discovery', desc: 'Dismiss false-positive route findings' },
  { cmd: 'MockFlow: Edit Endpoint & Scenarios', desc: 'Configure responses, delays, and request schemas' },
  { cmd: 'MockFlow: Publish Endpoint', desc: 'Expose a draft endpoint on the mock runtime' },
  { cmd: 'MockFlow: Unpublish Endpoint', desc: 'Remove an endpoint from live runtime serving' },
  { cmd: 'MockFlow: Copy Hosted URL', desc: 'Copy the /p/{slug}{path} runtime URL' },
  { cmd: 'MockFlow: Test Published Endpoint', desc: 'Execute a live check against the runtime server' },
];

export default function ExtensionPage() {
  return (
    <div className="landing-page">
      <LandingNav />

      <main>
        {/* Hero + Download */}
        <section className="subpage-hero">
          <div className="section-inner extension-hero-grid">
            <div>
              <p className="hero-eyebrow">
                <span className="hero-eyebrow-dot" aria-hidden="true" />
                VS Code Extension · v0.1.0
              </p>
              <h1>MockFlow for Visual Studio Code</h1>
              <p className="subpage-lead">
                Discover routes in your codebase, configure mock scenarios and request JSON Schemas,
                publish endpoints, and test live runtime URLs without leaving VS Code.
              </p>

              <div className="extension-download-box panel">
                <div className="extension-download-meta">
                  <div>
                    <strong>{VSIX_FILENAME}</strong>
                    <span className="row-subtext">
                      Version 0.1.0 · VS Code ^1.85.0 · Direct VSIX package (no sign-in required)
                    </span>
                  </div>
                  <span className="status-pill status-pill-published">Ready to install</span>
                </div>
                <div className="hero-ctas" style={{ marginTop: '14px' }}>
                  <a
                    href={VSIX_PATH}
                    download={VSIX_FILENAME}
                    className="button button-primary button-lg"
                  >
                    Download .vsix (v0.1.0)
                  </a>
                  <Link href="/" className="button button-secondary button-lg">
                    Back to MockFlow home
                  </Link>
                </div>
                <p className="extension-honest-note">
                  Note: MockFlow is distributed directly as a <code>.vsix</code> package here and is
                  not currently listed on the VS Code Marketplace.
                </p>
              </div>
            </div>

            {/* VS Code dark preview */}
            <div>
              <div className="extension-card-header">
                <span className="extension-card-dot extension-card-dot-red" />
                <span className="extension-card-dot extension-card-dot-yellow" />
                <span className="extension-card-dot extension-card-dot-green" />
                <span className="extension-card-title">MockFlow — Command Palette</span>
              </div>
              <div className="extension-commands">
                {extensionCommands.slice(4, 12).map((item) => (
                  <div className="extension-cmd" key={item.cmd}>
                    <span className="extension-cmd-icon" aria-hidden="true">
                      <TerminalIcon width={12} height={12} />
                    </span>
                    <code>{item.cmd}</code>
                    <span>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Installation instructions */}
        <section className="landing-section">
          <div className="section-inner">
            <div className="section-heading">
              <span className="section-label">Installation</span>
              <h2>Install the .vsix package in VS Code</h2>
              <p>
                Download <code>{VSIX_FILENAME}</code> above, then install it using either the VS Code
                CLI or the Extensions panel.
              </p>
            </div>

            <div className="install-methods-grid">
              <article className="panel capability-card">
                <span className="section-label">Option A · Terminal / PowerShell</span>
                <h3>Install with the VS Code CLI</h3>
                <p style={{ marginBottom: '12px' }}>
                  Run this command in PowerShell from your Downloads folder (or pass the full path to
                  the downloaded file):
                </p>
                <pre className="preview-code">
                  <code>{`code --install-extension .\\${VSIX_FILENAME}`}</code>
                </pre>
              </article>

              <article className="panel capability-card">
                <span className="section-label">Option B · VS Code UI</span>
                <h3>Install from VSIX in Extensions view</h3>
                <ol className="install-steps-list">
                  <li>Open Visual Studio Code (version 1.85.0 or newer).</li>
                  <li>
                    Open the <strong>Extensions</strong> sidebar (<code>Ctrl+Shift+X</code>).
                  </li>
                  <li>
                    Click the <strong>···</strong> (Views and More Actions) menu at the top-right of
                    the Extensions panel.
                  </li>
                  <li>
                    Choose <strong>Install from VSIX…</strong> and select{' '}
                    <code>{VSIX_FILENAME}</code>.
                  </li>
                </ol>
              </article>
            </div>
          </div>
        </section>

        {/* Capabilities & Integration */}
        <section className="landing-section landing-section-alt">
          <div className="section-inner">
            <div className="section-heading">
              <span className="section-label">Integration &amp; Commands</span>
              <h2>Built for the MockFlow control plane &amp; runtime</h2>
              <p>
                The extension adds a <strong>MockFlow</strong> Activity Bar container with{' '}
                <strong>Projects</strong> and <strong>API Discovery</strong> tree views.
              </p>
            </div>

            <div className="panel">
              <div className="panel-header panel-header-split">
                <h3>All Extension Commands</h3>
                <span className="panel-meta">{extensionCommands.length} commands</span>
              </div>
              <div className="data-list">
                {extensionCommands.map((item) => (
                  <div className="project-item" key={item.cmd}>
                    <div className="data-row data-row-split">
                      <code>{item.cmd}</code>
                      <span className="row-subtext">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Configuration & Troubleshooting */}
        <section className="landing-section">
          <div className="section-inner install-methods-grid">
            <article className="panel capability-card">
              <span className="section-label">Configuration</span>
              <h3>Extension Settings</h3>
              <p style={{ marginBottom: '12px' }}>
                By default, the extension connects to your local MockFlow servers. You can customize
                these URLs in VS Code Settings:
              </p>
              <pre className="preview-code">
                <code>{`{
  "mockflow.controlApiBaseUrl": "http://localhost:4000",
  "mockflow.runtimeBaseUrl": "http://localhost:4001"
}`}</code>
              </pre>
            </article>

            <article className="panel capability-card">
              <span className="section-label">Requirements &amp; Troubleshooting</span>
              <h3>Before you connect</h3>
              <ul className="extension-list" style={{ marginBottom: 0 }}>
                <li>
                  Ensure the MockFlow control-plane API (<code>:4000</code>) and runtime (
                  <code>:4001</code>) are running and reachable.
                </li>
                <li>
                  Run <code>MockFlow: Sign In</code> from the Command Palette and choose an active
                  project with <code>MockFlow: Select Project</code>.
                </li>
                <li>
                  If <code>code</code> is not recognized in PowerShell, open VS Code and run{' '}
                  <em>Shell Command: Install &apos;code&apos; command in PATH</em>, or use{' '}
                  <strong>Install from VSIX…</strong> in the UI.
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
