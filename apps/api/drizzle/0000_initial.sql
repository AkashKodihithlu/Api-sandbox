CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE project_status AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE project_role AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
CREATE TYPE http_method AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(320) NOT NULL UNIQUE,
  display_name varchar(120), password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name varchar(120) NOT NULL, slug varchar(80) NOT NULL UNIQUE, description varchar(500),
  status project_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role project_role NOT NULL DEFAULT 'VIEWER', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (project_id, user_id)
);
CREATE TABLE api_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, method http_method NOT NULL, path varchar(500) NOT NULL, description varchar(500),
  request_schema jsonb, default_scenario_id uuid, is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (project_id, method, path)
);
CREATE TABLE response_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), api_definition_id uuid NOT NULL REFERENCES api_definitions(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599), headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  body jsonb, delay_ms integer NOT NULL DEFAULT 0 CHECK (delay_ms BETWEEN 0 AND 10000), is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (api_definition_id, name)
);
CREATE UNIQUE INDEX response_scenarios_one_default_per_api ON response_scenarios (api_definition_id) WHERE is_default;
CREATE TABLE environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (project_id, name)
);
CREATE TABLE environment_scenarios (
  environment_id uuid NOT NULL REFERENCES environments(id) ON DELETE CASCADE, api_definition_id uuid NOT NULL REFERENCES api_definitions(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES response_scenarios(id) ON DELETE CASCADE, PRIMARY KEY (environment_id, api_definition_id)
);
CREATE TABLE request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_definition_id uuid REFERENCES api_definitions(id) ON DELETE SET NULL, scenario_id uuid REFERENCES response_scenarios(id) ON DELETE SET NULL,
  method varchar(16) NOT NULL, path varchar(500) NOT NULL, status_code integer NOT NULL, duration_ms integer NOT NULL,
  request_bytes integer NOT NULL DEFAULT 0, response_bytes integer NOT NULL DEFAULT 0, redacted_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_id_idx ON projects(owner_id);
CREATE INDEX api_definitions_project_method_path_idx ON api_definitions(project_id, method, path);
CREATE INDEX response_scenarios_api_definition_id_idx ON response_scenarios(api_definition_id);
CREATE INDEX environments_project_id_idx ON environments(project_id);
CREATE INDEX request_logs_project_created_at_idx ON request_logs(project_id, created_at DESC);
