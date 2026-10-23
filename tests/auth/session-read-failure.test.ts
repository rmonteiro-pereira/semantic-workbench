// A failure to read a session file is ours, not the record's: it must not delete the session.
import * as nodeFs from 'node:fs';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localPrincipal } from '../../server/auth/principal';
import { createSessionStore } from '../../server/auth/sessions';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

test('an I/O error while reading fails the read and keeps the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-eio-'));
  roots.push(dir);
  const key = new Uint8Array(32).fill(7);
  const session = await createSessionStore({ dir, key }).create({
    principal: localPrincipal(),
    tokens: { accessToken: 'secret', expiresAt: Date.now() + 100000 },
  });
  const read = spyOn(nodeFs, 'readFileSync').mockImplementation(() => {
    throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
  });
  try {
    const fresh = createSessionStore({ dir, key });
    await expect(fresh.get(session.id)).rejects.toThrow('EIO');
    expect(readdirSync(dir)).toHaveLength(1);
  } finally {
    read.mockRestore();
  }
  expect(existsSync(join(dir, readdirSync(dir)[0]))).toBe(true);
  const recovered = await createSessionStore({ dir, key }).get(session.id);
  expect(recovered?.tokens.accessToken).toBe('secret');
});
