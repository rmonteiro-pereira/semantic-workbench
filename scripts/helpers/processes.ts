// Owns disposable command execution, readiness polling and signal cleanup.
/** Runs a command, optionally capturing stdout without printing its arguments or secrets. */
export async function runCommand(
  args: string[],
  capture = false,
  env = process.env,
): Promise<string> {
  const child = Bun.spawn(args, { env, stdout: capture ? 'pipe' : 'inherit', stderr: 'pipe' });
  const [output, error, code] = await Promise.all([
    capture ? new Response(child.stdout).text() : Promise.resolve(''),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${args[0]} ${args[1]} exited ${code}: ${error}`);
  if (error) process.stderr.write(error);
  return output.trim();
}

/** Allocates a loopback port outside the caller's reserved set. */
export function freeLoopbackPort(excluded: readonly number[] = []): number {
  for (;;) {
    const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
    const port = listener.port;
    listener.stop(true);
    if (!excluded.includes(port)) return port;
  }
}

/** Retries transport availability failures without hiding parsing or application errors. */
export function isConnectionRetry(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code ?? (error as Error).name;
  return ['ConnectionRefused', 'ECONNREFUSED', 'TimeoutError', 'ECONNRESET'].includes(code);
}

/** Recognizes a ready response without accepting handover as serving. */
export function readyState(status: number, body: unknown, state: string, expected = 200) {
  return (
    status === expected &&
    typeof body === 'object' &&
    body !== null &&
    'state' in body &&
    body.state === state
  );
}

/** Polls a condition with a bounded deadline and injectable clock for offline tests. */
export async function waitUntil(
  label: string,
  probe: () => Promise<boolean>,
  timeout = 30_000,
  clock = { now: Date.now, sleep: (ms: number) => Bun.sleep(ms) },
) {
  const deadline = clock.now() + timeout;
  while (clock.now() < deadline) {
    if (await probe()) return;
    await clock.sleep(100);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeout} ms`);
}

/** Waits for an API lease state with a bounded deadline. */
export async function waitReady(url: string, state = 'serving', status = 200, timeout = 30_000) {
  await waitUntil(
    `${url} ${state}`,
    async () => {
      try {
        const response = await fetch(`${url}/readyz`, { signal: AbortSignal.timeout(1000) });
        return readyState(response.status, await response.json(), state, status);
      } catch (error) {
        if (!isConnectionRetry(error)) throw error;
        return false;
      }
    },
    timeout,
  );
}

/** Cleans once on completion, failure or termination and restores the caller's signal handlers. */
export async function withCleanup<T>(
  clean: () => Promise<void>,
  body: () => Promise<T>,
): Promise<T> {
  let cleaning: Promise<void> | undefined;
  const cleanOnce = () => (cleaning ??= Promise.resolve().then(clean));
  const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
    void cleanOnce()
      .catch(error => console.error(error))
      .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await body();
  } finally {
    try {
      await cleanOnce();
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  }
}
