import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { parseControlApiEnvironment } from '@mockflow/config';

const environment = parseControlApiEnvironment(process.env);
const client = postgres(environment.DATABASE_URL, { max: 1 });
const drizzleDirectory = resolve(import.meta.dirname, '../../drizzle');

try {
  await client.unsafe(
    `CREATE TABLE IF NOT EXISTS mockflow_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );

  const files = (await readdir(drizzleDirectory)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const migrationId = file.replace(/\.sql$/, '');
    const applied = await client<{ id: string }[]>`
      SELECT id FROM mockflow_migrations WHERE id = ${migrationId}
    `;

    if (applied.length === 0) {
      const sql = await readFile(resolve(drizzleDirectory, file), 'utf8');
      await client.begin(async (transaction) => {
        await transaction.unsafe(sql);
        await transaction`INSERT INTO mockflow_migrations (id) VALUES (${migrationId})`;
      });
      console.log(`Applied migration ${migrationId}`);
    } else {
      console.log(`Migration ${migrationId} is already applied`);
    }
  }
} finally {
  await client.end();
}
