import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { screenshotPath } from '../../scripts/helpers/screenshots';
import { describe, expect, test } from 'bun:test';
import {
  gateSteps,
  stopVite,
  collectScreenshots,
  parseGateOptions,
  renderJUnit,
  runGate,
  selectSteps,
  stepCommands,
  summarize,
} from '../../scripts/ci-validate';

describe('local quality gate', () => {
  test('selects in canonical order and rejects invalid selectors', () => {
    expect(selectSteps(['pipeline', 'verify', 'verify'])).toEqual(['verify', 'pipeline']);
    expect(selectSteps([])).toEqual([...gateSteps]);
    expect(() => selectSteps(['unknown'])).toThrow('Unknown gate step');
    expect(() => selectSteps(['image'], 'test:ui')).toThrow('--suite');
    expect(() => selectSteps([], 'test:auth:keycloak')).toThrow('Unknown gate suite');
    expect(
      parseGateOptions(['--', '--step', 'browser', '--suite', 'test:ui', '--keep-going']),
    ).toEqual({ steps: ['browser'], suite: 'test:ui', keepGoing: true });
  });
  test('commands cover verify, separate image steps and all dry-run kinds', () => {
    expect(stepCommands('verify')).toEqual([
      ['bun', 'run', 'check'],
      ['bun', 'test'],
      ['bun', 'run', 'build'],
    ]);
    expect(stepCommands('browser', 'test:ui')).toEqual([['bun', 'run', 'test:ui']]);
    expect(
      stepCommands('pipeline')
        .slice(1)
        .map(command => command.at(-1)),
    ).toEqual(['pr', 'main', 'tag:v0.4.0-alpha.1']);
    expect(stepCommands('container')[0]).toContain('--image');
  });
  test('failure names the step, stops by default and continues on request', async () => {
    const execute = async (step: string) => {
      if (step === 'verify') throw Error('broken <test> & "details"');
    };
    let clock = 0;
    const now = () => {
      clock += 1000;
      return clock;
    };
    const options = { steps: selectSteps(['verify', 'pipeline']), keepGoing: false };
    const quiet = () => {};
    const stopped = await runGate(options, execute, now, quiet);
    expect(stopped).toHaveLength(1);
    expect(summarize(stopped).failed).toEqual(['verify']);
    expect(renderJUnit(stopped[0])).toContain('&lt;test&gt; &amp; &quot;details&quot;');
    const continued = await runGate({ ...options, keepGoing: true }, execute, now, quiet);
    expect(continued).toHaveLength(2);
    expect(summarize(continued).seconds).toBe(2);
    expect(renderJUnit(continued[1])).toContain('failures="0"');
  });
});

test('a failed step is reported on the console with the command output', async () => {
  const execute = async () => {
    throw Error('bun run exited 1: TimeoutError: click');
  };
  const reported: string[] = [];
  const options = { steps: selectSteps(['browser']), keepGoing: false };
  await runGate(
    options,
    execute,
    () => 0,
    message => reported.push(message),
  );
  expect(reported).toEqual(['Gate step browser failed: bun run exited 1: TimeoutError: click']);
});

test('Vite stop signals its whole group and escalates after the grace period', async () => {
  const signals: [number, string][] = [];
  await stopVite(
    { pid: 123, exited: Promise.resolve(0) },
    (pid, signal) => signals.push([pid, signal]),
    1,
  );
  expect(signals).toEqual([
    [-123, 'SIGTERM'],
    [-123, 'SIGKILL'],
  ]);
  await expect(
    stopVite(
      { pid: 123, exited: Promise.resolve(0) },
      () => {
        throw Object.assign(Error('gone'), { code: 'ESRCH' });
      },
      1,
    ),
  ).resolves.toBeUndefined();
  await expect(
    stopVite(
      { pid: 123, exited: Promise.resolve(0) },
      () => {
        throw Object.assign(Error('denied'), { code: 'EPERM' });
      },
      1,
    ),
  ).rejects.toThrow('denied');
});

test('screenshots stay within their suite and copy errors preserve suite failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gate-artifacts-'));
  try {
    const suite = join(root, 'suite');
    const destination = join(root, 'artifacts');
    await mkdir(suite);
    await writeFile(join(root, 'unrelated.png'), 'unrelated');
    await writeFile(join(suite, 'screen.png'), 'suite');
    await writeFile(join(suite, 'notes.txt'), 'not a screenshot');
    await collectScreenshots(suite, destination);
    expect(await readdir(destination)).toEqual(['screen.png']);
    expect(await readFile(join(destination, 'screen.png'), 'utf8')).toBe('suite');
    const errors: unknown[] = [];
    const results = await runGate(
      { steps: ['browser'], keepGoing: false },
      async () => {
        try {
          throw Error('suite failed');
        } finally {
          await collectScreenshots(suite, join(suite, 'screen.png'), error => errors.push(error));
        }
      },
      () => 0,
      () => {},
    );
    expect(results[0].error).toBe('suite failed');
    expect(errors).toHaveLength(1);
    expect(screenshotPath('/tmp/default.png', suite)).toBe(join(suite, 'default.png'));
    expect(screenshotPath('/tmp/default.png', '')).toBe('/tmp/default.png');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  test(`gate cancellation cleans up Vite on ${signal}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'gate-signal-'));
    const preload = join(root, 'runtime.ts');
    await writeFile(
      preload,
      `
      import { appendFileSync } from 'node:fs';
      Bun.listen = () => ({ port: 1234, stop() {} });
      Bun.spawn = (_args, options) => {
        appendFileSync(${JSON.stringify(join(root, 'events'))},
          JSON.stringify({ detached: options.detached }) + '\\n');
        return { pid: 123, exitCode: null, exited: Promise.resolve(0) };
      };
      process.kill = (pid, signal) => {
        appendFileSync(${JSON.stringify(join(root, 'events'))},
          JSON.stringify({ pid, signal }) + '\\n');
        return true;
      };
      globalThis.fetch = () => {
        console.log('ready');
        return new Promise(() => {});
      };
      const timer = globalThis.setTimeout;
      globalThis.setTimeout = (callback, delay) => timer(callback, Math.min(delay, 10));
      setInterval(() => {}, 1000);
    `,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        preload,
        'scripts/ci-validate.ts',
        '--step',
        'browser',
        '--suite',
        'test:ui',
      ],
      { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, TMPDIR: root } },
    );
    try {
      const reader = child.stdout.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('ready');
      reader.releaseLock();
      child.kill(signal);
      expect(await child.exited).toBe(exitCode);
      const events = (await readFile(join(root, 'events'), 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      expect(events).toEqual([
        { detached: true },
        { pid: -123, signal: 'SIGTERM' },
        { pid: -123, signal: 'SIGKILL' },
      ]);
    } finally {
      child.kill();
      await child.exited;
      await rm(root, { recursive: true, force: true });
    }
  });
}
