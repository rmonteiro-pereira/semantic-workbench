// The capability file is created owner-only, re-read when it changes, rotated, compared without leaking and never mounted weakly.
import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalCapability, rotateCapability } from '../../src/server/mcp/local-capability';

function withDirectory<T>(use: (directory: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'capability-'));
  try {
    return use(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('first start creates a 43 character owner-only file and the capability matches', () => {
  withDirectory(directory => {
    const file = join(directory, 'state', 'mcp-capability');
    const opened = openLocalCapability(file);
    expect(opened.ok).toBe(true);
    const value = readFileSync(file, 'utf8').trim();
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    if (!opened.ok) return;
    expect(opened.capability.matches(value)).toBe(true);
    expect(opened.capability.matches(value + 'x')).toBe(false);
    expect(opened.capability.matches(null)).toBe(false);
  });
});

test('rotation invalidates the old value on the next check and an edited file is re-read', () => {
  withDirectory(directory => {
    const file = join(directory, 'mcp-capability');
    const opened = openLocalCapability(file);
    if (!opened.ok) throw new Error(opened.reason);
    const old = readFileSync(file, 'utf8').trim();
    expect(opened.capability.matches(old)).toBe(true);
    expect(rotateCapability(file)).toBeNull();
    const replacement = readFileSync(file, 'utf8').trim();
    expect(replacement).not.toBe(old);
    expect(opened.capability.matches(old)).toBe(false);
    expect(opened.capability.matches(replacement)).toBe(true);
    writeFileSync(file, 'hand-written-value\n', { mode: 0o600 });
    expect(opened.capability.matches('hand-written-value')).toBe(true);
  });
});

test('a file other users can read is tightened, and the endpoint is not mounted when the mode cannot be set', () => {
  if (process.platform === 'win32') return;
  withDirectory(directory => {
    const file = join(directory, 'mcp-capability');
    writeFileSync(file, 'some-value\n');
    chmodSync(file, 0o644);
    const opened = openLocalCapability(file);
    expect(opened.ok).toBe(true);
    expect(statSync(file).mode & 0o077).toBe(0);
    expect(openLocalCapability(join(directory, 'missing-folder', 'x'), 'linux').ok).toBe(true);
    // A platform that is neither POSIX nor able to run the access-list command refuses to mount.
    const original = process.env.USERNAME;
    delete process.env.USERNAME;
    try {
      const refused = openLocalCapability(join(directory, 'windows-style'), 'win32');
      expect(refused.ok).toBe(false);
    } finally {
      if (original !== undefined) process.env.USERNAME = original;
    }
  });
});
