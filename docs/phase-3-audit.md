# Phase 3 Audit Report — Scenarios & Request Validation

## Audit Methodology

Inspected `packages/contracts/src/{index.ts,safe-regex.ts}`, `packages/mock-engine/src/{request-validator.ts,scenario-resolver.ts,engine.ts}`, `apps/api/src/routes.ts`, and `apps/runtime/src/app.ts` against Phase 3 requirements in `MockFlow_Implementation_Plan.md`.

## Correctly Implemented Features

- **Scenario Types & Config Validation (`@mockflow/contracts`, `apps/api`)**: All 8 scenario types (`SUCCESS`, `EMPTY`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `SERVER_ERROR`, `CUSTOM`) are validated on both `POST /v1/apis/:apiId/scenarios` and `PATCH /v1/scenarios/:scenarioId` (via merged-state `validateScenarioConfiguration`), enforcing status codes, no-body status rules, header validity, hop-by-hop blocking, 1 MiB response body limit, and 10s delay limit.
- **JSON Schema Request Validation (`packages/contracts`, `packages/mock-engine`)**:
  - Save-time validation rejects unsupported JSON Schema keywords, remote `$ref`s, oversized schemas (> 64 KiB), excessive nesting (> depth 10), and unsafe regexes.
  - Runtime validation (`validateRequestBody`) handles required/optional fields, `null`/`nullable`, nested objects, arrays (`items`, `prefixItems`, `uniqueItems`), `additionalProperties`, `allOf`/`anyOf`/`oneOf`/`not`/`const`/`enum`, bounded work budget (`DEFAULT_MAX_VALIDATION_STEPS = 10_000`), payload depth (`32`), payload size (`1 MiB`), and linear-time Thompson NFA regex matching (`compileSafeRegex`).
- **Runtime Scenario & Validation Integration (`apps/runtime`)**:
  - `apps/runtime` resolves `x-mockflow-environment` / `x-mockflow-environment-id` against `environments` + `environment_scenarios`.
  - `MockEngine.executeWithDelay()` validates `request.body` when `requestSchema` is configured (unless an explicit scenario override is supplied) and routes validation failures to the `VALIDATION_ERROR` scenario when configured, or returns `400 INVALID_REQUEST_BODY` / `413 REQUEST_BODY_TOO_LARGE` otherwise.
  - `INVALID_REQUEST_SCHEMA` at runtime is mapped to `500 MOCK_CONFIGURATION_ERROR` without exposing internal schema details.

## Confirmed Defects

- **None**: No genuine correctness or security defects were found in Phase 3 scenario resolution, contracts, or request validation.

## Known Limitations & Remaining Risks

- **PostgreSQL Persistence Integration**: `apps/api/test/scenarios-validation.test.ts` (1 DB test) and `apps/runtime/test/runtime.integration.test.ts` (1 DB test) skip when `TEST_DATABASE_URL` is unset.

## Overall Assessment

Phase 3 is **implemented, integrated into `apps/runtime`, and verified** across `@mockflow/contracts` (26/26), `@mockflow/mock-engine` (178/178), `@mockflow/api` (5 passed, 2 skipped), and `@mockflow/runtime` (19 passed, 1 skipped).
