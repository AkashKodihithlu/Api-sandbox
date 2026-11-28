# MockFlow implementation notes

## Phase 0 — repository foundation

Commit: `359609b` — `feat : establish MockFlow repository foundation ( Phase 0 )`

I started by setting up the project as a Bun workspace so that the API,
runtime, dashboard, VS Code extension, and shared packages can grow without
being tightly coupled. I kept the control plane and public runtime as separate
Fastify services from the beginning, because they have different security and
deployment needs.

The commit includes the initial workspace layout, shared TypeScript settings,
formatting and quality scripts, Docker Compose PostgreSQL, environment
validation, basic health/readiness endpoints, health tests, and a GitHub Actions
quality workflow. I also created the dashboard and extension compilation
boundaries, without adding product functionality before its phase.

The main issue during this part was the local Bun installation. Bun 1.3.14
crashed immediately while resolving/installing workspace dependencies on this
Windows machine. I retried with its copy-file backend, but it crashed in the
same way. Because the failure happened before dependency resolution, I could
not generate the lockfile or run the normal Bun checks locally. The scripts and
CI commands are still wired for a normal Bun environment.

## Phase 1 — control-plane persistence and API

Commit: `898c9a0` — `feat : implement control plane persistence and API ( Phase 1 )`

For this phase I added the PostgreSQL model using Drizzle and a committed SQL
migration. The schema covers users, projects, project memberships, API
definitions, response scenarios, environments, environment scenario mappings,
and request logs. I also added useful database constraints and indexes, such as
unique project slugs, unique API method/path combinations per project, and one
default scenario per API definition.

The API now supports local account registration and sessions, then uses JWTs to
protect management endpoints. Passwords are stored as salted scrypt hashes. A
project creator becomes its owner automatically, and project reads/changes are
checked against membership roles on the server instead of trusting anything
from the client.

I implemented the project, API definition, scenario, and environment routes,
including environment-specific scenario selection. Inputs are checked with Zod,
list responses have bounded pagination, and errors use a shared envelope. I
also added an integration test that proves a second user cannot read a project
owned by the first user.

The main challenge here was that the same Bun crash prevented installing the
new database and Fastify dependencies, so I could not execute the database
integration test locally. I did run Node's TypeScript syntax checks on the new
source files and verified Git whitespace. Once Bun installs successfully, the
next checks I would run are the migration against an empty PostgreSQL database,
the integration test with `TEST_DATABASE_URL`, and the complete root quality
suite.

## Phase 2 — Core Mock Engine and Runtime Integration

Commits: `e689e1b`, `b714761`, `240942a`, `58e72a5`, `d85a068`, `87b6a0b`, `38bc22a`, `a94ade4`, `f59ff27`, `b6fdb4d`

In Phase 2, I implemented the core mock engine, including route matching, scenario resolution, and response execution. The route matcher supports HTTP method and path matching, parameterized routes, route specificity, path normalization, and validation against invalid or ambiguous configurations. The scenario resolver supports explicit scenario selection, environment-specific mappings, default scenarios, and fallback behavior. The response executor handles configured status codes, headers, bodies, artificial delays, security headers, body-size limits, and response validation.

I then integrated the mock engine into the public runtime service. I extracted the shared database infrastructure into a reusable package and implemented the runtime store to retrieve projects, API definitions, scenarios, and environment configurations. The runtime now resolves projects using their public slugs, matches incoming routes, selects environments and scenarios, executes mock responses, and records request logs. The public endpoint convention is `/p/{projectSlug}/{routePath}`.

I also implemented runtime safeguards, including sensitive-header redaction, bounded execution behavior, structured error handling, and best-effort request logging. The runtime and control plane remain separate services, while the runtime directly accesses the shared database infrastructure rather than relying on control-plane HTTP requests during mock execution.

During verification, I identified and fixed a route specificity comparator defect that affected ordering in certain cases involving routes with different segment lengths. I corrected the comparator to enforce strict weak ordering and added regression tests. I also conducted a Phase 2 audit and documented the runtime architecture and audit findings in `docs/runtime-architecture.md` and `docs/phase-2-audit.md`.

I verified the implementation using a dedicated PostgreSQL test database. The verified test results included 26 contracts tests, 178 mock-engine tests, 1 DB test, 7 API tests, and 20 runtime tests, with the runtime suite completing without skips. I also verified typechecking and builds across the core packages at the relevant checkpoints.

The implementation, integration testing, comparator fix, and audit documentation were committed and preserved on my fork under the `feat/phase-2-runtime-integration` branch.

---

## Phase 3 — Scenarios and Request Validation

Commit: `c8a3bba` — `feat: add phase 3 scenario validation`

In Phase 3, I extended the contracts, control-plane API, and mock engine to support typed response scenarios and request-schema validation. I implemented a bounded JSON Schema validator supporting structural constraints, supported schema keywords, references, nested validation, and structured validation issues. The validation functionality was integrated into the unified engine so invalid requests can produce structured failures and resolve to configured validation-error scenarios.

I also extended scenario management and validation on the control-plane side. Scenario configurations are validated when saved, and PATCH operations validate the merged configuration rather than only the fields included in the update. This helps prevent partial updates from leaving configurations invalid. I updated the database migration and API tests to cover scenario persistence, validation behavior, and server lifecycle handling.

A significant challenge during this phase was implementing safe regular-expression validation and execution. Instead of relying directly on potentially unsafe regex execution, I implemented a bounded regex engine based on a Thompson NFA approach, with syntax restrictions, execution budgets, and resource limits to reduce the risk of catastrophic backtracking and excessive resource consumption. Tests cover supported syntax, invalid patterns, edge cases, and resource limits.

I integrated request validation with the runtime execution pipeline, ensuring that request validation, scenario resolution, environment handling, and response execution work together while preserving the existing mock-engine functionality.

I verified the implementation through the contracts, mock-engine, API, and runtime test suites, with later integration checkpoints recording 26 contracts tests, 178 mock-engine tests, 1 DB test, 7 API tests, and 20 runtime tests passing. I also completed typechecking and build verification for the core packages at the relevant checkpoints.

I subsequently conducted a Phase 3 audit covering scenario configuration, request validation, validation-error handling, and runtime integration. No confirmed defects were identified within the audited Phase 3 scope. The findings were documented in `docs/phase-3-audit.md` and committed as `2c87084` (`docs: add phase 3 scenario validation audit report`).

The Phase 2/3 integration and audit work was preserved on my fork under the `feat/phase-2-runtime-integration` branch.

---

## Phase 4 — VS Code Extension Foundation

Commits: `9efd184` — `feat(extension): add secure authentication and control-plane client`; `d0167cc` — `feat(extension): add project workspace tree and selection`

In Phase 4, I established the MockFlow VS Code extension as the local client for the control plane. The extension registers Command Palette actions and a MockFlow Activity Bar container with a project tree, giving users a VS Code-native place to sign in, select a project, refresh its state, and browse APIs, environments, and scenarios.

Authentication uses the VS Code `SecretStorage` API. Session tokens and the signed-in user are stored under dedicated secret keys, are cleared on sign-out, and are never persisted in workspace settings or written to extension logs. The extension uses a typed control-plane client for authentication, project, API, environment, and scenario operations; client failures are converted into user-facing messages rather than crashing the extension.

I also added workspace-scoped project selection using `workspaceState`, so the active MockFlow project is remembered for that workspace. The project tree has loading, empty, signed-out, and error states, and it refreshes after authentication or selection changes. Tests cover credential storage and removal, malformed stored user data, client request/error behavior, and project-selection persistence.

---

## Phase 5 — Local Source-Code API Discovery

Commits: `5e9ed66` — `feat(discovery): add local AST API discovery engine`; `29af134` — `feat(extension): add local API discovery review workflow`; `dc745e7` — `fix: stabilize workspace builds and API discovery`

In Phase 5, I added a local TypeScript AST-based discovery package and connected it to the extension. It scans supported JavaScript and TypeScript source files for `fetch`, Axios verb helpers, and Axios configuration-object calls. For each supported call, it extracts the HTTP method, normalized path, source location, client type, and any identifiable request-body hint. Absolute HTTP URLs are reduced to their paths, duplicate calls are grouped while retaining all source references, and dynamic or unsupported URLs are marked uncertain instead of being guessed.

The scanner is deliberately local-only. It ignores dependency and build directories, respects `.gitignore` plus caller-supplied exclusions, and excludes environment, secret, and credential files from scanning. No source content is sent to the control plane as part of discovery.

The VS Code extension adds an API Discovery tree and commands to scan the current workspace, inspect grouped findings, and ignore individual groups for the current review session. Tests cover supported discovery patterns, normalization and grouping, uncertain dynamic calls, ignore behavior, and the build-stability fixes needed for the workspace package layout.




## Phase 6 — Mock Generation and Publishing

In Phase 6, I implemented the mock generation and publishing workflow within the VS Code extension, connecting API discovery with draft API creation, scenario configuration, publishing controls, and runtime testing. The goal was to make it easier to turn discovered API endpoints into configurable mocks and publish them for testing without requiring users to manually create every API definition from scratch.

I implemented a draft builder that transforms API discovery results into editable API definitions with inferred suggestions, default scenarios, and optional request-schema suggestions. The workflow includes normalized method/path conflict detection and validation against shared contracts before sending configurations to the control plane. Newly generated APIs remain unpublished by default, ensuring that discovery does not automatically expose endpoints.

I extended the control-plane client and publishing workflow to support API configuration, response scenario management, publishing and unpublishing, and hosted endpoint testing. Publishing is explicitly initiated by the user and validated server-side. The API now verifies default scenario ownership and requires at least one response scenario before allowing an API to be published. I also implemented runtime testing functionality that constructs hosted endpoint URLs, supports request execution, and handles runtime errors safely.

The implementation involved extending the VS Code extension orchestration, project tree interactions, control-plane client, draft builder, runtime tester, and API publishing validation. I also added dedicated tests for draft generation, runtime testing, client functionality, and publishing validation, along with documentation describing the publishing workflow.

During final verification, I initially encountered integration tests that were skipped because a test database connection was not configured. I prepared a dedicated PostgreSQL test database, verified that the existing migrations were applied, and subsequently ran the API and Runtime integration tests against it. The API suite passed **10/10 tests**, and the Runtime suite passed **20/20 tests**. The full monorepo test suite also previously reported **251 passed, 0 failed, and 3 skipped**, while the full monorepo typecheck and build both passed.

I conducted a final read-only code review of the Phase 6 implementation. No critical or high-severity issues or security vulnerabilities were identified. The review identified a non-blocking functional limitation in the VS Code scenario-creation workflow, where newly created scenarios are currently assigned the `SUCCESS` type, along with minor tree-refresh and publishing/default-scenario observations that were documented as follow-up considerations.

The Phase 6 implementation, integration testing, validation, and documentation are now ready for the milestone commit on the `feat/phase-6-mock-generation-publishing` branch.


## Phase 7 — Web Platform and Extension Distribution



[Teammate's implementation details, testing, challenges, and commit references to be documented here.]



Commits: `516acf6`, `e771834`, `57029d1`

In Phase 7, I worked on improving the MockFlow web platform, refining its public-facing presentation, improving responsive layouts and theme support, and implementing direct distribution of the VS Code extension through the website.

I redesigned the homepage to improve its visual hierarchy, presentation, and user experience. I refined the responsive layouts for desktop and mobile devices, improved light and dark theme support, and updated navigation, branding, reusable components, and footer components. I also introduced dedicated public-facing pages for Capabilities, Workflow, and the VS Code Extension, separating the platform's information into clearer sections instead of presenting everything through a single landing page.

The Capabilities page presents the platform's functionality, while the Workflow page explains how MockFlow operates. The Extension page provides extension details, installation instructions, configuration guidance, troubleshooting information, and access to the downloadable extension package.

I also implemented extension packaging using `@vscode/vsce` and added the packaging script at `apps/vscode-extension/scripts/package-vsix.mjs`. The generated VSIX artifact, `mockflow-vscode-extension-0.1.0.vsix`, was included in the web application's public downloads directory at `apps/web/public/downloads/`. This allows users to download the extension directly through the website without requiring authentication. The extension is currently distributed through direct VSIX downloads and has not yet been published to the VS Code Marketplace.

During development, I identified API and Runtime environment-loading issues when running the services through `tsx`. The root `.env` file was not being loaded reliably by these processes. I addressed this by explicitly loading the environment file in the API and Runtime server entry points while retaining the existing Zod-based environment validation.

I verified the implementation through API, Runtime, and Web typechecks, 11/11 web unit tests, a successful Next.js production build, and Playwright-based visual and route checks. These checks included desktop and mobile layouts, light and dark themes, and public extension download verification. Full end-to-end verification with all services running simultaneously was not completed and remains a follow-up.

Existing API contracts, database schemas, authentication logic, runtime behavior, and extension business logic were preserved.

The Phase 7 web redesign and extension distribution implementation was committed as `57029d1` (`feat: redesign web platform and distribute VS Code extension`) on the `feat/web-visual-polish` branch.
