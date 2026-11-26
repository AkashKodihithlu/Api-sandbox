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

**## Phase 2 — Core Mock Engine and Runtime Integration**

Commits: `e689e1b`, `b714761`, `240942a`, `58e72a5`, `d85a068`, `87b6a0b`, `38bc22a`, `a94ade4`, `f59ff27`, `b6fdb4d`

In Phase 2, I implemented the core mock engine, including route matching, scenario resolution, and response execution. The route matcher supports HTTP method and path matching, parameterized routes, route specificity, path normalization, and validation against invalid or ambiguous configurations. The scenario resolver supports explicit scenario selection, environment-specific mappings, default scenarios, and fallback behavior. The response executor handles configured status codes, headers, bodies, artificial delays, security headers, body-size limits, and response validation.

I then integrated the mock engine into the public runtime service. I extracted the shared database infrastructure into a reusable package and implemented the runtime store to retrieve projects, API definitions, scenarios, and environment configurations. The runtime now resolves projects using their public slugs, matches incoming routes, selects environments and scenarios, executes mock responses, and records request logs. The public endpoint convention is `/p/{projectSlug}/{routePath}`.

I also implemented runtime safeguards, including sensitive-header redaction, bounded execution behavior, structured error handling, and best-effort request logging. The runtime and control plane remain separate services, while the runtime directly accesses the shared database infrastructure rather than relying on control-plane HTTP requests during mock execution.

During verification, I identified and fixed a route specificity comparator defect that affected ordering in certain cases involving routes with different segment lengths. I corrected the comparator to enforce strict weak ordering and added regression tests. I also conducted a Phase 2 audit and documented the runtime architecture and audit findings in `docs/runtime-architecture.md` and `docs/phase-2-audit.md`.

I verified the implementation using a dedicated PostgreSQL test database. The verified test results included 26 contracts tests, 178 mock-engine tests, 1 DB test, 7 API tests, and 20 runtime tests, with the runtime suite completing without skips. I also verified typechecking and builds across the core packages at the relevant checkpoints.

The implementation, integration testing, comparator fix, and audit documentation were committed and preserved on my fork under the `feat/phase-2-runtime-integration` branch.

---

**## Phase 3 — Scenarios and Request Validation**

Commit: `c8a3bba` — `feat: add phase 3 scenario validation`

In Phase 3, I extended the contracts, control-plane API, and mock engine to support typed response scenarios and request-schema validation. I implemented a bounded JSON Schema validator supporting structural constraints, supported schema keywords, references, nested validation, and structured validation issues. The validation functionality was integrated into the unified engine so invalid requests can produce structured failures and resolve to configured validation-error scenarios.

I also extended scenario management and validation on the control-plane side. Scenario configurations are validated when saved, and PATCH operations validate the merged configuration rather than only the fields included in the update. This helps prevent partial updates from leaving configurations invalid. I updated the database migration and API tests to cover scenario persistence, validation behavior, and server lifecycle handling.

A significant challenge during this phase was implementing safe regular-expression validation and execution. Instead of relying directly on potentially unsafe regex execution, I implemented a bounded regex engine based on a Thompson NFA approach, with syntax restrictions, execution budgets, and resource limits to reduce the risk of catastrophic backtracking and excessive resource consumption. Tests cover supported syntax, invalid patterns, edge cases, and resource limits.

I integrated request validation with the runtime execution pipeline, ensuring that request validation, scenario resolution, environment handling, and response execution work together while preserving the existing mock-engine functionality.

I verified the implementation through the contracts, mock-engine, API, and runtime test suites, with later integration checkpoints recording 26 contracts tests, 178 mock-engine tests, 1 DB test, 7 API tests, and 20 runtime tests passing. I also completed typechecking and build verification for the core packages at the relevant checkpoints.

I subsequently conducted a Phase 3 audit covering scenario configuration, request validation, validation-error handling, and runtime integration. No confirmed defects were identified within the audited Phase 3 scope. The findings were documented in `docs/phase-3-audit.md` and committed as `2c87084` (`docs: add phase 3 scenario validation audit report`).

The Phase 2/3 integration and audit work was preserved on my fork under the `feat/phase-2-runtime-integration` branch.