import { buildApp } from './app.js';
import { createDevPorts } from './dev-stubs.js';

const app = await buildApp({ ports: createDevPorts() });
try { await app.ready(); console.log(JSON.stringify(app.swagger(), null, 2)); }
finally { await app.close(); }
