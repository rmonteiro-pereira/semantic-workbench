import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { bridgeCredentialPath, forgetServerCredentials, openServerCredentials } from '../../scripts/mcp-server-credentials';
import { privateWindowsAcl } from '../../scripts/mcp-credential-permissions';
import { deliver } from '../../scripts/mcp-stdio';
import { openConnectionServer } from '../helpers/connection-server';

test('server bridge exchanges setup once, refreshes and removes an ended connection from its private cache', async () => {
  const fixture = await openConnectionServer();
  const config = mkdtempSync(join(tmpdir(), 'bridge-config-'));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = config;
  try {
    const cookie = await fixture.signIn('alice');
    const fields = await fixture.consentFields(await fixture.get('/oauth/setup', { Cookie: cookie }));
    const setup = await fixture.postForm('/oauth/setup', { csrf: fields.csrf, pending: fields.pending, client: 'reference-client', scope: 'read' }, { Cookie: cookie });
    const credential = /swsetup_[A-Za-z0-9_-]+/.exec(await setup.text())![0];
    const send = ((url: string, options?: RequestInit) => fixture.handler(new Request(url, options))) as typeof fetch;
    const bridge = openServerCredentials(fixture.origin, 'reference-client', credential, send);
    const initial = await bridge.access();
    const path = bridgeCredentialPath(fixture.origin);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    const restored = openServerCredentials(fixture.origin, 'reference-client', undefined, send);
    expect((await restored.access()) === initial).toBe(true);
    const refreshed = await restored.access(initial);
    expect(refreshed !== initial).toBe(true);
    chmodSync(path, 0o640);
    expect(() => restored.access()).toThrow('accessible only to you');
    expect(() => openServerCredentials(fixture.origin, 'reference-client', undefined, send)).toThrow('accessible only to you');
    chmodSync(path, 0o600);
    chmodSync(dirname(path), 0o750);
    expect(() => restored.access()).toThrow('accessible only to you');
    expect(() => openServerCredentials(fixture.origin, 'reference-client', undefined, send)).toThrow('accessible only to you');
    chmodSync(dirname(path), 0o700);
    fixture.auth.connections.service.end(fixture.auth.connections.service.listAll()[0].id, 'revoked-by-person');
    const replies = await deliver(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), 0, () => '', send, 5000, restored);
    expect(JSON.parse(replies[0]).error.message).toContain('Connection ended');
    expect([credential, initial, refreshed].every(secret => !replies.join('').includes(secret))).toBe(true);
    expect(existsSync(path)).toBe(false);
    forgetServerCredentials(fixture.origin);
  } finally {
    fixture.close();
    rmSync(config, { recursive: true, force: true });
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
  }
}, 30000);

test('Windows permission verification fails closed and only changes a newly created directory', () => {
  const run = ((command: string[], options: { env: Record<string, string> }) => {
    expect(command[0]).toBe('powershell.exe');
    expect(options.env.SW_BRIDGE_ACL_PATH).toBe('a path with spaces');
    return { exitCode: options.env.SW_BRIDGE_ACL_CREATE === '1' ? 0 : 1 };
  }) as typeof Bun.spawnSync;
  expect(privateWindowsAcl('a path with spaces', true, run)).toBe(true);
  expect(privateWindowsAcl('a path with spaces', false, run)).toBe(false);
});
