import { mkdirSync } from 'node:fs';
import { createStore } from './store';
import { createHandler } from './handler';
mkdirSync('data', { recursive: true });
const store = createStore('data/workbench.sqlite');
Bun.serve({ hostname: '127.0.0.1', port: 4310, fetch: createHandler(store) });
console.log('SQLite API: http://127.0.0.1:4310');
