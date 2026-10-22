// Verifies process lifecycle helpers without network or browser services.
import { expect, spyOn, test } from 'bun:test';
import {
  freeLoopbackPort,
  waitReady,
  readyState,
  waitUntil,
  isConnectionRetry,
  runCommand,
  withCleanup,
} from '../../scripts/helpers/processes';

test('readiness distinguishes handover, refusal and serving', () => {
  expect(readyState(200, { state: 'handover' }, 'serving')).toBe(false);
  expect(readyState(503, { state: 'refused' }, 'refused', 503)).toBe(true);
  expect(readyState(200, { state: 'serving' }, 'serving')).toBe(true);
  expect(readyState(200, null, 'serving')).toBe(false);
});

test('waits succeed, time out and propagate failures without real time or sockets', async () => {
  let now = 0;
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
  await waitUntil('ready', async () => now >= 200, 300, clock);
  expect(now).toBe(200);
  await expect(waitUntil('realm', async () => false, 100, clock)).rejects.toThrow('realm');
  await expect(
    waitUntil(
      'parse',
      async () => {
        throw Error('invalid JSON');
      },
      100,
      clock,
    ),
  ).rejects.toThrow('invalid JSON');
});

test('only connection failures are retried', () => {
  expect(isConnectionRetry(Object.assign(new Error(), { code: 'ECONNREFUSED' }))).toBe(true);
  expect(isConnectionRetry(new SyntaxError('invalid JSON'))).toBe(false);
  expect(isConnectionRetry(new TypeError('programming error'))).toBe(false);
});

test('commands capture stdout and report failures', async () => {
  expect(await runCommand([process.execPath, '-e', "console.log('captured')"], true)).toBe(
    'captured',
  );
  await expect(runCommand([process.execPath, '-e', 'process.exit(7)'])).rejects.toThrow('exited 7');
});

test('cleanup runs once on success and failure and removes signal listeners', async () => {
  const before = process.listenerCount('SIGTERM');
  let cleaned = 0;
  const clean = async () => {
    cleaned++;
  };
  expect(await withCleanup(clean, async () => 42)).toBe(42);
  expect(cleaned).toBe(1);
  await expect(
    withCleanup(clean, async () => {
      throw new Error('body failed');
    }),
  ).rejects.toThrow('body failed');
  expect(cleaned).toBe(2);
  expect(process.listenerCount('SIGTERM')).toBe(before);
});

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  test(`cleanup runs once on ${signal} with exit code ${exitCode}`, async () => {
    const modulePath = new URL('../../scripts/helpers/processes.ts', import.meta.url).pathname;
    const source = `
      import { withCleanup } from ${JSON.stringify(modulePath)};
      await withCleanup(async () => {
        console.log('cleaned');
        await Bun.sleep(10);
      }, async () => {
        process.emit(${JSON.stringify(signal)}, ${JSON.stringify(signal)});
        await Bun.sleep(1);
      });
    `;
    const child = Bun.spawn([process.execPath, '-e', source], { stdout: 'pipe', stderr: 'pipe' });
    expect(await child.exited).toBe(exitCode);
    expect((await new Response(child.stdout).text()).trim()).toBe('cleaned');
    expect(await new Response(child.stderr).text()).toBe('');
  });
}

test('port allocation excludes reserved ports and closes each probe', () => {
  const ports = [5173, 5180, 50000];
  let closed = 0;
  const listen = spyOn(Bun, 'listen').mockImplementation((() => ({
    port: ports.shift(),
    stop() {
      closed++;
    },
  })) as unknown as typeof Bun.listen);
  try {
    expect(freeLoopbackPort([5173, 5180])).toBe(50000);
    expect(closed).toBe(3);
  } finally {
    listen.mockRestore();
  }
});

test('readiness accepts the requested state and propagates malformed bodies', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown) =>
    Response.json(
      { state: 'refused' },
      {
        status: 503,
      },
    )) as typeof fetch;
  try {
    await waitReady('http://fixture.invalid', 'refused', 503);
    globalThis.fetch = (async (_input: unknown) => new Response('{invalid')) as typeof fetch;
    await expect(waitReady('http://fixture.invalid')).rejects.toThrow();
  } finally {
    globalThis.fetch = original;
  }
});
