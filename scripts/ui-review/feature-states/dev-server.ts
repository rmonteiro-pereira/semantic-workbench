// Starts the Vite frontend on the capture port as a child process the capture owns and stops.
import { APP_URL } from './session';

const VITE_PORT = Number(new URL(APP_URL).port);

// Vite runs under Node in its own process, so a crash in the browser run cannot leave it bound to the port.
const LAUNCHER = `import { createServer } from 'vite-plus';
const server = await createServer({ server: { host: '127.0.0.1', port: ${VITE_PORT}, strictPort: true } });
await server.listen();
process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});`;

async function isServing() {
  return fetch(APP_URL)
    .then(answer => answer.ok)
    .catch(() => false);
}

/** Returns a function that stops the server. Waits up to ten seconds for the first answer. */
export async function startDevServer() {
  const vite = Bun.spawn(['node', '--input-type=module', '-e', LAUNCHER], { stdout: 'ignore', stderr: 'inherit' });
  for (let tries = 0; tries < 100; tries++) {
    if (await isServing()) break;
    await Bun.sleep(100);
  }
  return async () => {
    vite.kill();
    await vite.exited;
  };
}
