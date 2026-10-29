// Starts public probes before acquiring the workspace lease and opening data services.
import { hostname } from 'node:os';
import { join } from 'node:path';
import { openWorkspace, type Workspace } from './projects/workspace';
import { createHandler } from './handler';
import { createServerAuthentication, type ServerAuthentication } from './auth/authentication';
import { createSignInProvider } from './auth/sign-in-provider';
import { readConfig } from './config';
import { loadBrandBundle, setActiveBrand } from './brand/bundle';
import { createInstanceLock, instanceLockFiles, revisionIdentity } from './projects/instance-lock';
import { probeDataRoot } from './projects/data-root';
import { healthResponse } from './routes/health';
import { serveStatic } from './static';
import { serveOptions } from './serve-options';
import { clientAddress } from './auth/source-address';
import { logWorkspace } from './startup-log';
import { installShutdownHandlers } from './shutdown';
import { configureLogging, log } from './observability/log';
import { configureActorSalt } from './observability/request-context';
import { startTelemetry } from './observability/telemetry';

const config = readConfig();
configureLogging({
  level: config.observability.logLevel,
  format: config.observability.logFormat,
});
configureActorSalt(config.observability.actorSalt);
setActiveBrand(loadBrandBundle({ directory: config.brandDir }));
const signInProvider = config.mode === 'server' ? await createSignInProvider(config) : undefined;
const hot = globalThis as { __workbench?: { close(): Promise<void> } };
await hot.__workbench?.close();
// Started after the previous instance closed: a hot reload would otherwise register its
// providers a second time and then have them disabled by the old instance's shutdown.
const telemetry = await startTelemetry({
  settings: config.observability.telemetry,
  service: {
    version: config.version,
    commit: config.commit,
    mode: config.mode,
    revision: config.revision,
  },
});
probeDataRoot(config.dataDir, process.pid, process.getuid?.());
if (config.inContainer && config.mode === 'local') {
  log.warn('startup.local-container-networking', {
    detail: 'Local containers must use host networking (Compose profile local). Docker Desktop: Settings → Resources → Network → Enable host networking.',
  });
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
  log: line => log.info('instance-lock', { detail: line }),
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
    reconcilePublished: config.mode === 'server',
  });
  if (config.mode === 'server') {
    authentication = await createServerAuthentication(workspace, config, signInProvider);
  }
  handler = createHandler(workspace, {
    port: config.port,
    ...authentication,
    sourceIp: request => server.requestIP(request)?.address,
    clientAddress: request => clientAddress(server.requestIP(request)?.address, request.headers.get('x-forwarded-for'), config.mode === 'server' ? config.trustedProxyHops : 0),
    keepOpen: request => server.timeout(request, 0),
    browserReports: telemetry.status.enabled,
  });
  await logWorkspace(workspace);
}
const server = Bun.serve(
  serveOptions({
    hostname: config.host,
    port: config.port,
    async fetch(request) {
      const health = healthResponse(request, lock.state, {
        version: config.version,
        commit: config.commit,
        telemetry: telemetry.status,
      });
      if (health) return health;
      if (config.serveStatic && config.mode === 'local') {
        const response = await serveStatic(request);
        if (response) return response;
      }
      return handler!(request);
    },
  }),
);
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
      await telemetry.shutdown();
      detachSignals();
    }
  })();
  return closing;
}
function fail(error: unknown) {
  log.failure('server.fatal', error);
  void close().finally(() => process.exit(1));
}
const detachSignals = installShutdownHandlers(close);
hot.__workbench = { close };
tick();
log.info('server.listening', {
  address: `http://${config.host}:${config.port}`,
  mode: config.mode,
  telemetry: telemetry.status.enabled ? 'on' : 'off',
});
