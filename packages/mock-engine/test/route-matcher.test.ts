import { describe, expect, it } from 'vitest';
import {
  compileRoutes,
  HTTP_METHODS,
  matchRoute,
  type HttpMethod,
  type RouteDefinition,
} from '../src/index.js';

describe('Route Matcher', () => {
  describe('Exact static route matching', () => {
    it('matches a single-segment static route', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/users');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual({ method: 'GET', path: '/users' });
      expect(result?.params).toEqual({});
    });

    it('matches a multi-segment static route', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/api/v1/users/active' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/api/v1/users/active');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual({ method: 'GET', path: '/api/v1/users/active' });
      expect(result?.params).toEqual({});
    });

    it('preserves custom properties on the route definition', () => {
      interface CustomRoute extends RouteDefinition {
        id: string;
        handlerName: string;
        metadata: { authRequired: boolean };
      }

      const routes: CustomRoute[] = [
        {
          id: 'route-users-list',
          method: 'GET',
          path: '/users',
          handlerName: 'listUsers',
          metadata: { authRequired: true },
        },
      ];

      const matcher = compileRoutes(routes);
      const result = matcher('GET', '/users');

      expect(result?.route.id).toBe('route-users-list');
      expect(result?.route.handlerName).toBe('listUsers');
      expect(result?.route.metadata).toEqual({ authRequired: true });
    });

    it('works with the matchRoute convenience function', () => {
      const routes: RouteDefinition[] = [{ method: 'POST', path: '/checkout' }];

      const result = matchRoute('POST', '/checkout', routes);
      expect(result).not.toBeNull();
      expect(result?.route.path).toBe('/checkout');
      expect(result?.params).toEqual({});
    });
  });

  describe('Parameterized routes', () => {
    it('extracts a single URL parameter', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:id' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/users/42');
      expect(result).not.toBeNull();
      expect(result?.route).toBe(routes[0]);
      expect(result?.params).toEqual({ id: '42' });
    });

    it('supports parameter as the first path segment', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/:version/users' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/v2/users');
      expect(result?.params).toEqual({ version: 'v2' });
    });

    it('supports parameter names with digits not at the start and leading underscores', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/items/:_item_id_99' },
        { method: 'GET', path: '/v2/:user123' },
      ];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/items/val-123')?.params).toEqual({ _item_id_99: 'val-123' });
      expect(matcher('GET', '/v2/john')?.params).toEqual({ user123: 'john' });
    });
  });

  describe('Multiple path parameters', () => {
    it('extracts multiple parameters across different segments', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/orgs/:orgId/repos/:repoId/issues/:issueId' },
      ];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/orgs/google/repos/mockflow/issues/101');
      expect(result).not.toBeNull();
      expect(result?.params).toEqual({
        orgId: 'google',
        repoId: 'mockflow',
        issueId: '101',
      });
    });

    it('extracts consecutive parameter segments', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/:category/:subcategory/:item' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/electronics/phones/pixel');
      expect(result?.params).toEqual({
        category: 'electronics',
        subcategory: 'phones',
        item: 'pixel',
      });
    });
  });

  describe('Route matching precedence and specificity', () => {
    it('prefers static segments over parameter segments regardless of insertion order', () => {
      const parameterizedFirst: RouteDefinition[] = [
        { method: 'GET', path: '/users/:id' },
        { method: 'GET', path: '/users/me' },
      ];
      const matcher1 = compileRoutes(parameterizedFirst);

      const meResult1 = matcher1('GET', '/users/me');
      expect(meResult1?.route.path).toBe('/users/me');
      expect(meResult1?.params).toEqual({});

      const otherResult1 = matcher1('GET', '/users/john');
      expect(otherResult1?.route.path).toBe('/users/:id');
      expect(otherResult1?.params).toEqual({ id: 'john' });

      const staticFirst: RouteDefinition[] = [
        { method: 'GET', path: '/users/me' },
        { method: 'GET', path: '/users/:id' },
      ];
      const matcher2 = compileRoutes(staticFirst);

      const meResult2 = matcher2('GET', '/users/me');
      expect(meResult2?.route.path).toBe('/users/me');
      expect(meResult2?.params).toEqual({});
    });

    it('orders multi-segment routes by specificity from most specific to least specific', () => {
      const routes: RouteDefinition[] = [
        { id: 'all-param', method: 'GET', path: '/users/:id/:tab' },
        { id: 'param-static', method: 'GET', path: '/users/:id/profile' },
        { id: 'static-param', method: 'GET', path: '/users/me/:tab' },
        { id: 'all-static', method: 'GET', path: '/users/me/profile' },
      ];
      const matcher = compileRoutes(routes);

      // 1. Matches all-static [1, 1, 1]
      expect(matcher('GET', '/users/me/profile')?.route.id).toBe('all-static');

      // 2. Matches static-param [1, 1, 0]
      const settingsMatch = matcher('GET', '/users/me/settings');
      expect(settingsMatch?.route.id).toBe('static-param');
      expect(settingsMatch?.params).toEqual({ tab: 'settings' });

      // 3. Matches param-static [1, 0, 1]
      const aliceProfileMatch = matcher('GET', '/users/alice/profile');
      expect(aliceProfileMatch?.route.id).toBe('param-static');
      expect(aliceProfileMatch?.params).toEqual({ id: 'alice' });

      // 4. Matches all-param [1, 0, 0]
      const aliceSettingsMatch = matcher('GET', '/users/alice/settings');
      expect(aliceSettingsMatch?.route.id).toBe('all-param');
      expect(aliceSettingsMatch?.params).toEqual({ id: 'alice', tab: 'settings' });
    });

    it('resolves earlier segment specificity before later segments', () => {
      // [1, 0, 1] vs [0, 1, 1] -> first segment static wins when both could match
      const routes: RouteDefinition[] = [
        { id: 'param-static-static', method: 'GET', path: '/:a/fixed/end' },
        { id: 'static-param-static', method: 'GET', path: '/fixed/:b/end' },
      ];
      const matcher = compileRoutes(routes);

      // Input '/fixed/fixed/end' could structurally match both, but static-param-static has specificity [1, 0, 1]
      // while param-static-static has [0, 1, 1]. At index 0, 1 > 0 so static-param-static wins.
      const result = matcher('GET', '/fixed/fixed/end');
      expect(result?.route.id).toBe('static-param-static');
      expect(result?.params).toEqual({ b: 'fixed' });
    });
  });

  describe('HTTP method isolation and handling', () => {
    it('isolates routes registered under different HTTP methods', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/items' },
        { method: 'POST', path: '/items' },
        { method: 'PUT', path: '/items/:id' },
        { method: 'DELETE', path: '/items/:id' },
      ];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/items')?.route.method).toBe('GET');
      expect(matcher('POST', '/items')?.route.method).toBe('POST');
      expect(matcher('PUT', '/items/123')?.route.method).toBe('PUT');
      expect(matcher('DELETE', '/items/123')?.route.method).toBe('DELETE');
      expect(matcher('PATCH', '/items')).toBeNull();
    });

    it('treats incoming request HTTP methods case-insensitively', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/test' },
        { method: 'POST', path: '/test' },
        { method: 'PATCH', path: '/test' },
      ];
      const matcher = compileRoutes(routes);

      expect(matcher('get', '/test')?.route.method).toBe('GET');
      expect(matcher('Get', '/test')?.route.method).toBe('GET');
      expect(matcher('post', '/test')?.route.method).toBe('POST');
      expect(matcher('patch', '/test')?.route.method).toBe('PATCH');
    });

    it('returns null for unsupported incoming HTTP methods', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/test' }];
      const matcher = compileRoutes(routes);

      expect(matcher('OPTIONS', '/test')).toBeNull();
      expect(matcher('HEAD', '/test')).toBeNull();
      expect(matcher('CONNECT', '/test')).toBeNull();
      expect(matcher('TRACE', '/test')).toBeNull();
      expect(matcher('INVALID', '/test')).toBeNull();
      expect(matcher('', '/test')).toBeNull();
    });

    it('exports all supported HTTP_METHODS', () => {
      expect(HTTP_METHODS).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    });
  });

  describe('Unmatched routes', () => {
    it('returns null when no route matches the path', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/posts')).toBeNull();
    });

    it('returns null when path segment count is shorter than route segment count', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:id/details' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/users/123')).toBeNull();
      expect(matcher('GET', '/users')).toBeNull();
    });

    it('returns null when path segment count is longer than route segment count', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:id' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/users/123/extra')).toBeNull();
    });

    it('returns null for any request when route table is empty', () => {
      const matcher = compileRoutes([]);
      expect(matcher('GET', '/')).toBeNull();
      expect(matcher('GET', '/users')).toBeNull();
    });
  });

  describe('Root paths', () => {
    it('supports matching a root path "/"', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/');
      expect(result).not.toBeNull();
      expect(result?.route.path).toBe('/');
      expect(result?.params).toEqual({});
    });

    it('normalizes multiple slashes to root path', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '///');
      expect(result).not.toBeNull();
      expect(result?.route.path).toBe('/');
    });

    it('does not match subpaths when only root is registered', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/users')).toBeNull();
    });

    it('does not match root path when only parameterized route is registered', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/:param' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/')).toBeNull();
    });
  });

  describe('Trailing slash and multiple slashes normalization', () => {
    it('normalizes trailing slash in route definitions', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/' }];
      const matcher = compileRoutes(routes);

      // Matches without trailing slash
      expect(matcher('GET', '/users')?.route.path).toBe('/users/');
      // Matches with trailing slash
      expect(matcher('GET', '/users/')?.route.path).toBe('/users/');
    });

    it('normalizes redundant and multiple slashes in route definitions', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '///users////:id///' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/users/99');
      expect(result).not.toBeNull();
      expect(result?.params).toEqual({ id: '99' });
    });

    it('normalizes multiple consecutive slashes in request paths', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/api/v1/users' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '//api///v1////users//')?.route.path).toBe('/api/v1/users');
    });
  });

  describe('Duplicate structural routes for the same method', () => {
    it('throws an error when identical static routes are registered for the same method', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/users' },
        { method: 'GET', path: '/users' },
      ];

      expect(() => compileRoutes(routes)).toThrowError(
        'Ambiguous route configuration for GET /users.',
      );
    });

    it('throws an error when routes normalize to the same path for the same method', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/users' },
        { method: 'GET', path: '/users/' },
      ];

      expect(() => compileRoutes(routes)).toThrowError(
        'Ambiguous route configuration for GET /users/.',
      );
    });

    it('throws an error when routes share identical structure with different parameter names', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/users/:id' },
        { method: 'GET', path: '/users/:userId' },
      ];

      expect(() => compileRoutes(routes)).toThrowError(
        'Ambiguous route configuration for GET /users/:userId.',
      );
    });

    it('throws an error when multi-parameter routes share identical structure', () => {
      const routes: RouteDefinition[] = [
        { method: 'POST', path: '/orgs/:org/repos/:repo' },
        { method: 'POST', path: '/orgs/:organizationId/repos/:repositoryId' },
      ];

      expect(() => compileRoutes(routes)).toThrowError(
        'Ambiguous route configuration for POST /orgs/:organizationId/repos/:repositoryId.',
      );
    });
  });

  describe('Duplicate routes with different methods', () => {
    it('allows identical paths and parameter structures across different HTTP methods', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/users' },
        { method: 'POST', path: '/users' },
        { method: 'GET', path: '/users/:id' },
        { method: 'PUT', path: '/users/:userId' },
        { method: 'DELETE', path: '/users/:targetId' },
      ];

      expect(() => compileRoutes(routes)).not.toThrow();

      const matcher = compileRoutes(routes);
      expect(matcher('GET', '/users')?.route.method).toBe('GET');
      expect(matcher('POST', '/users')?.route.method).toBe('POST');
      expect(matcher('GET', '/users/123')?.route.method).toBe('GET');
      expect(matcher('PUT', '/users/123')?.route.method).toBe('PUT');
      expect(matcher('DELETE', '/users/123')?.route.method).toBe('DELETE');
    });
  });

  describe('Invalid route configurations at compile time', () => {
    it('throws when method in route definition is not supported', () => {
      const routes = [{ method: 'OPTIONS' as unknown as HttpMethod, path: '/users' }];

      expect(() => compileRoutes(routes)).toThrowError('Unsupported HTTP method: OPTIONS');
    });

    it('throws when method in route definition is lowercase', () => {
      const routes = [{ method: 'get' as unknown as HttpMethod, path: '/users' }];

      expect(() => compileRoutes(routes)).toThrowError('Unsupported HTTP method: get');
    });

    it('throws when path does not start with "/"', () => {
      expect(() => compileRoutes([{ method: 'GET', path: 'users' }])).toThrowError(
        'Route path must start with "/": users',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '' }])).toThrowError(
        'Route path must start with "/": ',
      );
    });

    it('throws when route path contains query strings or hash fragments', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/users?page=1' }])).toThrowError(
        'Route definitions must not contain query strings or fragments: /users?page=1',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '/users#section' }])).toThrowError(
        'Route definitions must not contain query strings or fragments: /users#section',
      );
    });

    it('throws when parameter name is empty', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/:' }])).toThrowError(
        'Invalid route parameter ":" in route "/:".',
      );
    });

    it('throws when parameter name starts with a number', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/users/:123' }])).toThrowError(
        'Invalid route parameter ":123" in route "/users/:123".',
      );
    });

    it('throws when parameter name contains invalid characters like hyphens or dots', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/users/:user-id' }])).toThrowError(
        'Invalid route parameter ":user-id" in route "/users/:user-id".',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '/users/:user.id' }])).toThrowError(
        'Invalid route parameter ":user.id" in route "/users/:user.id".',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '/users/:user$id' }])).toThrowError(
        'Invalid route parameter ":user$id" in route "/users/:user$id".',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '/users/:id:extra' }])).toThrowError(
        'Invalid route parameter ":id:extra" in route "/users/:id:extra".',
      );
    });

    it('throws when duplicate parameter names are used in the same route', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/users/:id/items/:id' }])).toThrowError(
        'Duplicate parameter "id" in route "/users/:id/items/:id".',
      );
    });

    it('throws when a parameter does not occupy an entire segment', () => {
      expect(() => compileRoutes([{ method: 'GET', path: '/users-:id' }])).toThrowError(
        'Parameters must occupy an entire segment in route "/users-:id".',
      );

      expect(() => compileRoutes([{ method: 'GET', path: '/api:version/users' }])).toThrowError(
        'Parameters must occupy an entire segment in route "/api:version/users".',
      );
    });
  });

  describe('URL parameter decoding', () => {
    it('decodes percent-encoded spaces and symbols in parameter values', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/search/:query' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/search/hello%20world');
      expect(result?.params).toEqual({ query: 'hello world' });
    });

    it('decodes complex symbols in parameters like @ and +', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:email' }];
      const matcher = compileRoutes(routes);

      const result = matcher('GET', '/users/alice%2Btest%40example.com');
      expect(result?.params).toEqual({ email: 'alice+test@example.com' });
    });

    it('decodes UTF-8 multibyte characters in parameters', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/articles/:slug' }];
      const matcher = compileRoutes(routes);

      // %E4%BD%A0%E5%A5%BD = 你好
      const result = matcher('GET', '/articles/%E4%BD%A0%E5%A5%BD');
      expect(result?.params).toEqual({ slug: '你好' });
    });

    it('decodes emoji characters in parameters', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/reactions/:emoji' }];
      const matcher = compileRoutes(routes);

      // %F0%9F%9A%80 = 🚀
      const result = matcher('GET', '/reactions/%F0%9F%9A%80');
      expect(result?.params).toEqual({ emoji: '🚀' });
    });
  });

  describe('Malformed encoded URL parameters and path security validation', () => {
    it('throws on malformed percent-encoding in request path', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:id' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', '/users/%')).toThrowError('Malformed URL path encoding: %');

      expect(() => matcher('GET', '/users/%ZZ')).toThrowError('Malformed URL path encoding: %ZZ');

      expect(() => matcher('GET', '/users/%E0%A4%A')).toThrowError(
        'Malformed URL path encoding: %E0%A4%A',
      );
    });

    it('rejects encoded forward slash %2F in path segment', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/files/:path' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', '/files/nested%2Fsegment')).toThrowError(
        'Invalid URL path segment: nested%2Fsegment',
      );
    });

    it('rejects encoded backslash %5C in path segment', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/files/:path' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', '/files/nested%5Csegment')).toThrowError(
        'Invalid URL path segment: nested%5Csegment',
      );
    });

    it('rejects path traversal dot segments (. and ..)', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/files/:name' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', '/files/..')).toThrowError('Invalid URL path segment: ..');

      expect(() => matcher('GET', '/files/%2E%2E')).toThrowError(
        'Invalid URL path segment: %2E%2E',
      );

      expect(() => matcher('GET', '/files/.')).toThrowError('Invalid URL path segment: .');

      expect(() => matcher('GET', '/files/%2E')).toThrowError('Invalid URL path segment: %2E');
    });

    it('throws when incoming request path does not start with "/"', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', 'users')).toThrowError('Route path must start with "/": users');

      expect(() => matcher('GET', '')).toThrowError('Route path must start with "/": ');
    });

    it('throws when incoming request path contains query strings or fragments', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users' }];
      const matcher = compileRoutes(routes);

      expect(() => matcher('GET', '/users?page=1')).toThrowError(
        'Route definitions must not contain query strings or fragments: /users?page=1',
      );

      expect(() => matcher('GET', '/users#anchor')).toThrowError(
        'Route definitions must not contain query strings or fragments: /users#anchor',
      );
    });
  });

  describe('Case sensitivity', () => {
    it('treats static path segments as case-sensitive', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users' }];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/users')).not.toBeNull();
      expect(matcher('GET', '/Users')).toBeNull();
      expect(matcher('GET', '/USERS')).toBeNull();
    });

    it('preserves casing in parameter values', () => {
      const routes: RouteDefinition[] = [{ method: 'GET', path: '/users/:username' }];
      const matcher = compileRoutes(routes);

      const result1 = matcher('GET', '/users/JohnDoe');
      expect(result1?.params).toEqual({ username: 'JohnDoe' });

      const result2 = matcher('GET', '/users/johndoe');
      expect(result2?.params).toEqual({ username: 'johndoe' });
    });
  });

  describe('Matcher reusability and determinism', () => {
    it('allows the compiled matcher to be executed repeatedly without side effects', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/items/:id' },
        { method: 'POST', path: '/items' },
      ];
      const matcher = compileRoutes(routes);

      for (let i = 0; i < 5; i++) {
        expect(matcher('GET', `/items/${i}`)?.params).toEqual({ id: String(i) });
        expect(matcher('POST', '/items')?.route.method).toBe('POST');
        expect(matcher('GET', '/unknown')).toBeNull();
      }
    });

    it('orders static routes ahead of parameterized routes even across mixed segment lengths', () => {
      const routes: RouteDefinition[] = [
        { method: 'GET', path: '/users/:id' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/a/b/c' },
        { method: 'GET', path: '/users/me' },
      ];
      const matcher = compileRoutes(routes);

      expect(matcher('GET', '/users/me')?.route.path).toBe('/users/me');
      expect(matcher('GET', '/users/42')?.params).toEqual({ id: '42' });
    });
  });
});
