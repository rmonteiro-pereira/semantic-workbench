// The per-installation secret that lets a program on this machine use the endpoint. It lives in one file only the current user can read, is re-read when the file changes, and is never logged or echoed.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname } from 'node:path';

/** The capability file's name under the data root's state folder. */
export const CAPABILITY_FILE = 'mcp-capability';

export type LocalCapability = {
  /** Whether a presented value equals the current capability, compared in constant time. */
  matches(value: string | null): boolean;
};

export type CapabilityOpening = { ok: true; capability: LocalCapability } | { ok: false; reason: string };

type Platform = NodeJS.Platform;

/** Reduces a Windows file's access list to the current user. The command takes an argument list and no shell. */
function restrictWindowsAccess(file: string): boolean {
  const user = process.env.USERNAME;
  if (!user) return false;
  const result = Bun.spawnSync(['icacls', file, '/inheritance:r', '/grant:r', `${user}:F`]);
  return result.exitCode === 0;
}

/** Makes the file readable by its owner only, or says why that is not possible. */
function secureFile(file: string, platform: Platform): string | null {
  if (platform === 'win32') return restrictWindowsAccess(file) ? null : 'The access list of the capability file could not be restricted to the current user.';
  try {
    chmodSync(file, 0o600);
    return (statSync(file).mode & 0o077) === 0 ? null : 'The capability file is readable by other users and its mode could not be changed.';
  } catch {
    return 'The mode of the capability file could not be set to owner-only.';
  }
}

/** Writes a new random capability through a temporary file so a reader never sees half of it. */
function writeCapability(file: string, platform: Platform): string | null {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
  const refusal = secureFile(temporary, platform);
  if (refusal) return refusal;
  renameSync(temporary, file);
  return null;
}

/** Creates a fresh capability, invalidating the previous one on the next request. */
export function rotateCapability(file: string, platform: Platform = process.platform): string | null {
  return writeCapability(file, platform);
}

function hashOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Opens the capability file, creating it on first use. When owner-only access cannot be set the
 * endpoint must not be mounted, so the answer says why instead of returning a weaker capability.
 */
export function openLocalCapability(file: string, platform: Platform = process.platform): CapabilityOpening {
  if (!existsSync(file)) {
    const refusal = writeCapability(file, platform);
    if (refusal) return { ok: false, reason: refusal };
  }
  const refusal = secureFile(file, platform);
  if (refusal) return { ok: false, reason: refusal };
  let modifiedAt = '';
  let current = hashOf('');
  function load() {
    // A replaced file has a new inode even when its modification time repeats.
    const info = statSync(file);
    const stamp = `${info.ino}:${info.mtimeMs}:${info.size}`;
    if (stamp === modifiedAt) return;
    modifiedAt = stamp;
    current = hashOf(readFileSync(file, 'utf8').trim());
  }
  return {
    ok: true,
    capability: {
      matches(value) {
        if (value === null) return false;
        try {
          load();
        } catch {
          return false;
        }
        return timingSafeEqual(hashOf(value), current);
      },
    },
  };
}
