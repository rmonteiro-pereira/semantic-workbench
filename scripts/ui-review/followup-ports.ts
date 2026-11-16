// Selects checked loopback ports for existing fixture factories. Imported by follow-up captures; no arguments or environment variables.
/** Checks availability before a fixture binds its assigned capture port. */
export function assertFreePort(port: number) {
  if (port < 5190 || port > 5199) throw new Error(`Capture port outside allowed range: ${port}`);
  const probe = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } });
  probe.stop(true);
}

/** Supplies a fixed port to a fixture factory that otherwise requests an ephemeral listener. */
export async function fixtureAtPort<T>(port: number, start: () => T | Promise<T>): Promise<T> {
  assertFreePort(port);
  const original = Bun.serve;
  // The existing factories expose no port option; only their listen address is adapted.
  Bun.serve = new Proxy(original, {
    apply(target, receiver, argumentsList) {
      const [options] = argumentsList;
      if (options.port !== 0) throw new Error('Expected a fixture requesting an ephemeral port');
      return Reflect.apply(target, receiver, [{ ...options, hostname: '127.0.0.1', port }]);
    },
  });
  try {
    return await start();
  } finally {
    Bun.serve = original;
  }
}
