# MockFlow Runtime Architecture

## Overview

`apps/runtime` is the public data-plane Fastify service responsible for serving mock HTTP responses independently of the control-plane API (`apps/api`).

- **Public URL Convention**: `/p/{projectSlug}/{routePath}`
- **Health Endpoints**: `GET /health`, `GET /ready`
- **Database Access**: Direct PostgreSQL access via `@mockflow/db` (`DrizzleRuntimeStore` in `apps/runtime/src/store.ts`) — zero HTTP calls to `apps/api`.

## Request Lifecycle

1. **Ingress & Parser Safeguards**: Fastify enforces `bodyLimit` (`REQUEST_BODY_MAX_BYTES`, default 1 MiB) and `requestTimeout` (`MAX_ARTIFICIAL_DELAY_MS + 5000` ms).
2. **Project Resolution**: `findActiveProjectBySlug` queries `projects` where `slug = :projectSlug` and `status = 'ACTIVE'`. Unknown or `ARCHIVED` projects return `404 PROJECT_NOT_FOUND`.
3. **Published Route Loading**: `loadPublishedRoutesForProject` loads `api_definitions` with `isPublished = true` and batch-loads their `response_scenarios` in two queries (no N+1 queries). Unpublished drafts are never served.
4. **Environment Resolution**: If `x-mockflow-environment` or `x-mockflow-environment-id` is supplied, `resolveEnvironment` looks up the environment by UUID or name within the project and loads `environment_scenarios`.
5. **Mock Engine Execution**: `createMockEngine(...).executeWithDelay(...)` performs:
   - Route matching & specificity sorting (static segments take precedence over `:param` segments)
   - JSON Schema request body validation (if `requestSchema` is configured and no explicit scenario override is active)
   - Scenario selection (`explicit` -> `environment` -> `default`, or `VALIDATION_ERROR` scenario when validation fails)
   - Response validation (`statusCode`, hop-by-hop header blocking, `x-content-type-options: nosniff`, `RESPONSE_BODY_MAX_BYTES`, `MAX_ARTIFICIAL_DELAY_MS`) and bounded async delay
6. **Best-Effort Request Logging**: `recordRequestLog` inserts metadata into `request_logs` with sensitive headers (`authorization`, `cookie`, `x-api-key`, tokens, secrets) redacted to `'[REDACTED]'`. Logging failures are caught and logged server-side without breaking the mock response.

## Error Handling

- `400 INVALID_REQUEST_BODY`: Request body failed JSON parsing or `requestSchema` validation (without a `VALIDATION_ERROR` scenario).
- `404 PROJECT_NOT_FOUND` / `ROUTE_NOT_FOUND` / `SCENARIO_NOT_FOUND`: Unknown/archived project, unmatched method/path, or missing scenario.
- `413 PAYLOAD_TOO_LARGE` / `REQUEST_BODY_TOO_LARGE`: Request payload exceeds `REQUEST_BODY_MAX_BYTES`.
- `500 MOCK_CONFIGURATION_ERROR` / `INTERNAL_ERROR`: Invalid stored mock configuration or unexpected DB/internal error. Stack traces and SQL details are never exposed to clients.

## Configuration

Validated at startup by `parseRuntimeEnvironment` (`@mockflow/config`):
- `RUNTIME_PORT` (default `4001`)
- `DATABASE_URL` (required PostgreSQL URL)
- `REQUEST_BODY_MAX_BYTES` (default `1048576`)
- `RESPONSE_BODY_MAX_BYTES` (default `1048576`)
- `MAX_ARTIFICIAL_DELAY_MS` (default `10000`)

## Known Limitations

- Project-level rate limiting (`DEFAULT_PROJECT_RATE_LIMIT`), analytics aggregation, and log retention cleanup (`REQUEST_LOG_RETENTION_DAYS`) belong to Phase 8 and are not implemented in Phase 2.
- Query-parameter route matching is not part of `api_definitions` or `compileRoutes`; query parameters are parsed and passed into `requestContext` only.
- PostgreSQL integration tests in `apps/runtime/test/runtime.integration.test.ts` require `TEST_DATABASE_URL` and skip when no database is available.
