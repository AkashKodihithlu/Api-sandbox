import { parseControlApiEnvironment } from '@mockflow/config';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';

const environment = parseControlApiEnvironment(process.env);
const { db, client } = createDatabase(environment.DATABASE_URL);
const app = buildApp({ db, authSecret: environment.AUTH_SECRET });

await app.listen({ host: '0.0.0.0', port: environment.CONTROL_API_PORT });
app.addHook('onClose', async () => client.end());
