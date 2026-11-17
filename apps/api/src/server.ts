import { parseControlApiEnvironment } from '@mockflow/config';
import { buildApp } from './app.js';

const environment = parseControlApiEnvironment(process.env);
const app = buildApp();

await app.listen({ host: '0.0.0.0', port: environment.CONTROL_API_PORT });
