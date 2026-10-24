import { runCommand, waitReady as processReady, withCleanup } from './helpers/processes';
// Exercises an image through its own API, then runs browser suites against its built frontend.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gateSuites } from './gate-suites';
import { serverSuites } from './container-suites';
import { authContainerCheck } from './auth-container-check';
import { buildArguments, chooseEngine, readImageContext } from './image';
import { hardenedRunArguments } from './container-hardening';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    image: { type: 'string' },
    build: { type: 'boolean' },
    port: { type: 'string', default: process.env.SW_CONTAINER_PORT ?? '4310' },
    suite: { type: 'string', default: 'all' },
  },
});
const port = Number(values.port);
assert(Number.isInteger(port) && port > 0 && port < 65535, '--port must be between 1 and 65534');
assert(!(values.image && values.build), 'Choose --image or --build');
const localSuites = gateSuites.filter(suite => !serverSuites.includes(suite));
const suites = ['all', 'local'].includes(values.suite!)
  ? localSuites
  : localSuites.filter(suite => suite === values.suite);
const runServer = ['all', 'server', ...serverSuites].includes(values.suite!);
assert(runServer || suites.length > 0, 'Unknown --suite');
const engine = chooseEngine(['docker', 'podman'].filter(name => Bun.which(name)));
const runtime = Bun.which(engine);
assert(runtime, 'Install Docker or Podman to run container checks.');
const podman = engine === 'podman';
const image = values.image ?? 'semantic-workbench:dev';
const containers: string[] = [];
const baseUrl = `http://127.0.0.1:${port}`;

function ensureFree(selected: number) {
  try {
    const listener = Bun.listen({
      hostname: '127.0.0.1',
      port: selected,
      socket: { data() {} },
    });
    listener.stop(true);
  } catch (cause) {
    throw new Error(`Port ${selected} must be free; use --port to select another base port.`, {
      cause,
    });
  }
}
function waitReady(port: number, state: string, status = 200) {
  return processReady(`http://127.0.0.1:${port}`, state, status, 90_000);
}
async function start(root: string, selected: number) {
  const name = `workbench-check-${process.pid}-${selected}`;
  containers.push(name);
  // keep-id maps the caller's writable temporary folder to the image's bun user.
  const userMapping = podman ? ['--userns', 'keep-id:uid=1000,gid=1000'] : [];
  await command([
    runtime!,
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'host',
    ...hardenedRunArguments(),
    ...userMapping,
    '-v',
    `${root}:/data${podman ? ':z' : ''}`,
    '-e',
    'SW_MODE=local',
    // Local mode must ignore a connection string: no telemetry code loads and nothing is sent.
    '-e',
    'APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f',
    '-e',
    `SW_PORT=${selected}`,
    image,
  ]);
  return name;
}
async function inspectImage(name: string) {
  assert.notEqual(await command([runtime!, 'exec', name, 'id', '-u']), '0');
  const git = await command([runtime!, 'exec', name, 'git', '--version']);
  const match = git.match(/(\d+)\.(\d+)/)!;
  assert(Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 40));
  const inspected = JSON.parse(await command([runtime!, 'image', 'inspect', image]));
  const labels = inspected[0].Config.Labels;
  for (const key of ['version', 'revision', 'source', 'created']) {
    assert(labels[`org.opencontainers.image.${key}`], `Missing OCI ${key}`);
  }
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    version: labels['org.opencontainers.image.version'],
    commit: labels['org.opencontainers.image.revision'],
    telemetry: { enabled: false, reason: 'local-mode' },
  });
}
async function persistence(name: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ name: 'Container persistence' }),
  });
  assert(response.ok, await response.text());
  await command([runtime!, 'restart', name]);
  await waitReady(port, 'serving');
  const projects = await fetch(`${baseUrl}/api/projects`);
  assert(projects.ok);
  assert((await projects.text()).includes('Container persistence'));
}

if (!podman && process.getuid?.() !== 1000) {
  throw new Error('Docker bind mounts require this temporary folder to be owned by uid 1000.');
}

ensureFree(port);
ensureFree(port + 1);
const root = await mkdtemp(join(tmpdir(), 'workbench-container-'));
await withCleanup(
  () => cleanup(root),
  async () => {
    if (!values.image) {
      const context = await readImageContext(engine);
      await command(buildArguments(context, [image]));
    }
    if (suites.length) {
      const name = await start(root, port);
      await waitReady(port, 'serving');
      await inspectImage(name);
      for (const suite of suites) {
        console.log(`Running ${suite}`);
        await command([process.execPath, 'run', suite], { ...process.env, SW_BASE_URL: baseUrl });
      }
      await persistence(name);
      const second = await start(root, port + 1);
      await waitReady(port + 1, 'refused', 503);
      const logs = await command([runtime, 'logs', second]);
      assert(logs.includes('Only one replica per data root is supported.'));
      await command([runtime, 'stop', name]);
      await command([runtime, 'stop', second]);
    }
    if (runServer) await authContainerCheck(engine, image, port);
    console.log('Container checks passed.');
  },
);

async function cleanup(root: string) {
  const results = await Promise.allSettled(
    containers.reverse().map(name => command([runtime!, 'rm', '-f', name])),
  );
  await rm(root, { recursive: true, force: true });
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(
      failures.map(result => result.reason),
      'Container cleanup failed',
    );
  }
}

function command(args: string[], env = process.env) {
  return runCommand(args, true, env);
}
