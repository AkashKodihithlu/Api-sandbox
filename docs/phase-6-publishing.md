# MockFlow Phase 6 — Mock Generation & Publishing

## Overview

Phase 6 connects local API discovery (`packages/api-discovery`) and the VS Code extension (`apps/vscode-extension`) to the Control Plane (`apps/api`) and hosted Mock Runtime (`apps/runtime`).

## Workflow

1. **Discovery -> Editable Draft (`draft-builder.ts`)**:
   - `createDraftFromDiscovery()` converts a `DiscoveryGroup` into a draft API definition (`isPublished: false`) and a clearly labeled default scenario suggestion (`Suggested (inferred from ...)`).
   - `POST`/`PUT`/`PATCH` calls with `JSON.stringify` body hints receive a labeled `requestSchema` suggestion.
   - Uncertain/dynamic discoveries cannot be created directly without explicit user path editing.
2. **Conflict Detection**:
   - `detectApiConflict()` checks normalized `METHOD + path` (`normalizedRoutePath`) against existing project APIs before creation, and the Control Plane enforces `api_definitions_project_method_path_unique` (`409 CONFLICT`).
3. **Endpoint & Scenario Editing (`mockflow.configureApi`)**:
   - Users can add or edit scenarios (`statusCode`, `headers`, `body`, `delayMs`) and `requestSchema`, validated locally via `@mockflow/contracts` (`validateScenarioConfiguration`, `validateRequestSchemaDefinition`) and persisted via `PATCH /v1/apis/:apiId`, `POST /v1/apis/:apiId/scenarios`, and `PATCH /v1/scenarios/:scenarioId`.
4. **Explicit Publishing & Unpublishing (`mockflow.publishApi`, `mockflow.unpublishApi`)**:
   - Drafts are never published automatically. Publishing requires explicit user confirmation and at least one configured response scenario (enforced in both the extension and `PATCH /v1/apis/:apiId` in `apps/api/src/routes.ts`).
   - Unpublishing sets `isPublished: false`, immediately stopping runtime traffic for that endpoint.
5. **Hosted URL & Runtime Testing (`mockflow.copyEndpointUrl`, `mockflow.testEndpoint`)**:
   - Builds `${mockflow.runtimeBaseUrl}/p/${projectSlug}${apiPath}` (default `http://localhost:4001`), copies to clipboard, and executes live test requests with optional body/scenario override, printing status, duration, headers, and body to the `MockFlow Runtime` output channel.

## Known Limitations

- Extension UI tests run against mocked `fetch` and local type stubs (`vscode.d.ts`) rather than an interactive VS Code Extension Development Host (`@vscode/test-electron`).
- PostgreSQL integration tests in `apps/api` and `apps/runtime` require `TEST_DATABASE_URL`.
