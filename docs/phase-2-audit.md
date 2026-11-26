# Phase 2 Audit Report — Mock Engine & Runtime Integration

## Audit Methodology

Inspected `packages/mock-engine/src/{index.ts,engine.ts,scenario-resolver.ts,response-executor.ts}` and `apps/runtime/src/{app.ts,server.ts,store.ts}` against Phase 2 requirements in `MockFlow_Implementation_Plan.md`, verified with existing unit tests (`177/177`) and runtime integration tests (`19/19`).

## Correctly Implemented Features

- **Route Matcher (`packages/mock-engine/src/index.ts`)**: `GET`/`POST`/`PUT`/`PATCH`/`DELETE` matching, path normalization (`normalizedRoutePath`), safe URL segment decoding (blocking malformed `%`, `/`, `\`, `.`, `..`), `:param` extraction, duplicate structural route detection.
- **Scenario Resolver (`packages/mock-engine/src/scenario-resolver.ts`)**: Deterministic precedence (`explicit` -> `environment` -> `default` -> optional `fallback`), scenario-to-API/project ownership verification.
- **Response Executor (`packages/mock-engine/src/response-executor.ts`)**: Status code range checks (`100`–`599`), no-body status enforcement (`204`, `205`, `304`, `1xx`), RFC 7230 header name validation, hop-by-hop header blocking, CRLF/NUL header value rejection, mandatory `x-content-type-options: nosniff`, JSON serialization, `maxBodyBytes`, and `maxDelayMs` bounds.
- **Runtime Integration (`apps/runtime`)**: Catch-all `/p/:projectSlug/*`, active project lookup, `isPublished = true` filtering, `MockEngine.executeWithDelay()`, bounded payloads/delays, safe error handling, and `request_logs` with header redaction.

## Confirmed Defects & Fixes

### 1. Non-Transitive Route Specificity Comparator (`packages/mock-engine/src/index.ts`)
- **Defect**: `compareSpecificity(a, b)` returned `0` when `a.specificity.length !== b.specificity.length`. Returning `0` between unequal-length routes violates strict weak ordering in `Array.prototype.sort` (e.g., `['/users/:id', '/health', '/users/me']` has `compare('/users/:id', '/health') === 0` and `compare('/health', '/users/me') === 0`, so TimSort is not guaranteed to sort `/users/me` before `/users/:id`).
- **Why it matters**: In real projects containing routes of varying segment lengths, a parameterized route like `/users/:id` could shadow a static route like `/users/me` depending on DB row order.
- **Fix**: Changed `compareSpecificity` to return `a.specificity.length - b.specificity.length` when lengths differ, establishing a strict weak ordering.
- **Regression Test**: Added a mixed-length specificity ordering test in `packages/mock-engine/test/route-matcher.test.ts`.

## Known Limitations & Remaining Risks

- **Query-parameter matching**: `api_definitions` and `compileRoutes` match on `method` + `path` only; query parameters are parsed and forwarded to `requestContext` rather than used for route selection.
- **Live PostgreSQL CI coverage**: `runtime.integration.test.ts` includes a `TEST_DATABASE_URL`-gated PostgreSQL suite that skips when no DB is running.

## Overall Assessment

Phase 2 is **implemented and verified** across `packages/mock-engine` and `apps/runtime` (with live PostgreSQL tests ready for `TEST_DATABASE_URL`).
