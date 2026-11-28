'use client';

import { FormEvent, useState } from 'react';
import { ControlPlaneClient, Environment, Project } from '../../lib/control-plane';
import { canEditProject, Empty, FormPanel } from './shared';

export function EnvironmentsView({
  project,
  environments,
  loading,
  client,
  onRefresh,
  onNotify,
  onError,
}: {
  project: Project;
  environments: Environment[];
  loading: boolean;
  client: ControlPlaneClient;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
  onError: (cause: unknown) => void;
}) {
  const editable = canEditProject(project.role);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function saveRename(event: FormEvent, environmentId: string) {
    event.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusyId(environmentId);
    try {
      await client.updateEnvironment(environmentId, trimmed);
      setEditingId(null);
      await onRefresh();
      onNotify('Environment renamed.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {editable ? (
        <FormPanel
          title="New environment"
          onSubmit={async (form) => {
            try {
              const name = String(form.get('name') ?? '').trim();
              await client.createEnvironment(project.id, name);
              await onRefresh();
              onNotify('Environment created.');
              return true;
            } catch (cause) {
              onError(cause);
              return false;
            }
          }}
        >
          <label>
            Name
            <input name="name" required maxLength={120} placeholder="Staging" />
          </label>
          <button type="submit" className="button button-primary">
            Create environment
          </button>
        </FormPanel>
      ) : (
        <p className="notice" role="status">
          Read-only access ({project.role}): Editor or Owner permissions are required to manage
          environments.
        </p>
      )}

      <section className="panel">
        <div className="panel-header panel-header-split">
          <h2>Environments</h2>
          <span className="panel-meta">
            Use <code>x-mockflow-environment</code> header at runtime
          </span>
        </div>
        {loading ? (
          <Empty title="Loading environments" description="Fetching project environments…" />
        ) : environments.length ? (
          <div className="data-list">
            {environments.map((item) => {
              const isEditing = editingId === item.id;
              const isBusy = busyId === item.id;
              return (
                <div className="project-item" key={item.id}>
                  <div className="data-row data-row-split">
                    <div>
                      <strong>{item.name}</strong>
                      <span className="row-subtext">
                        Assign per-endpoint scenario overrides in the APIs tab.
                      </span>
                    </div>
                    {editable && (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={isBusy}
                        onClick={() => {
                          if (isEditing) {
                            setEditingId(null);
                          } else {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }
                        }}
                      >
                        {isEditing ? 'Cancel' : 'Rename'}
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <form className="inline-edit-form" onSubmit={(e) => saveRename(e, item.id)}>
                      <div className="form-fields">
                        <label>
                          Environment name
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                            maxLength={120}
                            disabled={isBusy}
                          />
                        </label>
                      </div>
                      <div className="inline-actions">
                        <button type="submit" className="button button-primary" disabled={isBusy}>
                          {isBusy ? 'Saving…' : 'Save name'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No environments"
            description="Create an environment to configure per-endpoint scenario overrides."
          />
        )}
      </section>
    </>
  );
}
