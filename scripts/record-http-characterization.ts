// Writes the HTTP compatibility fixture before the access boundary changes.
import { characterizeHttp } from '../tests/auth/http-characterization';

const target = 'tests/fixtures/characterization/http-v1.json';
await Bun.write(target, JSON.stringify(await characterizeHttp(), null, 2) + '\n');
console.log(`HTTP characterization written to ${target}`);
