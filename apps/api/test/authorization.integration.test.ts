import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('control-plane project authorization', () => {
  const connection = createDatabase(databaseUrl!);
  const app = buildApp({
    db: connection.db,
    authSecret: 'integration-test-secret-that-is-long-enough',
  });

  beforeAll(async () => {
    await connection.client.unsafe(
      'TRUNCATE request_logs, environment_scenarios, environments, response_scenarios, api_definitions, project_members, projects, users CASCADE',
    );
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await connection.client.end();
  });

  it('denies one user access to another user project', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'first@example.test', password: 'a-long-test-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'second@example.test', password: 'another-test-password' },
    });
    const firstToken = first.json().data.token;
    const secondToken = second.json().data.token;
    const project = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${firstToken}` },
      payload: { name: 'First project', slug: 'first-project' },
    });
    const response = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.json().data.id}`,
      headers: { authorization: `Bearer ${secondToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ACCESS_DENIED' } });
  });
});
