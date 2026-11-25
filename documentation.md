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

**## Phase 2 — core mock engine**

Commit: `e689e1b` — `feat(mock-engine): implement route matcher`

I started Phase 2 by implementing the route matcher inside the `packages/mock-engine` package. It handles HTTP method and path matching, including parameterized routes, route specificity, path normalization, URL parameter decoding, and validation against invalid or ambiguous route configurations. I also added tests covering static and parameterized routes, method isolation, normalization, malformed paths, and edge cases.

Commit: `b714761` — `feat(mock-engine): implement scenario resolver`

Next, I implemented the scenario resolver, which determines which response scenario should be used for a matched API definition. It supports explicit scenario selection, environment-specific scenario mappings, API default scenarios, and optional fallback behavior. I added validation for missing scenarios, mismatched API or project ownership, conflicting selections, and invalid configurations. The resolver remains framework-independent and receives the scenario data from its caller rather than fetching it itself.

Commit: `240942a` — `feat(mock-engine): implement response executor`

I then implemented the response executor to construct mock responses with status codes, headers, bodies, and artificial delays. It validates status codes, header names and values, rejects prohibited hop-by-hop and framing headers, enforces response body size and delay limits, and includes mandatory security headers. It also handles body-forbidden HTTP statuses, safe JSON serialization, text and binary responses, and structured execution errors. Tests cover response validation, size limits, delay limits, body handling, and HTTP status-specific behavior.

Commit: `58e72a5` — `feat(mock-engine): integrate unified engine`

Finally, I integrated the route matcher, scenario resolver, and response executor into a unified mock engine API. The engine handles the complete flow from matching an incoming request to resolving the appropriate scenario and constructing the response. It supports request context, explicit scenario selection through request fields or headers, environment selection, configurable execution limits, structured success and failure results, and artificial response delays. I also added integration tests covering the complete execution flow, route matching failures, scenario resolution failures, response execution failures, parameter extraction, and scenario selection behavior.

The main challenge during this phase was ensuring that all four components worked together while remaining independent of Fastify, database access, and other application infrastructure. I focused on route specificity, scenario selection precedence, response validation, error handling, and keeping the engine reusable for the runtime integration phase. I verified the implementation with 151 passing tests across the four test suites, along with successful TypeScript typechecking, build, and Prettier checks.

While preparing the project for GitHub Actions, I encountered a Bun version mismatch between the local environment and the CI workflow. The workflow was using Bun 1.3.14, while the lockfile was generated using a newer Bun version. This caused the dependency installation step to fail with an unknown lockfile version error. I updated the CI workflow to use Bun 1.4.5 to align it with the lockfile, which resolved that installation issue.

I also encountered formatting failures during CI because several repository files did not follow the Prettier formatting rules. I ran the formatter across the repository and verified that the formatting check passed locally. During further CI verification, I found a package-resolution issue involving `@mockflow/config` in the API and runtime lint checks, which I am still investigating.

The implementation was pushed to my fork, `AkashKodihithlu/Api-sandbox`, on the `main` branch.



**## Phase 3 — scenarios and request validation**

Commit: `c8a3bba` — `feat: add phase 3 scenario validation`

In Phase 3, I extended the MockFlow contracts, control-plane API, and mock engine to support typed response scenarios and request-schema validation. I introduced additional scenario types and updated the database schema and migration to accommodate the new scenario configuration.

I implemented request validation in the mock engine using a bounded JSON Schema subset. The validator supports validating incoming request bodies against configured schemas, including structural constraints, supported schema keywords, references, nested validation, and structured validation issue reporting. I also integrated request validation into the unified engine execution flow so that invalid requests can produce structured validation failures and resolve to dedicated validation-error scenarios where configured.

On the control-plane side, I extended scenario management and validation logic. Scenario configurations are validated when saved, and PATCH operations validate the merged configuration rather than only the fields included in the incoming update. This helps prevent partial updates from leaving scenario configurations in an invalid state. I also added the database migration and updated the API tests to cover scenario persistence, validation behavior, and server lifecycle handling.

A significant part of this phase involved implementing safe regular-expression validation and execution for schema-related validation rules. Instead of relying directly on potentially unsafe regular-expression execution, I implemented a bounded regex engine based on a Thompson NFA approach. This includes restrictions on unsupported syntax, execution budgets, and resource limits to reduce the risk of catastrophic backtracking and excessive resource consumption. I also added tests covering supported syntax, invalid patterns, edge cases, and resource limits.

The main challenge during this phase was implementing validation that was expressive enough to support useful request-schema constraints while remaining bounded and safe. I also focused on ensuring that validation was consistent across the contracts package, control-plane API, and mock engine, while preserving the existing route matching, scenario resolution, and response execution behavior.

I verified the implementation with 177 passing mock-engine tests, 26 passing contracts tests, and the API test suite with 5 passing tests and 2 skipped tests. I also ran the complete workspace TypeScript typecheck and build successfully. The complete monorepo test suite passed, with tests requiring dedicated integration-test configuration skipped where applicable.

The implementation was committed as `c8a3bba` on the `feat/phase-3-scenarios-validation` branch and pushed to my fork, `AkashKodihithlu/Api-sandbox`.
