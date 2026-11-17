import { parseRuntimeEnvironment } from '@mockflow/config';
import { buildApp } from './app.js';

const environment = parseRuntimeEnvironment(process.env);
const app = buildApp();

await app.listen({ host: '0.0.0.0', port: environment.RUNTIME_PORT });
