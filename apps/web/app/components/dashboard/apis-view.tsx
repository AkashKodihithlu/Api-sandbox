'use client';

import { FormEvent, useState } from 'react';
import {
  ApiDefinition,
  ControlPlaneClient,
  Environment,
  Project,
  Scenario,
} from '../../lib/control-plane';
import { RuntimeTester } from './runtime-tester';
import { ScenarioEditor } from './scenario-editor';
import { canEditProject, Empty, FormPanel, METHODS } from './shared';

export function ApisView({
  project,
  apis,
  environments,
  selectedApi,
  scenarios,
  loadingApis,
  loadingScenarios,
  client,
  selectApi,
  refreshProject,
  refreshScenarios,
  notify,
  onError,
}: {
  project: Project;
  apis: ApiDefinition[];
  environments: Environment[];
  selectedApi?: ApiDefinition;
  scenarios: Scenario[];
  loadingApis: boolean;
  loadingScenarios: boolean;
  client: ControlPlaneClient;
  selectApi: (id: string) => void;
  refreshProject: () => Promise<void>;
  refreshScenarios: () => Promise<void>;
  notify: (message: string) => void;
  onError: (cause: unknown) => void;
}) {
  const editable = canEditProject(project.role);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMethod, setEditMethod] = useState('GET');
  const [editPath, setEditPath] = useState('/');
  const [editDescription, setEditDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(api: ApiDefinition) {
    setConfirmDeleteId(null);
    setEditingId(api.id);
    setEditName(api.name);
    setEditMethod(api.method);
    setEditPath(api.path);
    setEditDescription(api.description ?? '');
  }

  async function saveEdit(event: FormEvent, apiId: string) {
    event.preventDefault();
    setBusyId(apiId);
    try {
      await client.updateApi(apiId, {
        name: editName.trim(),
        method: editMethod,
        path: editPath.trim(),
        description: editDescription.trim(),
      });
      setEditingId(null);
      await refreshProject();
      notify('Endpoint updated.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function togglePublish(api: ApiDefinition) {
    setBusyId(api.id);
    try {
      await client.updateApi(api.id, { isPublished: !api.isPublished });
      await refreshProject();
      notify(api.isPublished ? 'Endpoint unpublished.' : 'Endpoint published.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(apiId: string) {
    setBusyId(apiId);
    try {
      await client.deleteApi(apiId);
      setConfirmDeleteId(null);
      if (selectedApi?.id === apiId) {
        selectApi('');
      }
      await refreshProject();
      notify('Endpoint deleted.');
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
          title="New endpoint"
          id="create-api"
          onSubmit={async (form) => {
            try {
              const created = await client.createApi(project.id, {
                name: String(form.get('name') ?? '').trim(),
                method: String(form.get('method') ?? 'GET'),
                path: String(form.get('path') ?? '').trim(),
                description: String(form.get('description') ?? '').trim() || undefined,
              });
              await refreshProject();
              selectApi(created.id);
              notify('API draft created.');
              return true;
            } catch (cause) {
              onError(cause);
              return false;
            }
          }}
        >
          <label>
            Name
            <input name="name" required maxLength={120} placeholder="List users" />
          </label>
          <label>
            Method
            <select name="method" defaultValue="GET">
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label>
            Path
            <input name="path" required pattern="/.*" placeholder="/users" />
          </label>
          <label>
            Description <span className="field-optional">(optional)</span>
            <input name="description" maxLength={500} />
          </label>
          <button type="submit" className="button button-primary">
            Create draft
          </button>
        </FormPanel>
      ) : (
        <p className="notice" role="status">
          Read-only access ({project.role}): Editor or Owner permissions are required to create,
          edit, or publish endpoints.
        </p>
      )}

      <section className="panel">
        <div className="panel-header panel-header-split">
          <h2>Endpoints</h2>
          <span className="panel-meta">{apis.length} total</span>
        </div>
        {loadingApis ? (
          <Empty title="Loading endpoints" description="Fetching API definitions…" />
        ) : apis.length ? (
          <div className="api-list">
            {apis.map((api) => {
              const isSelected = api.id === selectedApi?.id;
              const isEditing = editingId === api.id;
              const isConfirming = confirmDeleteId === api.id;
              const isBusy = busyId === api.id;

              return (
                <div
                  className={`project-item ${isSelected ? 'api-row-active' : ''}`}
                  key={api.id}
                >
                  <div className="api-row">
                    <button
                      type="button"
                      className="api-select"
                      onClick={() => selectApi(api.id)}
                    >
                      <span className={`method method-${api.method.toLowerCase()}`}>
                        {api.method}
                      </span>
                      <code>{api.path}</code>
                      <span className="api-name-muted">{api.name}</span>
                      <span
                        className={`status-pill ${api.isPublished ? 'status-pill-published' : ''}`}
                      >
                        {api.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </button>

                    {editable && (
                      <div className="row-actions">
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void togglePublish(api)}
                        >
                          {api.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => (isEditing ? setEditingId(null) : startEdit(api))}
                        >
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          className="button button-secondary button-destructive"
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(isConfirming ? null : api.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <form className="inline-edit-form" onSubmit={(e) => saveEdit(e, api.id)}>
                      <div className="form-fields">
                        <label>
                          Name
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                            maxLength={120}
                            disabled={isBusy}
                          />
                        </label>
                        <label>
                          Method
                          <select
                            value={editMethod}
                            onChange={(e) => setEditMethod(e.target.value)}
                            disabled={isBusy}
                          >
                            {METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Path
                          <input
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            required
                            pattern="/.*"
                            disabled={isBusy}
                          />
                        </label>
                        <label>
                          Description
                          <input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            maxLength={500}
                            disabled={isBusy}
                          />
                        </label>
                      </div>
                      <div className="inline-actions">
                        <button type="submit" className="button button-primary" disabled={isBusy}>
                          {isBusy ? 'Saving…' : 'Save endpoint'}
                        </button>
                      </div>
                    </form>
                  )}

                  {isConfirming && (
                    <div className="confirm-bar" role="alert">
                      <span>
                        Delete <code>{api.method} {api.path}</code> and all of its scenarios?
                      </span>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={isBusy}
                          onClick={() => void handleDelete(api.id)}
                        >
                          {isBusy ? 'Deleting…' : 'Confirm delete'}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No endpoints"
            description="Create an API draft to define a mock endpoint."
          />
        )}
      </section>

      {selectedApi && (
        <>
          <ScenarioEditor
            key={selectedApi.id}
            api={selectedApi}
            scenarios={scenarios}
            environments={environments}
            loading={loadingScenarios}
            client={client}
            onSaved={async () => {
              await refreshScenarios();
              await refreshProject();
            }}
            onError={onError}
            onNotify={notify}
            project={project}
          />
          <RuntimeTester project={project} api={selectedApi} environments={environments} />
        </>
      )}
    </>
  );
}
