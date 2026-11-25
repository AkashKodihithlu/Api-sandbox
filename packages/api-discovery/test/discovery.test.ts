import { describe, expect, it } from 'vitest';
import { discoverInSource, groupDiscoveries, normalizeApiPath } from '../src/index.js';

describe('API discovery', () => {
  it('extracts documented fetch and Axios patterns with locations', () => {
    const discoveries = discoverInSource(
      "\nfetch('/api/users');\nfetch('/api/users', { method: 'POST', body: JSON.stringify(payload) });\naxios.get('https://api.example.test/users?limit=10');\naxios.post('/orders', order);\naxios({ method: 'PATCH', url: '/orders/1', data: payload });",
      'src/client.ts',
    );
    expect(discoveries).toMatchObject([
      {
        method: 'GET',
        path: '/api/users',
        client: 'fetch',
        certainty: 'static',
        source: { file: 'src/client.ts', line: 2 },
      },
      { method: 'POST', path: '/api/users', bodyHint: 'JSON body' },
      { method: 'GET', path: '/users', client: 'axios' },
      { method: 'POST', path: '/orders', bodyHint: 'order' },
      { method: 'PATCH', path: '/orders/1', bodyHint: 'payload' },
    ]);
  });
  it('keeps dynamic URLs uncertain instead of guessing', () => {
    const [result] = discoverInSource('fetch(`/api/users/${userId}`);', 'src/dynamic.ts');
    expect(result).toMatchObject({ certainty: 'uncertain', path: undefined });
    expect(result.warnings[0]).toContain('dynamic');
  });
  it('groups duplicate calls while retaining references', () => {
    const groups = groupDiscoveries([
      ...discoverInSource("fetch('/api/users');", 'src/a.ts'),
      ...discoverInSource("axios.get('/api/users');", 'src/b.ts'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].discoveries.map((item) => item.source.file)).toEqual(['src/a.ts', 'src/b.ts']);
  });
  it('normalizes absolute and relative paths', () => {
    expect(normalizeApiPath('https://api.example.test/v1/users/?page=2')).toBe('/v1/users');
    expect(normalizeApiPath('/v1//users/')).toBe('/v1/users');
    expect(normalizeApiPath('api/users')).toBeUndefined();
  });
});
