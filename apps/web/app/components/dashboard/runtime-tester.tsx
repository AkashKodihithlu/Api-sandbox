'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiDefinition, Environment, Project } from '../../lib/control-plane';
import { METHODS, parseHeadersJson, parseJsonInput } from './shared';

type RuntimeResult = {
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  headers: Array<[string, string]>;
  bodyText: string;
  isJson: boolean;
};

export function RuntimeTester({
  project,
  api,
  environments,
}: {
  project: Project;
  api: ApiDefinition;
  environments: Environment[];
}) {
  const [method, setMethod] = useState(api.method);
  const [path, setPath] = useState(api.path);
  const [environmentName, setEnvironmentName] = useState('');
  const [headersRaw, setHeadersRaw] = useState('{\n  "accept": "application/json"\n}');
  const [bodyRaw, setBodyRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [result, setResult] = useState<RuntimeResult | null>(null);

  useEffect(() => {
    setMethod(api.method);
    setPath(api.path);
    setValidationError(null);
    setNetworkError(null);
    setResult(null);
  }, [api.id, api.method, api.path]);

  const allowsBody = method !== 'GET' && method !== 'HEAD';

  async function handleRun(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);
    setNetworkError(null);

    const trimmedPath = path.trim();
    if (!trimmedPath.startsWith('/')) {
      setValidationError('Request path must start with "/".');
      return;
    }

    const parsedHeaders = parseHeadersJson(headersRaw);
    if (!parsedHeaders.ok) {
      setValidationError(parsedHeaders.message);
      return;
    }

    let requestBody: string | undefined;
    if (allowsBody && bodyRaw.trim().length > 0) {
      const parsedBody = parseJsonInput(bodyRaw, 'Request body');
      if (!parsedBody.ok) {
        setValidationError(parsedBody.message);
        return;
      }
      requestBody = JSON.stringify(parsedBody.value);
    }

    const headers = new Headers(parsedHeaders.value);
    if (environmentName) {
      headers.set('x-mockflow-environment', environmentName);
    }
    if (requestBody && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const targetUrl = `/runtime/p/${project.slug}${trimmedPath}`;
    setBusy(true);
    const started = performance.now();
    try {
      const response = await fetch(targetUrl, {
        method,
        headers,
        body: requestBody,
      });
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      const rawText = await response.text();
      let formattedBody = rawText;
      let isJson = false;
      if (rawText.trim().length > 0) {
        try {
          const json = JSON.parse(rawText) as unknown;
          formattedBody = JSON.stringify(json, null, 2);
          isJson = true;
        } catch {
          formattedBody = rawText;
        }
      }

      const responseHeaders: Array<[string, string]> = [];
      response.headers.forEach((value, key) => {
        responseHeaders.push([key, value]);
      });

      setResult({
        method,
        url: targetUrl,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        headers: responseHeaders,
        bodyText: formattedBody,
        isJson,
      });
    } catch {
      setNetworkError('Could not reach the mock runtime server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel form-panel">
      <div className="panel-header panel-header-split">
        <h2>Runtime endpoint tester</h2>
        <span className={`status-pill ${api.isPublished ? 'status-pill-published' : ''}`}>
          {api.isPublished ? 'Published' : 'Draft (publish to serve on runtime)'}
        </span>
      </div>

      <form className="form-grid" onSubmit={handleRun}>
        {validationError && (
          <p className="error" role="alert">
            {validationError}
          </p>
        )}
        {networkError && (
          <p className="error" role="alert">
            {networkError}
          </p>
        )}

        <div className="form-fields">
          <label>
            Method
            <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
              {METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Environment <span className="field-optional">(optional)</span>
            <select
              value={environmentName}
              onChange={(e) => setEnvironmentName(e.target.value)}
              disabled={busy}
            >
              <option value="">Default (no environment override)</option>
              {environments.map((env) => (
                <option key={env.id} value={env.name}>
                  {env.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-wide">
            Runtime path
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/users"
              required
              disabled={busy}
            />
            <small className="field-hint">
              Target URL: <code>/runtime/p/{project.slug}{path.trim() || '/'}</code>
            </small>
          </label>

          <label className="field-wide">
            Request headers (JSON)
            <textarea
              rows={3}
              value={headersRaw}
              onChange={(e) => setHeadersRaw(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="field-wide">
            Request body (JSON)
            <textarea
              rows={4}
              value={bodyRaw}
              onChange={(e) => setBodyRaw(e.target.value)}
              placeholder={
                allowsBody ? '{"name": "Ada"}' : 'Request body is not sent for GET requests'
              }
              disabled={busy || !allowsBody}
            />
          </label>

          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Sending request…' : 'Send test request'}
          </button>
        </div>
      </form>

      {result && (
        <div className="runtime-result" aria-live="polite">
          <div className="runtime-result-header">
            <div className="runtime-result-meta">
              <span
                className={`status-pill ${
                  result.status >= 200 && result.status < 300
                    ? 'status-pill-published'
                    : result.status >= 400
                      ? 'status-pill-error'
                      : ''
                }`}
              >
                {result.status} {result.statusText}
              </span>
              <code>
                {result.method} {result.url}
              </code>
            </div>
            <span className="panel-meta">{result.durationMs} ms</span>
          </div>

          <div className="runtime-result-grid">
            <div>
              <h3>Response body {result.isJson ? '(JSON)' : '(Text)'}</h3>
              <pre className="runtime-pre">
                <code>{result.bodyText || '(empty response body)'}</code>
              </pre>
            </div>
            <div>
              <h3>Response headers</h3>
              {result.headers.length ? (
                <div className="headers-list">
                  {result.headers.map(([k, v]) => (
                    <div key={k} className="header-kv">
                      <code>{k}</code>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="row-subtext">No response headers returned.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
