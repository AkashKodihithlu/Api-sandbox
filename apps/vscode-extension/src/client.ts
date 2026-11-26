import { apiErrorSchema, type ScenarioType } from '@mockflow/contracts';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export interface ApiDefinitionSummary {
  id: string;
  name: string;
  method: string;
  path: string;
  description?: string | null;
  requestSchema?: Record<string, unknown> | null;
  defaultScenarioId?: string | null;
  isPublished: boolean;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  type?: ScenarioType;
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  isDefault: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface SessionResponse {
  user: AuthenticatedUser;
  token: string;
}

export interface ApiDefinitionDraft {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
  requestSchema?: Record<string, unknown> | null;
}

export interface ApiDefinitionPatch {
  name?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  description?: string;
  requestSchema?: Record<string, unknown> | null;
  defaultScenarioId?: string | null;
  isPublished?: boolean;
}

export interface ScenarioDraft {
  name: string;
  type?: ScenarioType;
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  isDefault?: boolean;
}

export type ScenarioPatch = Partial<ScenarioDraft>;

interface ApiEnvelope<T> {
  data: T;
  pagination?: { page: number; pageSize: number; total: number };
}

export class ControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'ControlPlaneError';
  }
}

export class ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string | undefined>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createSession(email: string, password: string): Promise<SessionResponse> {
    return this.request<SessionResponse>('/v1/auth/session', {
      method: 'POST',
      body: { email, password },
      includeToken: false,
    });
  }

  async getCurrentUser(): Promise<AuthenticatedUser> {
    return this.request<AuthenticatedUser>('/v1/auth/me');
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>('/v1/projects?page=1&pageSize=100');
  }

  async listApis(projectId: string): Promise<ApiDefinitionSummary[]> {
    return this.request<ApiDefinitionSummary[]>(
      `/v1/projects/${encodeURIComponent(projectId)}/apis?page=1&pageSize=100`,
    );
  }

  async getApi(apiId: string): Promise<ApiDefinitionSummary> {
    return this.request<ApiDefinitionSummary>(`/v1/apis/${encodeURIComponent(apiId)}`);
  }

  async listEnvironments(projectId: string): Promise<EnvironmentSummary[]> {
    return this.request<EnvironmentSummary[]>(
      `/v1/projects/${encodeURIComponent(projectId)}/environments`,
    );
  }

  async listScenarios(apiId: string): Promise<ScenarioSummary[]> {
    return this.request<ScenarioSummary[]>(`/v1/apis/${encodeURIComponent(apiId)}/scenarios`);
  }

  async createApi(projectId: string, draft: ApiDefinitionDraft): Promise<ApiDefinitionSummary> {
    return this.request<ApiDefinitionSummary>(
      `/v1/projects/${encodeURIComponent(projectId)}/apis`,
      { method: 'POST', body: draft },
    );
  }

  async updateApi(apiId: string, patch: ApiDefinitionPatch): Promise<ApiDefinitionSummary> {
    return this.request<ApiDefinitionSummary>(`/v1/apis/${encodeURIComponent(apiId)}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  async deleteApi(apiId: string): Promise<void> {
    await this.request<void>(`/v1/apis/${encodeURIComponent(apiId)}`, { method: 'DELETE' });
  }

  async createScenario(apiId: string, draft: ScenarioDraft): Promise<ScenarioSummary> {
    return this.request<ScenarioSummary>(`/v1/apis/${encodeURIComponent(apiId)}/scenarios`, {
      method: 'POST',
      body: draft,
    });
  }

  async updateScenario(scenarioId: string, patch: ScenarioPatch): Promise<ScenarioSummary> {
    return this.request<ScenarioSummary>(`/v1/scenarios/${encodeURIComponent(scenarioId)}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  async deleteScenario(scenarioId: string): Promise<void> {
    await this.request<void>(`/v1/scenarios/${encodeURIComponent(scenarioId)}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; includeToken?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers({ accept: 'application/json' });
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (options.includeToken !== false) {
      const token = await this.getToken();
      if (!token) throw new ControlPlaneError('Sign in to MockFlow first.', 401, 'AUTH_REQUIRED');
      headers.set('authorization', `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.baseUrl), {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ControlPlaneError(
        'MockFlow is unavailable. Check the control-plane URL and try again.',
        0,
        'NETWORK_ERROR',
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      throw new ControlPlaneError(
        parsed.success
          ? parsed.data.error.message
          : `MockFlow request failed (${response.status}).`,
        response.status,
        parsed.success ? parsed.data.error.code : 'REQUEST_FAILED',
      );
    }

    const envelope = payload as ApiEnvelope<T>;
    return envelope.data;
  }
}
