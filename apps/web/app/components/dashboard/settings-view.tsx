'use client';

import { Project } from '../../lib/control-plane';

export function SettingsView({
  email,
  project,
  onSignOut,
}: {
  email: string;
  project?: Project;
  onSignOut: () => void;
}) {
  return (
    <section className="settings-list">
      <div className="setting-row">
        <div>
          <h2>Session</h2>
          <p>
            Signed in as <strong>{email || 'unknown'}</strong>. Your Bearer token is stored only in
            this browser.
          </p>
        </div>
        <button className="button button-secondary" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h2>Project access</h2>
          <p>
            {project
              ? `Active project "${project.name}" — your role is ${project.role}. Access is enforced by the control plane.`
              : 'Select a project from the top bar to inspect your role.'}
          </p>
        </div>
        {project && <span className="role-badge">{project.role}</span>}
      </div>
    </section>
  );
}
