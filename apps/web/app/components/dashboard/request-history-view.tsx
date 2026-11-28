'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPlaneClient, Project, RequestHistory, RequestLog } from '../../lib/control-plane';
import { Empty, METHODS } from './shared';

export function RequestHistoryView({
  project,
  initialHistory,
  loadingInitial,
  client,
  onError,
}: {
  project: Project;
  initialHistory: RequestHistory;
  loadingInitial: boolean;
  client: ControlPlaneClient;
  onError: (cause: unknown) => void;
}) {
  const [logs, setLogs] = useState<RequestLog[]>(initialHistory.data);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(initialHistory.pagination.page);
  const [pageSize, setPageSize] = useState(initialHistory.pagination.pageSize);
  const [total, setTotal] = useState(initialHistory.pagination.total);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(
    async (nextPage = 1, nextMethod = '', nextStatus = '') => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const result = await client.requestHistory(project.id, {
          page: nextPage,
          method: nextMethod,
          statusCode: nextStatus,
        });
        if (seq !== requestSeq.current) return;
        setLogs(result.data);
        setTotal(result.pagination.total);
        setPage(result.pagination.page);
        setPageSize(result.pagination.pageSize);
      } catch (cause) {
        if (seq !== requestSeq.current) return;
        onErrorRef.current(cause);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [client, project.id],
  );

  useEffect(() => {
    setMethod('');
    setStatus('');
    setExpandedId(null);
    void load(1, '', '');
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isBusy = loading || loadingInitial;

  return (
    <section className="panel">
      <div className="panel-header panel-header-split">
        <h2>Request history</h2>
        <button
          className="button button-secondary"
          type="button"
          disabled={isBusy}
          onClick={() => void load(page, method, status)}
        >
          {isBusy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="filter-row">
        <select
          aria-label="Filter by HTTP method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={isBusy}
        >
          <option value="">All methods</option>
          {METHODS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status code"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={isBusy}
        >
          <option value="">All status codes</option>
          <option value="200">200</option>
          <option value="201">201</option>
          <option value="204">204</option>
          <option value="400">400</option>
          <option value="401">401</option>
          <option value="403">403</option>
          <option value="404">404</option>
          <option value="422">422</option>
          <option value="500">500</option>
        </select>
        <button
          className="button button-secondary"
          type="button"
          disabled={isBusy}
          onClick={() => void load(1, method, status)}
        >
          Apply
        </button>
        {(method || status) && (
          <button
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMethod('');
              setStatus('');
              void load(1, '', '');
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isBusy ? (
        <Empty title="Loading request history" description="Fetching recorded runtime traffic…" />
      ) : logs.length ? (
        <div className="data-list">
          {logs.map((entry) => {
            const expanded = expandedId === entry.id;
            const headerEntries = Object.entries(entry.redactedHeaders ?? {});
            return (
              <div className="project-item" key={entry.id}>
                <div className="data-row data-row-split">
                  <div className="history-summary">
                    <span className={`method method-${entry.method.toLowerCase()}`}>
                      {entry.method}
                    </span>
                    <code>{entry.path}</code>
                    <span className="status-pill">{entry.statusCode}</span>
                    <span>{entry.durationMs} ms</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                  >
                    {expanded ? 'Hide details' : 'Details'}
                  </button>
                </div>

                {expanded && (
                  <div className="history-details">
                    <div className="history-metrics">
                      <span>Request bytes: {entry.requestBytes}</span>
                      <span>Response bytes: {entry.responseBytes}</span>
                      <span>Recorded: {new Date(entry.createdAt).toISOString()}</span>
                    </div>
                    <div>
                      <h4>Redacted request headers</h4>
                      {headerEntries.length ? (
                        <div className="headers-list">
                          {headerEntries.map(([k, v]) => (
                            <div key={k} className="header-kv">
                              <code>{k}</code>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="row-subtext">No headers recorded.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No request history"
          description="Published endpoint traffic will appear here with sensitive headers redacted."
        />
      )}

      <div className="pagination">
        <span>
          {total} {total === 1 ? 'request' : 'requests'} · Page {page} of {totalPages}
        </span>
        <div className="pagination-controls">
          <button
            className="button button-secondary"
            disabled={isBusy || page <= 1}
            type="button"
            onClick={() => void load(page - 1, method, status)}
          >
            Previous
          </button>
          <button
            className="button button-secondary"
            disabled={isBusy || page >= totalPages}
            type="button"
            onClick={() => void load(page + 1, method, status)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
