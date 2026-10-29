// Tests the per-repository Git identity: reading it, setting it from the app, and seeing it live.
import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok, ontology, sh } from './helpers/scm';
import { LOCAL_READER } from '../src/server/projects/reader';

const isolatedGlobal = process.env.GIT_CONFIG_GLOBAL;
const emptyHomes: string[] = [];

// Points Git at an empty global configuration, so no identity exists until the app sets one.
function withoutGlobalIdentity() {
  const home = mkdtempSync(join(tmpdir(), 'workbench-no-identity-'));
  emptyHomes.push(home);
  const config = join(home, 'gitconfig');
  writeFileSync(config, '[init]\n\tdefaultBranch = main\n');
  process.env.GIT_CONFIG_GLOBAL = config;
  return config;
}

afterEach(() => {
  process.env.GIT_CONFIG_GLOBAL = isolatedGlobal;
  for (const home of emptyHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function workspaceWithProjects(count: number) {
  const app = await testWorkspace();
  const slugs: string[] = [];
  for (let i = 0; i < count; i++) {
    const created = await app.ws.importBatch(
      {
        name: `Shop ${i + 1}`,
        files: [{ path: 'shop.yaml', source: ontology('Buys.') }],
      },
      LOCAL_READER,
    );
    slugs.push(created.slug);
  }
  return { app, slugs };
}

test('the identity is read per repository and reports which configuration sets it', async () => {
  const { app, slugs } = await workspaceWithProjects(1);
  try {
    const identity = await ok(call(app, 'GET', `/api/projects/${slugs[0]}/git/identity`));
    expect(identity).toEqual({
      name: 'Workbench Test',
      email: 'workbench-test@example.invalid',
      scope: 'global',
    });
    const status = await ok(call(app, 'GET', '/api/status'));
    expect(status.identityConfigured).toBe(true);
    expect(status.repositories).toEqual([{ repo: slugs[0], identityConfigured: true, projects: [slugs[0]] }]);
  } finally {
    app.dispose();
  }
});

test('setting the identity writes the repository configuration only and counts at once', async () => {
  const { app, slugs } = await workspaceWithProjects(1);
  try {
    const globalConfig = withoutGlobalIdentity();
    const before = readFileSync(globalConfig, 'utf8');
    const base = `/api/projects/${slugs[0]}`;
    expect((await ok(call(app, 'GET', base + '/git/identity'))).scope).toBe('none');
    const missing = await ok(call(app, 'GET', '/api/status'));
    expect(missing.identityConfigured).toBe(false);
    expect(missing.repositories[0].identityConfigured).toBe(false);
    expect((await ok(call(app, 'GET', base + '/git/status'))).identityConfigured).toBe(false);

    const result = await ok(call(app, 'PUT', base + '/git/identity', { name: 'Ana Lima', email: 'ana@example.org' }));
    expect(result).toEqual({ repositories: [slugs[0]] });
    const repo = join(app.root, 'projects', slugs[0]);
    expect(sh(repo, ['config', '--local', 'user.name']).trim()).toBe('Ana Lima');
    expect(sh(repo, ['config', '--local', 'user.email']).trim()).toBe('ana@example.org');
    expect(readFileSync(globalConfig, 'utf8')).toBe(before);
    expect(await ok(call(app, 'GET', base + '/git/identity'))).toEqual({
      name: 'Ana Lima',
      email: 'ana@example.org',
      scope: 'local',
    });
    expect((await ok(call(app, 'GET', '/api/status'))).identityConfigured).toBe(true);
    expect((await ok(call(app, 'GET', base + '/git/status'))).identityConfigured).toBe(true);
    const events = app.ws.events.replay(0)!.filter(event => event.event === 'identity');
    expect(events.map(event => event.data)).toEqual([{ repo: slugs[0] }]);

    writeFileSync(join(repo, 'shop.yaml'), ontology('Buys often.'));
    await ok(call(app, 'POST', base + '/git/stage', { all: true }));
    await ok(call(app, 'POST', base + '/git/commit', { message: 'Describe customers' }));
    expect(sh(repo, ['log', '-1', '--format=%an <%ae>']).trim()).toBe('Ana Lima <ana@example.org>');
  } finally {
    app.dispose();
  }
});

test('the identity can be set in every repository at once', async () => {
  const { app, slugs } = await workspaceWithProjects(2);
  try {
    withoutGlobalIdentity();
    const result = await ok(
      call(app, 'PUT', `/api/projects/${slugs[0]}/git/identity`, {
        name: 'Ana Lima',
        email: 'ana@example.org',
        allRepositories: true,
      }),
    );
    expect(result.repositories.sort()).toEqual([...slugs].sort());
    for (const slug of slugs) expect(sh(join(app.root, 'projects', slug), ['config', '--local', 'user.name']).trim()).toBe('Ana Lima');
    expect((await ok(call(app, 'GET', '/api/status'))).identityConfigured).toBe(true);
  } finally {
    app.dispose();
  }
});

test('names and emails with control characters or the wrong length are refused', async () => {
  const { app, slugs } = await workspaceWithProjects(1);
  try {
    const path = `/api/projects/${slugs[0]}/git/identity`;
    for (const body of [
      { name: '', email: 'ana@example.org' },
      { name: 'Ana\nLima', email: 'ana@example.org' },
      { name: 'Ana', email: 'a' },
      { name: 'Ana', email: 'ana@example.org\u0000' },
      { name: 'x'.repeat(201), email: 'ana@example.org' },
      { name: 'Ana', email: 'ana@example.org', allRepositories: 'yes' },
      { name: 'Ana', email: 'ana@example.org', scope: 'global' },
    ]) {
      const response = await call(app, 'PUT', path, body);
      expect({ body, status: response.status }).toEqual({ body, status: 400 });
    }
  } finally {
    app.dispose();
  }
});

test('the credential helper is reported by name without reading credentials', async () => {
  const { app } = await workspaceWithProjects(1);
  try {
    const globalConfig = withoutGlobalIdentity();
    expect(await ok(call(app, 'GET', '/api/git/credential-helper'))).toEqual({ helper: null });
    writeFileSync(globalConfig, '[credential]\n\thelper = cache\n');
    expect(await ok(call(app, 'GET', '/api/git/credential-helper'))).toEqual({ helper: 'cache' });
  } finally {
    app.dispose();
  }
});

test('every repository fills in missing identities and keeps an author a repository already has', async () => {
  const { app, slugs } = await workspaceWithProjects(2);
  try {
    withoutGlobalIdentity();
    const second = join(app.root, 'projects', slugs[1]);
    sh(second, ['config', '--local', 'user.name', 'Bot']);
    sh(second, ['config', '--local', 'user.email', 'bot@example.org']);
    const result = await ok(
      call(app, 'PUT', `/api/projects/${slugs[0]}/git/identity`, {
        name: 'Ana Lima',
        email: 'ana@example.org',
        allRepositories: true,
      }),
    );
    expect(result).toEqual({ repositories: [slugs[0]] });
    expect(sh(second, ['config', '--local', 'user.name']).trim()).toBe('Bot');
  } finally {
    app.dispose();
  }
});
