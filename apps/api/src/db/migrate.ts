import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { parseControlApiEnvironment } from '@mockflow/config';

const environment = parseControlApiEnvironment(process.env);
const client = postgres(environment.DATABASE_URL, { max: 1 });
const migrationId = '0000_initial';

try {
  await client.unsafe(`CREATE TABLE IF NOT EXISTS mockflow_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = await client<{ id: string }[]>`SELECT id FROM mockflow_migrations WHERE id = ${migrationId}`;
  if (applied.length === 0) {
    const sql = await readFile(resolve(import.meta.dirname, '../../drizzle/0000_initial.sql'), 'utf8');
    await client.begin(async (transaction) => {
      await transaction.unsafe(sql);
      await transaction`INSERT INTO mockflow_migrations (id) VALUES (${migrationId})`;
    });
    console.log(`Applied migration ${migrationId}`);
  } else {
    console.log(`Migration ${migrationId} is already applied`);
  }
} finally {
  await client.end();
}
