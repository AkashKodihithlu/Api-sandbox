export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status?: 'ACTIVE' | 'ARCHIVED';
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
};

export type ApiDefinition = {
  id: string;
  name: string;
  method: string;
  path: string;
  description: string | null;
  isPublished: boolean;
  defaultScenarioId?: string | null;
  requestSchema?: Record<string, unknown> | null;
};

export const SCENARIO_TYPES = [
  'SUCCESS',
  'EMPTY',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'SERVER_ERROR',
  'CUSTOM',
] as const;

export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export type Scenario = {
  id: string;
  name: string;
  type: ScenarioType | string;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  delayMs: number;
  isDefault: boolean;
};

export type Environment = { id: string; name: string };

export type RequestLog = {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  redactedHeaders: Record<string, string>;
  createdAt: string;
};

export type RequestHistory = {
  data: RequestLog[];
  pagination: { page: number; pageSize: number; total: number };
};

type Envelope<T> = { data: T; pagination?: { page: number; pageSize: number; total: number } };

export class ControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class ControlPlaneClient {
  constructor(private readonly token?: string) {}

  private async requestEnvelope<T>(path: string, options: RequestInit = {}): Promise<Envelope<T>> {
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    if (options.body) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await fetch(`/control${path}`, { ...options, headers });
    if (response.status === 204) return { data: undefined as T };
    const payload = (await response.json().catch(() => undefined)) as
      | Envelope<T>
      | { error?: { code?: string; message?: string } }
      | undefined;
    if (!response.ok) {
      const errorPayload = payload && 'error' in payload ? payload.error : undefined;
      throw new ControlPlaneError(
        errorPayload?.message ?? `Request failed (${response.status})`,
        response.status,
        errorPayload?.code,
      );
    }
    return payload as Envelope<T>;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    return (await this.requestEnvelope<T>(path, options)).data;
  }

  signIn(email: string, password: string) {
    return this.request<{ token: string; user: { email: string; displayName?: string | null } }>(
      '/v1/auth/session',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
  }

  register(email: string, password: string, displayName?: string) {
    const payload: { email: string; password: string; displayName?: string } = { email, password };
    const trimmedName = displayName?.trim();
    if (trimmedName) {
      payload.displayName = trimmedName;
    }
    return this.request<{ token: string; user: { email: string; displayName?: string | null } }>(
      '/v1/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  me() {
    return this.request<{ id: string; email: string }>('/v1/auth/me');
  }

  projects() {
    return this.request<Project[]>('/v1/projects?page=1&pageSize=100');
  }

  createProject(input: { name: string; slug: string; description?: string }) {
    return this.request<Project>('/v1/projects', { method: 'POST', body: JSON.stringify(input) });
  }

  updateProject(
    projectId: string,
    input: { name?: string; slug?: string; description?: string; status?: 'ACTIVE' | 'ARCHIVED' },
  ) {
    return this.request<Project>(`/v1/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  deleteProject(projectId: string) {
    return this.request<void>(`/v1/projects/${projectId}`, { method: 'DELETE' });
  }

  apis(projectId: string) {
    return this.request<ApiDefinition[]>(`/v1/projects/${projectId}/apis?page=1&pageSize=100`);
  }

  createApi(
    projectId: string,
    input: { name: string; method: string; path: string; description?: string },
  ) {
    return this.request<ApiDefinition>(`/v1/projects/${projectId}/apis`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateApi(apiId: string, input: Record<string, unknown>) {
    return this.request<ApiDefinition>(`/v1/apis/${apiId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  deleteApi(apiId: string) {
    return this.request<void>(`/v1/apis/${apiId}`, { method: 'DELETE' });
  }

  scenarios(apiId: string) {
    return this.request<Scenario[]>(`/v1/apis/${apiId}/scenarios`);
  }

  createScenario(apiId: string, input: Record<string, unknown>) {
    return this.request<Scenario>(`/v1/apis/${apiId}/scenarios`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateScenario(scenarioId: string, input: Record<string, unknown>) {
    return this.request<Scenario>(`/v1/scenarios/${scenarioId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  deleteScenario(scenarioId: string) {
    return this.request<void>(`/v1/scenarios/${scenarioId}`, { method: 'DELETE' });
  }

  environments(projectId: string) {
    return this.request<Environment[]>(`/v1/projects/${projectId}/environments`);
  }

  createEnvironment(projectId: string, name: string) {
    return this.request<Environment>(`/v1/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  updateEnvironment(environmentId: string, name: string) {
    return this.request<Environment>(`/v1/environments/${environmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  setEnvironmentScenario(environmentId: string, apiId: string, scenarioId: string) {
    return this.request<{ environmentId: string; apiId: string; scenarioId: string }>(
      `/v1/environments/${environmentId}/apis/${apiId}/scenario`,
      {
        method: 'PUT',
        body: JSON.stringify({ scenarioId }),
      },
    );
  }

  requestHistory(
    projectId: string,
    filters: { page?: number; method?: string; statusCode?: string } = {},
  ) {
    const query = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '20' });
    if (filters.method) query.set('method', filters.method);
    if (filters.statusCode) query.set('statusCode', filters.statusCode);
    return this.requestEnvelope<RequestLog[]>(
      `/v1/projects/${projectId}/requests?${query.toString()}`,
    ).then(
      (response) =>
        ({
          data: response.data,
          pagination: response.pagination ?? { page: 1, pageSize: 20, total: response.data.length },
        }) satisfies RequestHistory,
    );
  }
}
