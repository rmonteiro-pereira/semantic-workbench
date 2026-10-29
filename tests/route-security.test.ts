// Tests path containment, request validation and safe Git invocation.
import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnv, redactCredentials } from '../src/server/projects/git';
import { loopbackHost } from '../src/server/handler';
import { testWorkspace } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../src/server/projects/reader';
// Checks symbolic links, DNS rebinding, Git option injection, transport helpers, environment
// isolation and credential redaction.
const api = (workspace: { handler: (request: Request) => Promise<Response> }, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  workspace.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const ontology = 'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n';
async function project() {
  const workspace = await testWorkspace();
  const response = await api(workspace, 'POST', '/api/import', {
    files: [{ path: 'shop.yaml', source: ontology }],
  });
  expect(response.status).toBe(200);
  return workspace;
}
test('symbolic links inside a project are never followed for reads or writes', async () => {
  const workspace = await project();
  const outside = mkdtempSync(join(tmpdir(), 'workbench-outside-'));
  try {
    const dir = join(workspace.root, 'projects/shop');
    writeFileSync(join(outside, 'secret.yaml'), ontology.replace('Shop', 'Secret'));
    symlinkSync(outside, join(dir, 'linked'));
    symlinkSync(join(outside, 'secret.yaml'), join(dir, 'secret.yaml'));
    for (const path of ['linked/secret.yaml', 'secret.yaml']) {
      const read = await api(workspace, 'GET', '/api/projects/shop/files/' + path);
      expect(read.status).toBe(400);
      expect((await read.json()).error).toContain('Symbolic links');
    }
    const write = await api(workspace, 'PUT', '/api/projects/shop/files/linked/new.yaml', {
      baseHash: null,
      source: ontology,
    });
    expect(write.status).toBe(400);
    expect(existsSync(join(outside, 'new.yaml'))).toBe(false);
    const over = await api(workspace, 'PUT', '/api/projects/shop/files/secret.yaml', {
      baseHash: null,
      source: ontology,
    });
    expect(over.status).toBe(400);
    expect(readFileSync(join(outside, 'secret.yaml'), 'utf8')).toContain('Secret');
    const diff = await api(workspace, 'GET', '/api/projects/shop/git/diff?path=secret.yaml&from=HEAD&to=worktree');
    expect(diff.status).toBe(400);
    // The scanner lists real files only.
    const files = (await (await api(workspace, 'GET', '/api/projects')).json())[0].files.map((f: any) => f.path);
    expect(files).toEqual(['shop.yaml']);
  } finally {
    workspace.dispose();
    rmSync(outside, { recursive: true, force: true });
  }
});
test('only loopback host names are served (DNS rebinding)', async () => {
  const workspace = await project();
  try {
    expect(
      (
        await api(workspace, 'GET', '/api/projects/shop/files/shop.yaml', undefined, {
          host: 'attacker.example:4310',
        })
      ).status,
    ).toBe(403);
    for (const host of ['127.0.0.1:4310', 'localhost:5173', '[::1]:4310', '127.0.0.1:61234'])
      expect((await api(workspace, 'GET', '/api/projects/shop/files/shop.yaml', undefined, { host })).status).toBe(200);
    expect(loopbackHost(null)).toBe(true);
    expect(loopbackHost('127.0.0.1.attacker.example')).toBe(false);
    expect(loopbackHost('LOCALHOST')).toBe(true);
  } finally {
    workspace.dispose();
  }
});
test('a branch name cannot smuggle an option, and transport helpers are refused as remotes', async () => {
  const workspace = await project();
  try {
    for (const branch of [' --detach', ' --orphan=x', '-x', '\t-c']) expect((await api(workspace, 'POST', '/api/projects/shop/git/switch', { branch })).status).toBe(400);
    const status = await (await api(workspace, 'GET', '/api/projects/shop/git/status')).json();
    expect(status.branch).toBe('main');
    const marker = join(workspace.root, 'ext-ran');
    for (const url of [`ext::sh -c touch% ${marker}`, 'fd::17', 'EXT::x']) expect((await api(workspace, 'PUT', '/api/projects/shop/git/remote', { name: 'origin', url })).status).toBe(400);
    expect(existsSync(marker)).toBe(false);
    // Plain URLs and local paths stay accepted (tests and owners use local bare remotes).
    const bare = join(workspace.root, 'remote.git');
    mkdirSync(bare);
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/git/remote', {
          name: 'origin',
          url: bare,
        })
      ).status,
    ).toBe(200);
  } finally {
    workspace.dispose();
  }
});
test('credentials in remote URLs are redacted from status and Git messages', async () => {
  expect(redactCredentials('fatal: unable to access https://user:tok3n@example.com/r.git/')).toBe('fatal: unable to access https://***@example.com/r.git/');
  expect(redactCredentials('ssh://git@example.com/x and git@example.com:x')).toBe('ssh://***@example.com/x and git@example.com:x');
  const workspace = await project();
  try {
    expect(
      (
        await api(workspace, 'PUT', '/api/projects/shop/git/remote', {
          name: 'origin',
          url: 'https://user:tok3n@example.invalid/r.git',
        })
      ).status,
    ).toBe(200);
    const status = await (await api(workspace, 'GET', '/api/projects/shop/git/status')).json();
    expect(status.remotes.origin).toBe('https://***@example.invalid/r.git');
    expect(JSON.stringify(status)).not.toContain('tok3n');
  } finally {
    workspace.dispose();
  }
});
test('Git runs without configuration or helper programs injected through the environment', () => {
  const env = gitEnv({
    PATH: '/usr/bin',
    GIT_CONFIG_PARAMETERS: "'core.hooksPath'='/tmp'",
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.pager',
    GIT_CONFIG_VALUE_0: 'sh',
    GIT_EXEC_PATH: '/tmp',
    GIT_DIR: '/tmp',
    HOME: '/home/x',
  });
  expect(Object.keys(env).sort()).toEqual(['GIT_TERMINAL_PROMPT', 'HOME', 'LC_ALL', 'PATH']);
});
test('a malformed trash restore body is refused instead of restoring to the original place', async () => {
  const workspace = await project();
  try {
    const { entryId: id } = await workspace.ws.trash.deleteFile('shop', 'shop.yaml', undefined, LOCAL_READER);
    const bad = await workspace.handler(
      new Request(`http://127.0.0.1:4310/api/trash/${id}/restore`, {
        method: 'POST',
        body: '{not json',
      }),
    );
    expect(bad.status).toBe(400);
    expect(existsSync(join(workspace.root, 'projects/shop/shop.yaml'))).toBe(false);
    const ok = await workspace.handler(new Request(`http://127.0.0.1:4310/api/trash/${id}/restore`, { method: 'POST' }));
    expect(ok.status).toBe(200);
    expect(existsSync(join(workspace.root, 'projects/shop/shop.yaml'))).toBe(true);
  } finally {
    workspace.dispose();
  }
});
