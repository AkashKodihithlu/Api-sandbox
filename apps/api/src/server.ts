import { fileURLToPath } from 'node:url';
import { parseControlApiEnvironment } from '@mockflow/config';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Ignore when root .env is absent; rely on injected process.env.
}

const environment = parseControlApiEnvironment(process.env);
const { db, client } = createDatabase(environment.DATABASE_URL);
const app = buildApp({
  db,
  authSecret: environment.AUTH_SECRET,
  onClose: () => client.end(),
});

await app.listen({ host: '0.0.0.0', port: environment.CONTROL_API_PORT });
