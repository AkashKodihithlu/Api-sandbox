import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlPlaneClient } from '../app/lib/control-plane';
import {
  canEditProject,
  isNoBodyStatusCode,
  isProjectOwner,
  parseHeadersJson,
  parseJsonInput,
} from '../app/components/dashboard/shared';

describe('ControlPlaneClient and dashboard helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('omits empty displayName on register when not provided', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { token: 'jwt-new', user: { email: 'new@example.test', displayName: null } },
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ControlPlaneClient();
    await client.register('new@example.test', 'verysecurepassword', '   ');

    expect(fetchMock).toHaveBeenCalledWith(
      '/control/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@example.test', password: 'verysecurepassword' }),
      }),
    );
  });

  it('sends PATCH/PUT/DELETE requests for projects, scenarios, and environments', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ControlPlaneClient('tok-1');
    await client.updateProject('p1', { name: 'Renamed' });
    await client.updateScenario('s1', { isDefault: true });
    await client.updateEnvironment('e1', 'QA');
    await client.setEnvironmentScenario('e1', 'a1', 's1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/control/v1/projects/p1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/control/v1/scenarios/s1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isDefault: true }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/control/v1/environments/e1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'QA' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/control/v1/environments/e1/apis/a1/scenario',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ scenarioId: 's1' }) }),
    );
  });

  it('sends empty string description on updateProject and updateApi when cleared', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ControlPlaneClient('tok-1');
    await client.updateProject('p1', { name: 'Proj', description: '' });
    await client.updateApi('a1', { name: 'Api', description: '' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/control/v1/projects/p1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Proj', description: '' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/control/v1/apis/a1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Api', description: '' }),
      }),
    );
  });

  it('handles 204 responses on deleteProject and deleteScenario', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ControlPlaneClient('tok-1');
    await expect(client.deleteProject('p1')).resolves.toBeUndefined();
    await expect(client.deleteScenario('s1')).resolves.toBeUndefined();
  });

  it('enforces role helpers accurately', () => {
    expect(isProjectOwner('OWNER')).toBe(true);
    expect(isProjectOwner('EDITOR')).toBe(false);
    expect(isProjectOwner('VIEWER')).toBe(false);

    expect(canEditProject('OWNER')).toBe(true);
    expect(canEditProject('EDITOR')).toBe(true);
    expect(canEditProject('VIEWER')).toBe(false);
  });

  it('validates JSON body, headers JSON, and no-body status codes', () => {
    expect(isNoBodyStatusCode(204)).toBe(true);
    expect(isNoBodyStatusCode(304)).toBe(true);
    expect(isNoBodyStatusCode(200)).toBe(false);

    expect(parseJsonInput('', 'JSON body')).toEqual({ ok: true, value: null });
    expect(parseJsonInput('{"ok":true}', 'JSON body')).toEqual({ ok: true, value: { ok: true } });
    expect(parseJsonInput('{bad', 'JSON body').ok).toBe(false);

    expect(parseHeadersJson('{"x-test":"1"}')).toEqual({ ok: true, value: { 'x-test': '1' } });
    expect(parseHeadersJson('{"x-test":123}').ok).toBe(false);
    expect(parseHeadersJson('[]').ok).toBe(false);
  });
});
