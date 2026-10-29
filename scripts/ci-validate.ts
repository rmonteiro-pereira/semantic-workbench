import { runCommand, freeLoopbackPort, withCleanup } from './helpers/processes';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { selfServedSuites, gateSuites } from './gate-suites';
import { chooseEngine } from './image';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Canonical execution order, also used by the pipeline plan validator. */
export const gateSteps = ['verify', 'mutation', 'browser', 'image', 'container', 'pipeline'] as const;
/** A selectable quality gate step. */
export type GateStep = (typeof gateSteps)[number];
/** Validated command-line selection. */
export type GateOptions = { steps: GateStep[]; suite?: string; keepGoing: boolean };
/** A completed step with diagnostic information and elapsed time. */
export type GateResult = { step: GateStep; seconds: number; error?: string };

/** Selects steps in gate order and rejects unknown or incompatible selectors. */
export function selectSteps(steps: string[], suite?: string): GateStep[] {
  for (const step of steps) {
    if (!gateSteps.includes(step as GateStep)) throw Error(`Unknown gate step: ${step}`);
  }
  if (suite && !gateSuites.includes(suite)) throw Error(`Unknown gate suite: ${suite}`);
  const selected = gateSteps.filter(step => steps.length === 0 || steps.includes(step));
  if (suite && !selected.includes('browser')) throw Error('--suite requires the browser step');
  return selected;
}

/** Parses the public CLI once before any process is started. */
export function parseGateOptions(args: string[]): GateOptions {
  const { values } = parseArgs({
    args: args.filter(arg => arg !== '--'),
    options: {
      step: { type: 'string', multiple: true },
      suite: { type: 'string' },
      'keep-going': { type: 'boolean' },
    },
  });
  return {
    steps: selectSteps(values.step ?? [], values.suite),
    suite: values.suite,
    keepGoing: values['keep-going'] ?? false,
  };
}

/** Returns the package commands belonging to a gate step. */
export function stepCommands(step: GateStep, suite?: string): string[][] {
  const run = (script: string, ...args: string[]) => ['bun', 'run', script, ...args];
  switch (step) {
    case 'verify':
      return [run('check'), ['bun', 'test'], run('build')];
    case 'mutation':
      return [run('test:mutation')];
    case 'browser':
      return (suite ? [suite] : gateSuites).map(script => run(script));
    case 'image':
      return ['image:build', 'image:scan', 'image:sbom'].map(script => run(script));
    case 'container':
      return [run('test:container', '--image', 'semantic-workbench:dev')];
    case 'pipeline':
      return [run('pipeline:lint'), ...['pr', 'main', 'tag:v0.4.0-alpha.1'].map(kind => run('pipeline:dry-run', '--', '--run', kind))];
  }
}

/** Summarizes recorded results without reading the clock or filesystem. */
export function summarize(results: GateResult[]) {
  return {
    seconds: results.reduce((total, result) => total + result.seconds, 0),
    failed: results.filter(result => result.error !== undefined).map(result => result.step),
    results,
  };
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    character =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
}

/** Renders a step result as portable JUnit XML. */
export function renderJUnit(result: GateResult): string {
  const failure = result.error === undefined ? '' : `<failure message="${escapeXml(result.error)}">${escapeXml(result.error)}</failure>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuite name="${result.step}" tests="1" failures="${Number(!!failure)}"` +
    ` time="${result.seconds}"><testcase name="${result.step}"` +
    ` time="${result.seconds}">${failure}</testcase></testsuite>\n`
  );
}

/** Executes selected steps through an injected edge and records failures. */
export async function runGate(
  options: GateOptions,
  execute: (step: GateStep, suite?: string) => Promise<void>,
  now: () => number,
  report: (message: string) => void = console.error,
): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const step of options.steps) {
    const started = now();
    let error: string | undefined;
    try {
      await execute(step, options.suite);
    } catch (cause) {
      error = (cause instanceof Error ? cause.message : String(cause)) || 'Unknown step failure';
      // The failing command's output is otherwise only in the JUnit report, so show it here too.
      report(`Gate step ${step} failed: ${error}`);
    }
    results.push({ step, seconds: (now() - started) / 1000, ...(error ? { error } : {}) });
    if (error && !options.keepGoing) break;
  }
  return results;
}

// A loaded machine can take tens of seconds to transform the first page, so each probe gets a
// generous timeout and the wait is bounded by a deadline rather than an attempt count.
const VITE_READY_DEADLINE_MS = 60_000;
const VITE_PROBE_TIMEOUT_MS = 10_000;
// Now and then a fresh Vite prints nothing and never listens, while the next start works at once.
// The cause was not found, so a silent start is stopped and replaced a bounded number of times.
const VITE_START_ATTEMPTS = 3;

async function waitForVite(baseUrl: string, child: ReturnType<typeof Bun.spawn>) {
  let lastError: unknown;
  const deadline = Date.now() + VITE_READY_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error(`Vite exited ${child.exitCode}`);
    try {
      const probe = await fetch(baseUrl, { signal: AbortSignal.timeout(VITE_PROBE_TIMEOUT_MS) });
      if (probe.ok) return;
    } catch (cause) {
      lastError = cause;
    }
    await Bun.sleep(250);
  }
  throw Error(`Vite did not become ready at ${baseUrl}`, { cause: lastError });
}

/** Copies only this suite's screenshots, preserving the suite error if copying fails. */
export async function collectScreenshots(directory: string, destination: string, report: (error: unknown) => void = console.error) {
  try {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.png')) {
        await copyFile(join(directory, entry.name), join(destination, entry.name));
      }
    }
  } catch (error) {
    report(error);
  }
}

/** Terminates the detached process group, including descendants surviving their parent. */
export async function stopVite(child: { pid: number; exited: Promise<number> }, kill: (pid: number, signal: NodeJS.Signals) => unknown = process.kill, grace = 5000) {
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  signalGroup('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, grace));
  signalGroup('SIGKILL');
  await child.exited;
}

const activeServers = new Set<() => Promise<void>>();

type ViteServer = { baseUrl: string; stop: () => Promise<void> };

async function startViteOnce(): Promise<ViteServer> {
  const port = freeLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = Bun.spawn(['bun', 'x', 'vite-plus', 'dev', '--host', '127.0.0.1', '--strictPort', '--port', String(port)], {
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    detached: true,
  });
  let stopping: Promise<void> | undefined;
  const stopGroup = () => (stopping ??= stopVite(child));
  activeServers.add(stopGroup);
  async function stop() {
    await stopGroup();
    activeServers.delete(stopGroup);
  }
  try {
    await waitForVite(baseUrl, child);
  } catch (error) {
    await stop();
    throw error;
  }
  return { baseUrl, stop };
}

async function startVite(): Promise<ViteServer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await startViteOnce();
    } catch (error) {
      if (attempt >= VITE_START_ATTEMPTS) throw error;
      console.error(`${(error as Error).message}; starting Vite again (attempt ${attempt + 1}).`);
    }
  }
}

function screenshotFolder(script: string) {
  return `out/ci/screenshots/${script.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

// Suites that serve the built frontend through their own API process build it themselves and need
// no Vite; every other suite runs against a Vite started for it alone.
async function browserCommand(args: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-screenshots-'));
  const selfServed = selfServedSuites.includes(args[2]);
  let server: ViteServer | undefined;
  try {
    if (!selfServed) server = await startVite();
    const env: Record<string, string | undefined> = {
      ...process.env,
      SW_SCREENSHOT_DIR: directory,
    };
    if (server) env.SW_BASE_URL = server.baseUrl;
    await command(args, env);
  } finally {
    await server?.stop();
    await collectScreenshots(directory, screenshotFolder(args[2]));
    await rm(directory, { recursive: true, force: true });
  }
}

async function executeStep(step: GateStep, suite?: string) {
  if (['image', 'container'].includes(step)) {
    chooseEngine(['docker', 'podman'].filter(name => Bun.which(name)));
  }
  for (const args of stepCommands(step, suite)) {
    if (step === 'browser' || step === 'mutation') await browserCommand(args);
    else await command(args);
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('ci:validate [--step <name>] [--suite <script>] [--keep-going]');
    console.log(`Steps: ${gateSteps.join(', ')}`);
    return;
  }
  const options = parseGateOptions(process.argv.slice(2));
  await mkdir('out/ci', { recursive: true });
  const results = await runGate(options, executeStep, Date.now);
  for (const result of results) {
    await writeFile(`out/ci/${result.step}.xml`, renderJUnit(result));
  }
  const summary = summarize(results);
  await writeFile('out/ci/summary.json', JSON.stringify(summary, null, 2) + '\n');
  if (summary.failed.length) throw Error(`Failed gate steps: ${summary.failed.join(', ')}`);
  console.log(`Gate passed in ${summary.seconds.toFixed(1)} seconds`);
}

if (import.meta.main) {
  await withCleanup(async () => {
    await Promise.all([...activeServers].map(stop => stop()));
  }, main).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

function command(args: string[], env = process.env) {
  return runCommand(args, false, env);
}
