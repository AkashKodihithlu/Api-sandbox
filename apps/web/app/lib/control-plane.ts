export type Project = { id: string; name: string; slug: string; description: string | null; role: 'OWNER' | 'EDITOR' | 'VIEWER' };
export type ApiDefinition = { id: string; name: string; method: string; path: string; description: string | null; isPublished: boolean };
export type Scenario = { id: string; name: string; type: string; statusCode: number; headers: Record<string, string>; body: unknown; delayMs: number; isDefault: boolean };
export type Environment = { id: string; name: string };

type Envelope<T> = { data: T; pagination?: { page: number; pageSize: number; total: number } };

export class ControlPlaneError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class ControlPlaneClient {
  constructor(private readonly token?: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    if (options.body) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await fetch(`/control${path}`, { ...options, headers });
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => undefined) as Envelope<T> | { error?: { message?: string } } | undefined;
    if (!response.ok) {
      const errorPayload = payload && 'error' in payload ? payload.error : undefined;
      throw new ControlPlaneError(errorPayload?.message ?? `Request failed (${response.status})`, response.status);
    }
    return (payload as Envelope<T>).data;
  }

  signIn(email: string, password: string) { return this.request<{ token: string; user: { email: string; displayName?: string | null } }>('/v1/auth/session', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  register(email: string, password: string, displayName: string) { return this.request<{ token: string; user: { email: string; displayName?: string | null } }>('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }); }
  projects() { return this.request<Project[]>('/v1/projects?page=1&pageSize=100'); }
  createProject(input: { name: string; slug: string }) { return this.request<Project>('/v1/projects', { method: 'POST', body: JSON.stringify(input) }); }
  apis(projectId: string) { return this.request<ApiDefinition[]>(`/v1/projects/${projectId}/apis?page=1&pageSize=100`); }
  createApi(projectId: string, input: { name: string; method: string; path: string; description?: string }) { return this.request<ApiDefinition>(`/v1/projects/${projectId}/apis`, { method: 'POST', body: JSON.stringify(input) }); }
  updateApi(apiId: string, input: Record<string, unknown>) { return this.request<ApiDefinition>(`/v1/apis/${apiId}`, { method: 'PATCH', body: JSON.stringify(input) }); }
  deleteApi(apiId: string) { return this.request<void>(`/v1/apis/${apiId}`, { method: 'DELETE' }); }
  scenarios(apiId: string) { return this.request<Scenario[]>(`/v1/apis/${apiId}/scenarios`); }
  createScenario(apiId: string, input: Record<string, unknown>) { return this.request<Scenario>(`/v1/apis/${apiId}/scenarios`, { method: 'POST', body: JSON.stringify(input) }); }
  environments(projectId: string) { return this.request<Environment[]>(`/v1/projects/${projectId}/environments`); }
  createEnvironment(projectId: string, name: string) { return this.request<Environment>(`/v1/projects/${projectId}/environments`, { method: 'POST', body: JSON.stringify({ name }) }); }
}
