// Exercises lock transitions with an in-memory filesystem and a controlled clock.
import { expect, test } from 'bun:test';
import { createInstanceLock, lockDecision, revisionIdentity } from '../../src/server/projects/instance-lock';
import type { InstanceRecord } from '../../src/server/projects/instance-lock';

const record = (revision = 'old', heartbeat = 0): InstanceRecord => ({
  instance: crypto.randomUUID(),
  host: 'other',
  pid: 2,
  revision,
  heartbeat: new Date(heartbeat).toISOString(),
  state: 'serving',
});

test('revision identity prefers the platform, then complete build metadata', () => {
  expect(revisionIdentity({ revision: 'platform', version: '1', commit: 'abc' })).toBe('platform');
  expect(revisionIdentity({ revision: null, version: '1', commit: 'abc' })).toBe('1+abc');
  expect(revisionIdentity({ revision: null, version: '1', commit: null })).toBe('dev');
});

test('only absent or older-than-thirty-second records can be taken', () => {
  expect(lockDecision(null, 0, 'new')).toBe('take');
  expect(lockDecision(record(), 30_000, 'old')).toBe('refuse');
  expect(lockDecision(record(), 30_001, 'old')).toBe('take');
  expect(lockDecision(record(), 0, 'new')).toBe('handover');
});

for (const revision of ['old', 'new']) {
  test(`${revision} waits without writes or recovery and takes over after release`, async () => {
    let current: InstanceRecord | null = record();
    let now = 0;
    let opens = 0;
    let writes = 0;
    const lock = createInstanceLock({
      host: 'mine',
      pid: 1,
      revision,
      now: () => now,
      files: {
        read: () => current,
        claim: value => {
          current = value;
          writes++;
          return true;
        },
        write: value => {
          current = value;
          writes++;
        },
        remove: () => {
          current = null;
        },
      },
      open: async () => {
        opens++;
      },
      log: () => {},
    });
    await lock.tick();
    expect(lock.state).toBe(revision === 'old' ? 'refused' : 'handover');
    expect(opens).toBe(0);
    expect(writes).toBe(0);
    current = null;
    now = 8_999;
    await lock.tick();
    expect(opens).toBe(0);
    now = 10_000;
    await lock.tick();
    expect(opens).toBe(1);
    expect(lock.state).toBe('serving');
    now = 20_000;
    await lock.tick();
    expect(current!.heartbeat).toBe(new Date(now).toISOString());
    await lock.close();
    expect(current).toBeNull();
  });
}

test('readiness stays starting until recovery and first scan finish', async () => {
  let finish!: () => void;
  let current: InstanceRecord | null = null;
  const lock = createInstanceLock({
    host: 'mine',
    pid: 1,
    revision: 'new',
    now: () => 0,
    files: {
      read: () => current,
      claim: value => {
        current = value;
        return true;
      },
      write: value => {
        current = value;
      },
      remove: () => {
        current = null;
      },
    },
    open: () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    log: () => {},
  });
  const opening = lock.tick();
  expect(current).not.toBeNull();
  expect(lock.state).toBe('starting');
  finish();
  await opening;
  expect(lock.state).toBe('serving');
  await lock.close();
});

test('a waiting revision takes over a stale holder and heartbeats during slow recovery', async () => {
  let current: InstanceRecord | null = record();
  let now = 0;
  let finish!: () => void;
  const lock = createInstanceLock({
    host: 'mine',
    pid: 1,
    revision: 'new',
    now: () => now,
    files: {
      read: () => current,
      claim: value => {
        current = value;
        return true;
      },
      write: value => {
        current = value;
      },
      remove: () => {
        current = null;
      },
    },
    open: () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    log: () => {},
  });
  await lock.tick();
  now = 30_001;
  const opening = lock.tick();
  expect(current!.host).toBe('mine');
  expect(lock.state).toBe('starting');
  now = 40_001;
  await lock.tick();
  expect(current!.heartbeat).toBe(new Date(now).toISOString());
  finish();
  await opening;
  await lock.close();
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`${signal} releases the on-disk lock before exiting`, async () => {
    const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(join(tmpdir(), 'workbench-signal-'));
    const path = join(root, 'state/instance.lock');
    const source = `
      import { createInstanceLock, instanceLockFiles } from ${JSON.stringify(resolve('src/server/projects/instance-lock.ts'))};
      import { installShutdownHandlers } from ${JSON.stringify(resolve('src/server/shutdown.ts'))};
      const lock = createInstanceLock({
        host: 'test', pid: process.pid, revision: 'dev', now: Date.now,
        files: instanceLockFiles(process.env.TEST_LOCK), open: async () => {}, log: () => {},
      });
      installShutdownHandlers(() => lock.close());
      await lock.tick();
      console.log('ready');
      setInterval(() => {}, 10000);
    `;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, TEST_LOCK: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      const reader = child.stdout.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('ready');
      reader.releaseLock();
      expect(existsSync(path)).toBe(true);
      child.kill(signal);
      expect(await child.exited).toBe(0);
      expect(existsSync(path)).toBe(false);
    } finally {
      child.kill();
      await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('disk acquisition rechecks the lease and never overwrites a fresh claimant', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { instanceLockFiles } = await import('../../src/server/projects/instance-lock');
  const root = mkdtempSync(join(tmpdir(), 'workbench-claim-'));
  const path = join(root, 'state/instance.lock');
  let now = 0;
  try {
    const first = instanceLockFiles(path, () => now);
    const second = instanceLockFiles(path, () => now);
    expect(first.claim(record())).toBe(true);
    expect(second.claim(record('new'))).toBe(false);
    expect(first.read()!.revision).toBe('old');
    now = 30_001;
    expect(second.claim(record('new', now))).toBe(true);
    expect(first.read()!.revision).toBe('new');
    writeFileSync(path, JSON.stringify({ heartbeat: 'invalid' }));
    expect(() => first.read()).toThrow('Invalid instance lock');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('container identities differ and a stale former owner detects takeover', async () => {
  let current: InstanceRecord | null = null;
  let now = 0;
  const files = {
    read: () => current,
    claim: (value: InstanceRecord) => {
      current = value;
      return true;
    },
    write: (value: InstanceRecord) => {
      current = value;
    },
    remove: () => {
      current = null;
    },
  };
  const options = {
    host: 'shared-host',
    pid: 1,
    revision: 'same',
    now: () => now,
    files,
    open: async () => {},
    log: () => {},
  };
  const first = createInstanceLock(options);
  const second = createInstanceLock(options);
  await first.tick();
  const firstIdentity = current!.instance;
  now = 30_001;
  await second.tick();
  expect(current!.instance).not.toBe(firstIdentity);
  expect(current!.host).toBe(options.host);
  expect(current!.pid).toBe(options.pid);
  expect(current!.revision).toBe(options.revision);
  await expect(first.tick()).rejects.toThrow('ownership was lost');
  await first.close();
  expect(current).not.toBeNull();
  await second.close();
});

test('a replaced claim is fenced before workspace initialization', async () => {
  let current: InstanceRecord | null = null;
  let opens = 0;
  const lock = createInstanceLock({
    host: 'mine',
    pid: 1,
    revision: 'same',
    now: () => 0,
    files: {
      read: () => current,
      claim: value => {
        current = { ...value, instance: crypto.randomUUID() };
        return true;
      },
      write: () => {
        throw new Error('Unexpected write');
      },
      remove: () => {
        throw new Error('Must not remove another owner');
      },
    },
    open: async () => {
      opens++;
    },
    log: () => {},
  });
  await lock.tick();
  expect(opens).toBe(0);
  expect(lock.state).toBe('starting');
  await lock.close();
});

test('a timer firing at 9.99 seconds refreshes the heartbeat', async () => {
  let current: InstanceRecord | null = null;
  let now = 0;
  const lock = createInstanceLock({
    host: 'mine',
    pid: 1,
    revision: 'same',
    now: () => now,
    files: {
      read: () => current,
      claim: value => {
        current = value;
        return true;
      },
      write: value => {
        current = value;
      },
      remove: () => {
        current = null;
      },
    },
    open: async () => {},
    log: () => {},
  });
  await lock.tick();
  now = 9_990;
  await lock.tick();
  expect(current!.heartbeat).toBe(new Date(now).toISOString());
  await lock.close();
});

test('only one competing stale breaker renames the guard and both defer acquisition', async () => {
  const fs = await import('node:fs');
  const { spyOn } = await import('bun:test');
  const { instanceLockFiles } = await import('../../src/server/projects/instance-lock');
  const root = fs.mkdtempSync('/tmp/workbench-stale-');
  const path = `${root}/instance.lock`;
  const guard = `${path}.claim`;
  fs.mkdirSync(guard);
  fs.utimesSync(guard, new Date(0), new Date(0));
  const first = instanceLockFiles(path, () => 40_000);
  const second = instanceLockFiles(path, () => 40_000);
  const originalStat = fs.statSync;
  const originalRename = fs.renameSync;
  let breaks = 0;
  let competing = false;
  const rename = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    originalRename(from, to);
    breaks++;
  });
  const stat = spyOn(fs, 'statSync').mockImplementation(((target: string) => {
    const observed = originalStat(target);
    // Both breakers observe the abandoned guard before the first rename completes.
    if (!competing) {
      competing = true;
      expect(second.claim(record('new', 40_000))).toBe(false);
    }
    return observed;
  }) as typeof fs.statSync);
  try {
    expect(first.claim(record('new', 40_000))).toBe(false);
    expect(breaks).toBe(1);
    expect(fs.readdirSync(root)).toEqual([]);
  } finally {
    stat.mockRestore();
    rename.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('on-disk identities must contain a valid instance nonce', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { instanceLockFiles } = await import('../../src/server/projects/instance-lock');
  const root = mkdtempSync('/tmp/workbench-nonce-');
  const path = `${root}/instance.lock`;
  try {
    for (const instance of [undefined, '', 1, 'not-a-uuid']) {
      writeFileSync(path, JSON.stringify({ ...record(), instance }));
      expect(() => instanceLockFiles(path).read()).toThrow('Invalid instance lock');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
