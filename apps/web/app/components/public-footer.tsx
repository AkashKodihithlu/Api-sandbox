import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <strong>MockFlow</strong>
          <p className="footer-note">
            Control plane (<code>apps/api</code>), runtime (<code>apps/runtime</code>), web UI (
            <code>apps/web</code>), and VS Code extension (<code>apps/vscode-extension</code>).
          </p>
        </div>
        <div className="footer-links">
          <Link href="/">Home</Link>
          <Link href="/capabilities">Capabilities</Link>
          <Link href="/workflow">Workflow</Link>
          <Link href="/extension">VS Code Extension</Link>
          <Link href="/signin">Sign in</Link>
          <Link href="/signup">Sign up</Link>
        </div>
      </div>
    </footer>
  );
}
