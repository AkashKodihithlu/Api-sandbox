import { normalizedRoutePath } from '@mockflow/contracts';

export interface RuntimeTestOptions {
  runtimeBaseUrl: string;
  projectSlug: string;
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  scenarioName?: string;
  environmentName?: string;
  fetcher?: typeof fetch;
}

export interface RuntimeTestResult {
  url: string;
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
  durationMs: number;
}

export class RuntimeTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeTestError';
  }
}

export function buildHostedEndpointUrl(
  runtimeBaseUrl: string,
  projectSlug: string,
  routePath: string,
): string {
  const base = runtimeBaseUrl.replace(/\/+$/, '');
  const normalizedPath = normalizedRoutePath(
    routePath.startsWith('/') ? routePath : `/${routePath}`,
  );
  return `${base}/p/${encodeURIComponent(projectSlug)}${normalizedPath}`;
}

export async function testPublishedEndpoint(
  options: RuntimeTestOptions,
): Promise<RuntimeTestResult> {
  const url = buildHostedEndpointUrl(options.runtimeBaseUrl, options.projectSlug, options.path);
  const fetcher = options.fetcher ?? fetch;
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');

  if (options.scenarioName?.trim()) {
    headers.set('x-mockflow-scenario-name', options.scenarioName.trim());
  }
  if (options.environmentName?.trim()) {
    headers.set('x-mockflow-environment', options.environmentName.trim());
  }

  let serializedBody: string | undefined;
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    serializedBody = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetcher(url, {
      method: options.method.toUpperCase(),
      headers,
      body: serializedBody,
    });
  } catch {
    throw new RuntimeTestError(
      'Could not reach the MockFlow runtime. Check mockflow.runtimeBaseUrl and try again.',
    );
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const bodyText = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    url,
    statusCode: response.status,
    headers: responseHeaders,
    bodyText,
    durationMs,
  };
}
