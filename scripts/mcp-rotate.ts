// Replaces the local capability with a new random one, so the old value stops working on the next request.
// Usage: bun run mcp:rotate. It reads DATA_DIR (default data) like the server and prints no secret.
import { join } from 'node:path';
import { CAPABILITY_FILE, rotateCapability } from '../src/server/mcp/local-capability';

const file = join(process.env.DATA_DIR || 'data', 'state', CAPABILITY_FILE);
const refusal = rotateCapability(file);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
console.log(`Replaced the capability in ${file}. Clients that read the file pick up the new value; direct clients need the new value in their header.`);
