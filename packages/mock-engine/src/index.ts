import { normalizedRoutePath } from '@mockflow/contracts';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RouteDefinition {
  id?: string;
  method: HttpMethod;
  path: string;
}

export interface RouteMatch<T extends RouteDefinition = RouteDefinition> {
  route: T;
  params: Record<string, string>;
}

interface CompiledRoute<T extends RouteDefinition> {
  route: T;
  segments: string[];
  parameterNames: string[];
  specificity: number[];
  structuralKey: string;
}

function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.includes(method as HttpMethod);
}

function normalizeAndValidatePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`Route path must start with "/": ${path}`);
  }

  if (path.includes('?') || path.includes('#')) {
    throw new Error(`Route definitions must not contain query strings or fragments: ${path}`);
  }

  const normalized = normalizedRoutePath(path);

  if (normalized === '') {
    throw new Error('Route path cannot be empty.');
  }

  if (normalized !== '/') {
    const segments = normalized.split('/').slice(1);

    if (segments.some((segment: string) => segment.length === 0)) {
      throw new Error(`Route path contains an empty segment: ${path}`);
    }
  }

  return normalized;
}

function splitPath(path: string): string[] {
  if (path === '/') {
    return [];
  }

  return path.slice(1).split('/');
}

function compileRoute<T extends RouteDefinition>(route: T): CompiledRoute<T> {
  if (!isHttpMethod(route.method)) {
    throw new Error(`Unsupported HTTP method: ${route.method}`);
  }

  const path = normalizeAndValidatePath(route.path);
  const segments = splitPath(path);
  const parameterNames: string[] = [];
  const specificity: number[] = [];

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const parameterName = segment.slice(1);

      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameterName)) {
        throw new Error(`Invalid route parameter "${segment}" in route "${route.path}".`);
      }

      if (parameterNames.includes(parameterName)) {
        throw new Error(`Duplicate parameter "${parameterName}" in route "${route.path}".`);
      }

      parameterNames.push(parameterName);
      specificity.push(0);
    } else {
      if (segment.includes(':')) {
        throw new Error(`Parameters must occupy an entire segment in route "${route.path}".`);
      }

      specificity.push(1);
    }
  }

  const structuralKey = segments
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/');

  return {
    route,
    segments,
    parameterNames,
    specificity,
    structuralKey,
  };
}

function compareSpecificity(
  a: CompiledRoute<RouteDefinition>,
  b: CompiledRoute<RouteDefinition>,
): number {
  if (a.specificity.length !== b.specificity.length) {
    return 0;
  }

  for (let i = 0; i < a.specificity.length; i++) {
    const difference = b.specificity[i] - a.specificity[i];

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function decodeIncomingSegments(path: string): string[] {
  const normalized = normalizeAndValidatePath(path);
  const segments = splitPath(normalized);

  return segments.map((segment) => {
    let decoded: string;

    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(`Malformed URL path encoding: ${segment}`);
    }

    if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..') {
      throw new Error(`Invalid URL path segment: ${segment}`);
    }

    return decoded;
  });
}

function matchCompiledRoute<T extends RouteDefinition>(
  compiled: CompiledRoute<T>,
  incomingSegments: string[],
): RouteMatch<T> | null {
  if (compiled.segments.length !== incomingSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < compiled.segments.length; i++) {
    const routeSegment = compiled.segments[i];
    const incomingSegment = incomingSegments[i];

    if (routeSegment.startsWith(':')) {
      const parameterName = routeSegment.slice(1);
      params[parameterName] = incomingSegment;
      continue;
    }

    if (routeSegment !== incomingSegment) {
      return null;
    }
  }

  return {
    route: compiled.route,
    params,
  };
}

/**
 * Compiles and validates a route table once.
 *
 * The returned matcher can be reused for every incoming request.
 * Route configuration errors are detected during compilation.
 */
export function compileRoutes<T extends RouteDefinition>(
  routes: T[],
): (method: string, path: string) => RouteMatch<T> | null {
  const compiledRoutes = routes.map(compileRoute);

  const seenRoutes = new Set<string>();

  for (const compiled of compiledRoutes) {
    const routeKey = `${compiled.route.method}:${compiled.structuralKey}`;

    if (seenRoutes.has(routeKey)) {
      throw new Error(
        `Ambiguous route configuration for ${compiled.route.method} ${compiled.route.path}.`,
      );
    }

    seenRoutes.add(routeKey);
  }

  compiledRoutes.sort(compareSpecificity);

  return (incomingMethod: string, incomingPath: string) => {
    const method = incomingMethod.toUpperCase();

    if (!isHttpMethod(method)) {
      return null;
    }

    const incomingSegments = decodeIncomingSegments(incomingPath);

    for (const compiled of compiledRoutes) {
      if (compiled.route.method !== method) {
        continue;
      }

      const match = matchCompiledRoute(compiled, incomingSegments);

      if (match) {
        return match;
      }
    }

    return null;
  };
}

/**
 * Convenience function for one-off matching.
 *
 * For production request processing, prefer compileRoutes()
 * and reuse the compiled matcher.
 */
export function matchRoute<T extends RouteDefinition>(
  method: string,
  path: string,
  routes: T[],
): RouteMatch<T> | null {
  return compileRoutes(routes)(method, path);
}

export * from './scenario-resolver.js';
export * from './response-executor.js';
export * from './engine.js';
