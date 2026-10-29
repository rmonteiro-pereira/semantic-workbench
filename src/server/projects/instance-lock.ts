// Coordinates one workspace owner and revision hand-over without opening workspace services early.
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { atomicWriteJson, readJsonFile } from './atomic';

/** Persistent identity and lease of the workspace owner. */
export type InstanceRecord = {
  instance: string;
  host: string;
  pid: number;
  revision: string;
  heartbeat: string;
  state: 'serving';
};
/** Startup states exposed by readiness. */
export type InstanceState = 'starting' | 'refused' | 'handover' | 'serving';
/** File operations injected into the lease runner. */
export type LockFiles = {
  read(): InstanceRecord | null;
  claim(record: InstanceRecord): boolean;
  write(record: InstanceRecord): void;
  remove(): void;
};
/** Chooses the platform revision or the complete build identity. */
export function revisionIdentity(config: { revision: string | null; version: string | null; commit: string | null }): string {
  if (config.revision) return config.revision;
  if (config.version && config.commit) return `${config.version}+${config.commit}`;
  return 'dev';
}
/** Decides whether a lease can be acquired without performing I/O. */
export function lockDecision(current: InstanceRecord | null, now: number, ownRevision: string) {
  if (!current || now - Date.parse(current.heartbeat) > 30_000) return 'take';
  return current.revision === ownRevision ? 'refuse' : 'handover';
}

function readRecord(path: string): InstanceRecord | null {
  const value = readJsonFile<InstanceRecord>(path);
  if (value === null) return null;
  if (
    typeof value.instance !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.instance) ||
    typeof value.host !== 'string' ||
    !Number.isSafeInteger(value.pid) ||
    typeof value.revision !== 'string' ||
    value.state !== 'serving' ||
    typeof value.heartbeat !== 'string' ||
    !Number.isFinite(Date.parse(value.heartbeat))
  ) {
    throw new Error(`Invalid instance lock: ${path}`);
  }
  return value;
}

/** Uses a short exclusive directory claim to serialize competing atomic lease replacements. */
export function instanceLockFiles(path: string, now = Date.now): LockFiles {
  const guard = `${path}.claim`;
  return {
    read: () => readRecord(path),
    write: record => {
      atomicWriteJson(path, record);
    },
    remove: () => rmSync(path, { force: true }),
    claim(record) {
      mkdirSync(dirname(path), { recursive: true });
      try {
        mkdirSync(guard);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // A crashed claimant must not block all later starts forever.
        try {
          if (now() - statSync(guard).mtimeMs > 30_000) {
            const stale = `${guard}.stale-${randomUUID()}`;
            renameSync(guard, stale);
            rmSync(stale, { recursive: true });
          }
        } catch (error) {
          // Another claimant may remove the guard before it can be inspected or renamed.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        return false;
      }
      try {
        if (lockDecision(readRecord(path), now(), record.revision) !== 'take') return false;
        atomicWriteJson(path, record);
        return true;
      } finally {
        rmSync(guard, { recursive: true });
      }
    },
  };
}

/** Runs lease transitions; callers tick every ten seconds and close after workspace shutdown. */
export function createInstanceLock(options: { host: string; pid: number; revision: string; now(): number; files: LockFiles; open(): Promise<void>; log(message: string): void }) {
  const instance = randomUUID();
  let state: InstanceState = 'starting';
  let nextCheck = -Infinity;
  let owned = false;
  let stopped = false;
  let opening: Promise<void> | undefined;
  const ownRecord = (): InstanceRecord => ({
    instance,
    host: options.host,
    pid: options.pid,
    revision: options.revision,
    heartbeat: new Date(options.now()).toISOString(),
    state: 'serving',
  });
  const isOwner = (current: InstanceRecord | null) => current?.instance === instance;

  async function tick() {
    if (stopped || options.now() < nextCheck) return;
    nextCheck = options.now() + 9_000;
    const current = options.files.read();
    if (owned) {
      if (!isOwner(current)) throw new Error('Instance lock ownership was lost; stopping.');
      options.files.write(ownRecord());
      return;
    }
    const decision = lockDecision(current, options.now(), options.revision);
    if (decision !== 'take') {
      state = decision === 'refuse' ? 'refused' : 'handover';
      if (state === 'refused') options.log('Only one replica per data root is supported.');
      return;
    }
    if (!options.files.claim(ownRecord())) return;
    if (!isOwner(options.files.read())) return;
    owned = true;
    state = 'starting';
    opening = options.open();
    await opening;
    if (!stopped) state = 'serving';
  }
  async function close() {
    stopped = true;
    state = 'starting';
    try {
      await opening;
    } finally {
      if (owned && isOwner(options.files.read())) options.files.remove();
      owned = false;
    }
  }
  return {
    get state() {
      return state;
    },
    tick,
    close,
  };
}
