// Exercises an image through its own API, then runs browser suites against its built frontend.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gateSuites } from './gate-suites';
import { buildArguments, chooseEngine, readImageContext } from './image';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    image: { type: 'string' },
    build: { type: 'boolean' },
    port: { type: 'string', default: '4310' },
    suite: { type: 'string', default: 'local' },
  },
});
const port = Number(values.port);
assert(Number.isInteger(port) && port > 0 && port < 65535, '--port must be between 1 and 65534');
assert(!(values.image && values.build), 'Choose --image or --build');
const suites = values.suite === 'local' ? gateSuites : [values.suite!];
assert(
  suites.every(suite => gateSuites.includes(suite)),
  'Unknown local --suite',
);
const engine = chooseEngine(['docker', 'podman'].filter(name => Bun.which(name)));
const runtime = Bun.which(engine);
assert(runtime, 'Install Docker or Podman to run container checks.');
const podman = engine === 'podman';
const image = values.image ?? 'semantic-workbench:dev';
const containers: string[] = [];
const baseUrl = `http://127.0.0.1:${port}`;

async function command(args: string[], env = process.env) {
  const child = Bun.spawn(args, { env, stdout: 'pipe', stderr: 'pipe' });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, `${args.join(' ')} failed:\n${output}\n${error}`);
  return output.trim();
}
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
async function waitReady(selected: number, state: string, status = 200) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${selected}/readyz`, {
        signal: AbortSignal.timeout(2000),
      });
      const body = await response.json();
      if (response.status === status && body.state === state) return;
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !['ConnectionRefused', 'ECONNREFUSED', 'TimeoutError'].includes(
          (error as NodeJS.ErrnoException).code ?? (error as Error).name,
        )
      ) {
        throw error;
      }
    }
    await Bun.sleep(1000);
  }
  throw new Error(`Port ${selected} did not become ${state}`);
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
    ...userMapping,
    '-v',
    `${root}:/data${podman ? ':z' : ''}`,
    '-e',
    'SW_MODE=local',
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
let cleaning: Promise<void> | undefined;
function cleanOnce() {
  cleaning ??= cleanup(root);
  return cleaning;
}
function onSignal(signal: 'SIGINT' | 'SIGTERM') {
  void cleanOnce()
    .catch(error => console.error(error))
    .finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
}
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
try {
  if (!values.image) {
    const context = await readImageContext(engine);
    await command(buildArguments(context, [image]));
  }
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
  console.log('Container checks passed.');
} finally {
  await cleanOnce();
}

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
