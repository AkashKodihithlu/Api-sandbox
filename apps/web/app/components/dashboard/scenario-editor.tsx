'use client';

import { FormEvent, useState } from 'react';
import {
  ApiDefinition,
  ControlPlaneClient,
  Environment,
  Project,
  SCENARIO_TYPES,
  Scenario,
} from '../../lib/control-plane';
import {
  canEditProject,
  Empty,
  FormPanel,
  isNoBodyStatusCode,
  parseHeadersJson,
  parseJsonInput,
} from './shared';

export function ScenarioEditor({
  api,
  scenarios,
  environments,
  loading,
  client,
  onSaved,
  onError,
  onNotify,
  project,
}: {
  api: ApiDefinition;
  scenarios: Scenario[];
  environments: Environment[];
  loading: boolean;
  client: ControlPlaneClient;
  onSaved: () => Promise<void>;
  onError: (cause: unknown) => void;
  onNotify: (message: string) => void;
  project: Project;
}) {
  const editable = canEditProject(project.role);

  const [localError, setLocalError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('SUCCESS');
  const [editStatusCode, setEditStatusCode] = useState(200);
  const [editDelayMs, setEditDelayMs] = useState(0);
  const [editHeaders, setEditHeaders] = useState('{}');
  const [editBody, setEditBody] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [overrideEnvId, setOverrideEnvId] = useState('');
  const [overrideScenarioId, setOverrideScenarioId] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);

  function startEdit(item: Scenario) {
    setLocalError(null);
    setConfirmDeleteId(null);
    setEditingId(item.id);
    setEditName(item.name);
    setEditType(item.type);
    setEditStatusCode(item.statusCode);
    setEditDelayMs(item.delayMs);
    setEditHeaders(JSON.stringify(item.headers ?? {}, null, 2));
    setEditBody(item.body !== null && item.body !== undefined ? JSON.stringify(item.body, null, 2) : '');
    setEditIsDefault(item.isDefault);
  }

  async function saveEdit(event: FormEvent, scenarioId: string) {
    event.preventDefault();
    setLocalError(null);

    const parsedHeaders = parseHeadersJson(editHeaders);
    if (!parsedHeaders.ok) {
      setLocalError(parsedHeaders.message);
      return;
    }

    const parsedBody = parseJsonInput(editBody, 'Response JSON body');
    if (!parsedBody.ok) {
      setLocalError(parsedBody.message);
      return;
    }

    if (isNoBodyStatusCode(editStatusCode) && parsedBody.value !== null) {
      setLocalError(`Status code ${editStatusCode} must not include a response body.`);
      return;
    }

    setBusyId(scenarioId);
    try {
      await client.updateScenario(scenarioId, {
        name: editName.trim(),
        type: editType,
        statusCode: Number(editStatusCode),
        delayMs: Number(editDelayMs),
        headers: parsedHeaders.value,
        body: parsedBody.value,
        isDefault: editIsDefault,
      });
      setEditingId(null);
      await onSaved();
      onNotify('Scenario updated.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function setAsDefault(scenarioId: string) {
    setBusyId(scenarioId);
    try {
      await client.updateScenario(scenarioId, { isDefault: true });
      await onSaved();
      onNotify('Default scenario updated.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(scenarioId: string) {
    setBusyId(scenarioId);
    try {
      await client.deleteScenario(scenarioId);
      setConfirmDeleteId(null);
      await onSaved();
      onNotify('Scenario deleted.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignOverride(event: FormEvent) {
    event.preventDefault();
    if (!overrideEnvId || !overrideScenarioId) return;
    setOverrideBusy(true);
    try {
      await client.setEnvironmentScenario(overrideEnvId, api.id, overrideScenarioId);
      onNotify('Environment scenario override saved.');
    } catch (cause) {
      onError(cause);
    } finally {
      setOverrideBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header panel-header-split">
          <h2>
            Scenarios for <code>{api.method} {api.path}</code>
          </h2>
          <span className="panel-meta">{scenarios.length} configured</span>
        </div>

        {localError && (
          <div style={{ padding: '14px 18px 0' }}>
            <p className="error" role="alert">
              {localError}
            </p>
          </div>
        )}

        {loading ? (
          <Empty title="Loading scenarios" description="Fetching response scenarios…" />
        ) : scenarios.length ? (
          <div className="data-list">
            {scenarios.map((item) => {
              const isEditing = editingId === item.id;
              const isConfirming = confirmDeleteId === item.id;
              const isBusy = busyId === item.id;

              return (
                <div className="project-item" key={item.id}>
                  <div className="data-row data-row-split">
                    <div className="scenario-summary">
                      <strong>{item.name}</strong>
                      <span className="status-pill">{item.statusCode}</span>
                      <span className="role-badge">{item.type}</span>
                      <span>{item.delayMs} ms delay</span>
                      {item.isDefault && (
                        <span className="status-pill status-pill-published">Default</span>
                      )}
                    </div>

                    {editable && (
                      <div className="row-actions">
                        {!item.isDefault && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={isBusy}
                            onClick={() => void setAsDefault(item.id)}
                          >
                            Set default
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={isBusy}
                          onClick={() => (isEditing ? setEditingId(null) : startEdit(item))}
                        >
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-destructive"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(isConfirming ? null : item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <form className="inline-edit-form" onSubmit={(e) => saveEdit(e, item.id)}>
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
                          Type
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value)}
                            disabled={isBusy}
                          >
                            {SCENARIO_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Status code
                          <input
                            type="number"
                            min={100}
                            max={599}
                            value={editStatusCode}
                            onChange={(e) => setEditStatusCode(Number(e.target.value))}
                            required
                            disabled={isBusy}
                          />
                        </label>
                        <label>
                          Artificial delay (ms)
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={editDelayMs}
                            onChange={(e) => setEditDelayMs(Number(e.target.value))}
                            required
                            disabled={isBusy}
                          />
                        </label>
                        <label className="field-wide">
                          Response headers (JSON)
                          <textarea
                            rows={3}
                            value={editHeaders}
                            onChange={(e) => setEditHeaders(e.target.value)}
                            disabled={isBusy}
                          />
                        </label>
                        <label className="field-wide">
                          Response JSON body
                          <textarea
                            rows={5}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            disabled={isBusy}
                          />
                        </label>
                        <label className="checkbox-label field-wide">
                          <input
                            type="checkbox"
                            checked={editIsDefault}
                            onChange={(e) => setEditIsDefault(e.target.checked)}
                            disabled={isBusy}
                          />
                          <span>Set as default scenario for this endpoint</span>
                        </label>
                      </div>
                      <div className="inline-actions">
                        <button type="submit" className="button button-primary" disabled={isBusy}>
                          {isBusy ? 'Saving…' : 'Save scenario'}
                        </button>
                      </div>
                    </form>
                  )}

                  {isConfirming && (
                    <div className="confirm-bar" role="alert">
                      <span>
                        Delete scenario <strong>{item.name}</strong>?
                      </span>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={isBusy}
                          onClick={() => void handleDelete(item.id)}
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
            title="No response scenarios"
            description="Add at least one scenario before publishing this endpoint."
          />
        )}
      </section>

      {editable && environments.length > 0 && scenarios.length > 0 && (
        <section className="panel form-panel">
          <div className="panel-header panel-header-split">
            <h2>Environment override</h2>
            <span className="panel-meta">Bind a scenario to an environment for this endpoint</span>
          </div>
          <form className="form-grid" onSubmit={handleAssignOverride}>
            <div className="form-fields">
              <label>
                Environment
                <select
                  value={overrideEnvId}
                  onChange={(e) => setOverrideEnvId(e.target.value)}
                  required
                  disabled={overrideBusy}
                >
                  <option value="">Select environment</option>
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scenario
                <select
                  value={overrideScenarioId}
                  onChange={(e) => setOverrideScenarioId(e.target.value)}
                  required
                  disabled={overrideBusy}
                >
                  <option value="">Select scenario</option>
                  {scenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name} ({sc.statusCode})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="button button-secondary"
                disabled={overrideBusy || !overrideEnvId || !overrideScenarioId}
              >
                {overrideBusy ? 'Saving override…' : 'Assign environment override'}
              </button>
            </div>
          </form>
        </section>
      )}

      {editable && (
        <FormPanel
          title="Add scenario"
          onSubmit={async (form) => {
            setLocalError(null);
            const name = String(form.get('name') ?? '').trim();
            const type = String(form.get('type') ?? 'SUCCESS');
            const statusCode = Number(form.get('statusCode') ?? 200);
            const delayMs = Number(form.get('delayMs') ?? 0);
            const headersRaw = String(form.get('headers') ?? '');
            const bodyRaw = String(form.get('body') ?? '');
            const isDefault = form.get('isDefault') === 'on' || scenarios.length === 0;

            const parsedHeaders = parseHeadersJson(headersRaw);
            if (!parsedHeaders.ok) {
              setLocalError(parsedHeaders.message);
              return false;
            }

            const parsedBody = parseJsonInput(bodyRaw, 'JSON body');
            if (!parsedBody.ok) {
              setLocalError(parsedBody.message);
              return false;
            }

            if (isNoBodyStatusCode(statusCode) && parsedBody.value !== null) {
              setLocalError(`Status code ${statusCode} must not include a response body.`);
              return false;
            }

            try {
              await client.createScenario(api.id, {
                name,
                type,
                statusCode,
                headers: parsedHeaders.value,
                body: parsedBody.value,
                delayMs,
                isDefault,
              });
              await onSaved();
              onNotify('Scenario created.');
              return true;
            } catch (cause) {
              onError(cause);
              return false;
            }
          }}
        >
          <label>
            Name
            <input name="name" required maxLength={120} defaultValue="Default response" />
          </label>
          <label>
            Type
            <select name="type" defaultValue="SUCCESS">
              {SCENARIO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status code
            <input name="statusCode" type="number" defaultValue="200" min={100} max={599} required />
          </label>
          <label>
            Artificial delay (ms)
            <input name="delayMs" type="number" defaultValue="0" min={0} max={10000} required />
          </label>
          <label className="field-wide">
            Response headers (JSON)
            <textarea
              name="headers"
              rows={2}
              defaultValue={'{"content-type": "application/json"}'}
            />
          </label>
          <label className="field-wide">
            Response JSON body
            <textarea name="body" rows={5} placeholder='{"ok": true}' />
          </label>
          <label className="checkbox-label field-wide">
            <input type="checkbox" name="isDefault" defaultChecked={scenarios.length === 0} />
            <span>Make default scenario</span>
          </label>
          <button type="submit" className="button button-primary">
            Save scenario
          </button>
        </FormPanel>
      )}
    </>
  );
}
