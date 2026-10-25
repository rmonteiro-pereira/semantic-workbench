import { expect, test } from 'bun:test';

const entrypoints = ['index.js', 'index.mjs'];
type ObservedNode = { getAttribute: (name: string) => string | null };
type Delivery = { target: ObservedNode };

async function patchedHook(entrypoint: string, signature: string) {
  const source = await Bun.file(`node_modules/@xyflow/react/dist/esm/${entrypoint}`).text();
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

async function observerHarness(entrypoint: string) {
  const hookSource = await patchedHook(entrypoint, 'function useResizeObserver() {');
  const frames = new Map<number, () => void>();
  const updates: Map<string, { nodeElement: ObservedNode }>[] = [];
  let nextFrame = 0;
  let deliver: (entries: Delivery[]) => void = () => {};
  let cleanup: () => void = () => {};
  let disconnected = false;
  class Observer {
    constructor(callback: (entries: Delivery[]) => void) {
      deliver = callback;
    }
    disconnect() {
      disconnected = true;
    }
  }
  const instantiate = new Function(
    'useStore',
    'selector$b',
    'useRef',
    'useState',
    'useEffect',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    `return (${hookSource})();`,
  );
  instantiate(
    () => (batch: Map<string, { nodeElement: ObservedNode }>) => updates.push(batch),
    null,
    (initial: unknown) => ({ current: initial }),
    (initialize: () => unknown) => [initialize()],
    (effect: () => () => void) => {
      cleanup = effect();
    },
    Observer,
    (callback: () => void) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    (frame: number) => frames.delete(frame),
  );
  return {
    deliver: (entries: Delivery[]) => deliver(entries),
    updates,
    frames,
    cleanup: () => cleanup(),
    disconnected: () => disconnected,
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

function node(id: string): ObservedNode {
  return { getAttribute: name => (name === 'data-id' ? id : null) };
}

test.each(entrypoints)('%s batches measurements outside observer delivery', async entrypoint => {
  const harness = await observerHarness(entrypoint);
  const first = node('orders');
  const latest = node('orders');
  const other = node('customers');
  try {
    harness.deliver([{ target: first }]);
    harness.deliver([{ target: latest }, { target: other }]);
    expect(harness.updates).toHaveLength(0);
    expect(harness.frames.size).toBe(1);
    harness.flush();
    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].get('orders')?.nodeElement).toBe(latest);
    expect([...harness.updates[0].keys()]).toEqual(['orders', 'customers']);
  } finally {
    harness.cleanup();
  }
});

test.each(entrypoints)('%s cancels pending measurement work on unmount', async entrypoint => {
  const harness = await observerHarness(entrypoint);
  harness.deliver([{ target: node('orders') }]);
  harness.cleanup();
  expect(harness.disconnected()).toBe(true);
  expect(harness.frames.size).toBe(0);
  harness.flush();
  expect(harness.updates).toHaveLength(0);
});

test.each(entrypoints)('%s does not retain nodes from an earlier batch', async entrypoint => {
  const harness = await observerHarness(entrypoint);
  try {
    harness.deliver([{ target: node('orders') }]);
    harness.flush();
    harness.deliver([{ target: node('customers') }]);
    harness.flush();
    expect([...harness.updates[1].keys()]).toEqual(['customers']);
  } finally {
    harness.cleanup();
  }
});

type Pane = { width: number; height: number; checkVisibility: () => boolean };

async function paneHarness(entrypoint: string) {
  const source = await patchedHook(entrypoint, 'function useResizeHandler(domNode) {');
  const reference: { current: Pane | null } = {
    current: { width: 800, height: 600, checkVisibility: () => true },
  };
  const frames = new Map<number, () => void>();
  const listeners = new Map<string, () => void>();
  const updates: { width: number; height: number }[] = [];
  let nextFrame = 0;
  let deliver = () => {};
  let cleanup = () => {};
  let disconnected = false;
  class Observer {
    constructor(callback: () => void) {
      deliver = callback;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }
  const store = {
    setState: (size: { width: number; height: number }) => updates.push(size),
    getState: () => ({ onError: () => {} }),
  };
  const instantiate = new Function(
    'useStoreApi',
    'useEffect',
    'getDimensions',
    'window',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'errorMessages',
    'reference',
    `return (${source})(reference);`,
  );
  instantiate(
    () => store,
    (effect: () => () => void) => {
      cleanup = effect();
    },
    (pane: Pane) => ({ width: pane.width, height: pane.height }),
    {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    Observer,
    (callback: () => void) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    (frame: number) => frames.delete(frame),
    {},
    reference,
  );
  return {
    reference,
    frames,
    listeners,
    updates,
    deliver: () => deliver(),
    cleanup: () => cleanup(),
    disconnected: () => disconnected,
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

test.each(entrypoints)(
  '%s defers pane observer updates and keeps the latest size',
  async entrypoint => {
    const harness = await paneHarness(entrypoint);
    try {
      expect(harness.updates).toEqual([{ width: 800, height: 600 }]);
      harness.reference.current!.width = 900;
      harness.deliver();
      harness.reference.current!.width = 1000;
      harness.deliver();
      expect(harness.updates).toHaveLength(1);
      expect(harness.frames.size).toBe(1);
      harness.flush();
      expect(harness.updates.at(-1)).toEqual({ width: 1000, height: 600 });
    } finally {
      harness.cleanup();
    }
  },
);

test.each(entrypoints)(
  '%s cancels pane work even after its DOM ref is cleared',
  async entrypoint => {
    const harness = await paneHarness(entrypoint);
    harness.deliver();
    harness.reference.current = null;
    harness.cleanup();
    expect(harness.disconnected()).toBe(true);
    expect(harness.listeners.size).toBe(0);
    expect(harness.frames.size).toBe(0);
    harness.flush();
    expect(harness.updates).toHaveLength(1);
  },
);

test.each(entrypoints)('%s keeps window resize measurements synchronous', async entrypoint => {
  const harness = await paneHarness(entrypoint);
  try {
    harness.reference.current!.width = 900;
    harness.listeners.get('resize')!();
    expect(harness.updates.at(-1)).toEqual({ width: 900, height: 600 });
    expect(harness.frames.size).toBe(0);
  } finally {
    harness.cleanup();
  }
});
