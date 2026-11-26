import { parseRuntimeEnvironment } from '@mockflow/config';
import { createDatabase } from '@mockflow/db';
import { buildApp } from './app.js';

const environment = parseRuntimeEnvironment(process.env);
const { db, client } = createDatabase(environment.DATABASE_URL);
const app = buildApp({
  db,
  maxRequestBodyBytes: environment.REQUEST_BODY_MAX_BYTES,
  maxResponseBodyBytes: environment.RESPONSE_BODY_MAX_BYTES,
  maxDelayMs: environment.MAX_ARTIFICIAL_DELAY_MS,
  onClose: () => client.end(),
});

await app.listen({ host: '0.0.0.0', port: environment.RUNTIME_PORT });
