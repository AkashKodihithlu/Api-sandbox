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
