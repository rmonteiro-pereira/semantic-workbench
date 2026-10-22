// Starts public probes before acquiring the workspace lease and opening data services.
import { hostname } from 'node:os';
import { join } from 'node:path';
import { openWorkspace, type Workspace } from './projects/workspace';
import { createHandler } from './handler';
import { createServerAuthentication, type ServerAuthentication } from './auth/authentication';
import { createOidcClient } from './auth/oidc';
import { readConfig } from './config';
import { createInstanceLock, instanceLockFiles, revisionIdentity } from './projects/instance-lock';
import { probeDataRoot } from './projects/data-root';
import { healthResponse } from './routes/health';
import { serveStatic } from './static';
import { logWorkspace } from './startup-log';
import { installShutdownHandlers } from './shutdown';

const config = readConfig();
const oidc = config.mode === 'server' ? await createOidcClient(config) : undefined;
const hot = globalThis as { __workbench?: { close(): Promise<void> } };
await hot.__workbench?.close();
probeDataRoot(config.dataDir, process.pid, process.getuid?.());
if (config.inContainer && config.mode === 'local') {
  console.log(
    'Local containers must use host networking (Compose profile local). ' +
      'Docker Desktop: Settings → Resources → Network → Enable host networking.',
  );
}
let workspace: Workspace | undefined;
let authentication: ServerAuthentication | undefined;
let initialization: Promise<void> = Promise.resolve();
let handler: ReturnType<typeof createHandler> | undefined;
const lock = createInstanceLock({
  host: hostname(),
  pid: process.pid,
  revision: revisionIdentity(config),
  now: Date.now,
  files: instanceLockFiles(join(config.dataDir, 'state/instance.lock')),
  log: console.log,
  open() {
    initialization = initializeWorkspace();
    return initialization;
  },
});
async function initializeWorkspace() {
  workspace = await openWorkspace({
    root: config.dataDir,
    cacheDir: config.cacheDir,
    watch: true,
  });
  if (config.mode === 'server') {
    authentication = await createServerAuthentication(workspace, config, oidc);
  }
  handler = createHandler(workspace, {
    port: config.port,
    ...authentication,
    sourceIp: request => server.requestIP(request)?.address,
  });
  await logWorkspace(workspace);
}
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  idleTimeout: 0,
  async fetch(request) {
    const health = healthResponse(request, lock.state, config);
    if (health) return health;
    if (config.serveStatic && config.mode === 'local') {
      const response = await serveStatic(request);
      if (response) return response;
    }
    return handler!(request);
  },
});
let pending = Promise.resolve();
let closing: Promise<void> | undefined;
function tick() {
  pending = lock.tick();
  void pending.catch(fail);
}
const timer = setInterval(tick, 10_000);
function close() {
  closing ??= (async () => {
    clearInterval(timer);
    await server.stop(true);
    try {
      await initialization;
      await pending;
    } finally {
      authentication?.close();
      workspace?.close();
      await lock.close();
      detachSignals();
    }
  })();
  return closing;
}
function fail(error: unknown) {
  console.error(error);
  void close().finally(() => process.exit(1));
}
const detachSignals = installShutdownHandlers(close);
hot.__workbench = { close };
tick();
console.log(`Workbench API: http://${config.host}:${config.port} (data root ${config.dataDir})`);
