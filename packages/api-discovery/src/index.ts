import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const discoveryPackageName = '@mockflow/api-discovery';
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const secretPattern = /(^|\/)\.env(?:\.|$)|(^|\/)(?:secrets?|credentials?)\b/i;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type DiscoveryClient = 'fetch' | 'axios';
export type DiscoveryCertainty = 'static' | 'uncertain';
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
export interface ApiDiscovery {
  id: string;
  method: HttpMethod;
  path?: string;
  rawUrl?: string;
  client: DiscoveryClient;
  certainty: DiscoveryCertainty;
  warnings: string[];
  bodyHint?: string;
  source: SourceLocation;
}
export interface DiscoveryGroup {
  id: string;
  method: HttpMethod;
  path?: string;
  certainty: DiscoveryCertainty;
  warnings: string[];
  discoveries: ApiDiscovery[];
}
export interface ScanOptions {
  excludedPaths?: string[];
  gitignorePatterns?: string[];
}

function slash(value: string): string {
  return value.split(sep).join('/').replace(/\\/g, '/');
}
function matchesPattern(file: string, pattern: string): boolean {
  const clean = pattern.trim().replace(/^\//, '').replace(/\/$/, '');
  if (!clean || clean.startsWith('#') || clean.startsWith('!')) return false;
  const expression = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`(^|/)${expression}($|/)`).test(slash(file));
}
function isIgnored(file: string, options: ScanOptions): boolean {
  const normalized = slash(file);
  return (
    secretPattern.test(normalized) ||
    normalized.split('/').some((part) => ignoredDirectories.has(part)) ||
    [...(options.excludedPaths ?? []), ...(options.gitignorePatterns ?? [])].some((pattern) =>
      matchesPattern(normalized, pattern),
    )
  );
}
async function gitignore(root: string): Promise<string[]> {
  try {
    return (await readFile(resolve(root, '.gitignore'), 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
async function sourceFiles(root: string, options: ScanOptions): Promise<string[]> {
  const results: string[] = [];
  const patterns = [...(options.gitignorePatterns ?? []), ...(await gitignore(root))];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const local = slash(relative(root, absolute));
      if (isIgnored(local, { ...options, gitignorePatterns: patterns })) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase()))
        results.push(absolute);
    }
  };
  await walk(root);
  return results;
}
function staticString(node: ts.Expression | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}
function property(
  object: ts.ObjectLiteralExpression | undefined,
  name: string,
): ts.Expression | undefined {
  return object?.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === name) ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === name)),
  )?.initializer;
}
function method(value: string | undefined, fallback: HttpMethod): HttpMethod {
  const result = value?.toUpperCase();
  return result && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(result)
    ? (result as HttpMethod)
    : fallback;
}
function bodyHint(value: ts.Expression | undefined): string | undefined {
  if (!value) return undefined;
  if (
    ts.isCallExpression(value) &&
    ts.isPropertyAccessExpression(value.expression) &&
    value.expression.name.text === 'stringify'
  )
    return 'JSON body';
  return ts.isIdentifier(value) ? value.text : 'dynamic body';
}
export function normalizeApiPath(url: string): string | undefined {
  let rawPath = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      rawPath = new URL(url).pathname || '/';
    } catch {
      return undefined;
    }
  } else if (!url.startsWith('/')) {
    return undefined;
  }

  const normalized = rawPath.replace(/\/{2,}/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') || '/' : normalized;
}
function discovered(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  client: DiscoveryClient,
  requestMethod: HttpMethod,
  url: string | undefined,
  hint?: string,
): ApiDiscovery {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const source = {
    file: sourceFile.fileName,
    line: location.line + 1,
    column: location.character + 1,
  };
  const path = url ? normalizeApiPath(url) : undefined;
  const warnings = !url
    ? ['URL is dynamic and could not be resolved statically.']
    : !path
      ? ['URL is not an absolute HTTP URL or an absolute path.']
      : [];
  return {
    id: `${requestMethod}:${path ?? 'dynamic'}:${source.file}:${source.line}:${source.column}`,
    method: requestMethod,
    path,
    rawUrl: url,
    client,
    certainty: path ? 'static' : 'uncertain',
    warnings,
    bodyHint: hint,
    source,
  };
}
function extract(sourceFile: ts.SourceFile, node: ts.CallExpression): ApiDiscovery | undefined {
  if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
    const options = node.arguments[1];
    const object = options && ts.isObjectLiteralExpression(options) ? options : undefined;
    return discovered(
      sourceFile,
      node,
      'fetch',
      method(staticString(property(object, 'method')), 'GET'),
      staticString(node.arguments[0]),
      bodyHint(property(object, 'body')),
    );
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'axios'
  ) {
    const requestMethod = node.expression.name.text.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(requestMethod))
      return undefined;
    return discovered(
      sourceFile,
      node,
      'axios',
      requestMethod as HttpMethod,
      staticString(node.arguments[0]),
      bodyHint(node.arguments[1]),
    );
  }
  if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'axios' &&
    ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    const config = node.arguments[0];
    return discovered(
      sourceFile,
      node,
      'axios',
      method(staticString(property(config, 'method')), 'GET'),
      staticString(property(config, 'url')),
      bodyHint(property(config, 'data')),
    );
  }
  return undefined;
}
export function discoverInSource(source: string, file: string): ApiDiscovery[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const results: ApiDiscovery[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const result = extract(parsed, node);
      if (result) results.push(result);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return results;
}
export function groupDiscoveries(discoveries: ApiDiscovery[]): DiscoveryGroup[] {
  const groups = new Map<string, DiscoveryGroup>();
  for (const item of discoveries) {
    const key = `${item.method}:${item.path ?? item.id}`;
    const group = groups.get(key);
    if (group) group.discoveries.push(item);
    else
      groups.set(key, {
        id: key,
        method: item.method,
        path: item.path,
        certainty: item.certainty,
        warnings: [...item.warnings],
        discoveries: [item],
      });
  }
  return [...groups.values()].sort((left, right) =>
    `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`),
  );
}
export async function scanWorkspace(
  workspaceRoot: string,
  options: ScanOptions = {},
): Promise<DiscoveryGroup[]> {
  const results: ApiDiscovery[] = [];
  for (const file of await sourceFiles(workspaceRoot, options))
    results.push(
      ...discoverInSource(await readFile(file, 'utf8'), slash(relative(workspaceRoot, file))),
    );
  return groupDiscoveries(results);
}
