// A repository command must be authorized for every project sharing its working tree.
import { expect, spyOn, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bareRepository } from '../helpers/git-fixtures';
import { testWorkspace } from '../helpers/temp-data-dir';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { accessFixture, person } from './access-fixture';
import type { CloneEvent } from '../../src/server/projects/clone';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

function bytes(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
      const path = join(prefix, entry.name);
      if (path === 'state/audit' || path.startsWith('cache.sqlite')) return [];
      if (entry.isDirectory()) return Object.entries(bytes(root, path));
      return [[path, readFileSync(join(root, path)).toString('base64')]];
    }),
  );
}

test('an Editor of one manifest project cannot switch, fetch, pull, sync or push its shared repo', async () => {
  const remote = bareRepository('monorepo');
  using fixture = await testWorkspace();
  try {
    const started = fixture.ws.clone(remote.bare, undefined, LOCAL_READER);
    let completed = false;
    for (let attempt = 0; attempt < 400 && !completed; attempt++) {
      completed = fixture.ws.events.replay(0)!.some(event => {
        const data = event.data as CloneEvent;
        return event.event === 'clone' && data.op === started.op && data.phase === 'done';
      });
      if (!completed) await Bun.sleep(10);
    }
    expect(completed).toBe(true);
    const projects = fixture.ws.state.registry().projects;
    expect(projects).toHaveLength(2);
    const sales = projects.find(project => project.name === 'Sales')!;
    const finance = projects.find(project => project.name === 'Finance')!;
    const options = accessFixture();
    options.config.projects.projects[sales.slug] = {
      domain: 'sales',
      stewards: [],
      restricted: [],
      protectedBranches: [],
    };
    options.config.projects.projects[finance.slug] = {
      domain: 'hr',
      stewards: [],
      restricted: [],
      protectedBranches: [],
    };
    const access = createAccessControl({
      ...options,
      knownProjects: () => projects.map(project => project.slug),
    });
    const origin = 'http://127.0.0.1:4310';
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person('alice')),
    });
    const before = bytes(fixture.root);
    const methods = ['switchBranch', 'fetch', 'pull', 'sync', 'push'] as const;
    const spies = methods.map(method => spyOn(fixture.ws.scm, method));
    try {
      for (const action of ['switch', 'fetch', 'pull', 'sync', 'push']) {
        const response = await handler(
          new Request(origin + '/api/projects/' + sales.slug + '/git/' + action, {
            method: 'POST',
            headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch: 'other', create: true }),
          }),
        );
        expect(response.status, action).toBe(404);
        expect(bytes(fixture.root), action).toEqual(before);
        const audit = join(fixture.root, 'state/audit');
        const lines = readdirSync(audit)
          .filter(name => name.endsWith('.jsonl'))
          .flatMap(name => readFileSync(join(audit, name), 'utf8').trim().split('\n'))
          .filter(line => line.includes(response.headers.get('X-Request-Id')!));
        expect(lines).toHaveLength(1);
        const actions: Record<string, string> = { switch: 'branch', sync: 'pull' };
        const expected = actions[action] ?? action;
        expect(JSON.parse(lines[0]).action).toBe(expected);
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  } finally {
    remote.dispose();
  }
});

/** Clones the two-project monorepo fixture and waits until the clone reports done. */
async function cloneMonorepo(fixture: Awaited<ReturnType<typeof testWorkspace>>, bare: string) {
  const started = fixture.ws.clone(bare, undefined, LOCAL_READER);
  for (let attempt = 0; attempt < 400; attempt++) {
    const done = fixture.ws.events.replay(0)!.some(event => {
      const data = event.data as CloneEvent;
      return event.event === 'clone' && data.op === started.op && data.phase === 'done';
    });
    if (done) break;
    await Bun.sleep(10);
  }
  const projects = fixture.ws.state.registry().projects;
  const sales = projects.find(project => project.name === 'Sales')!;
  const finance = projects.find(project => project.name === 'Finance')!;
  return { projects, sales, finance };
}

test('changing a shared remote needs setRemote on every project of the repository', async () => {
  const remote = bareRepository('monorepo');
  using fixture = await testWorkspace();
  try {
    const { projects, sales, finance } = await cloneMonorepo(fixture, remote.bare);
    expect(projects).toHaveLength(2);
    const options = accessFixture();
    for (const [slug, domain] of [
      [sales.slug, 'sales'],
      [finance.slug, 'hr'],
    ]) {
      options.config.projects.projects[slug] = {
        domain,
        stewards: [],
        restricted: [],
        protectedBranches: [],
      };
    }
    // Even an Admin may not change remotes of HR projects under this workspace rule.
    options.config.adminRules = {
      'hr-remotes': '@id("hr-remotes")\nforbid (principal, action == SW::Action::"setRemote", resource) when { resource.domain == "hr" };',
    };
    const access = createAccessControl({
      ...options,
      knownProjects: () => projects.map(project => project.slug),
    });
    const origin = 'http://127.0.0.1:4310';
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person('dave')),
    });
    const setRemote = spyOn(fixture.ws.scm, 'setRemote');
    const removeRemote = spyOn(fixture.ws.scm, 'removeRemote');
    try {
      for (const [method, body] of [
        ['PUT', { name: 'origin', url: 'https://example.org/other.git' }],
        ['DELETE', { name: 'origin' }],
      ] as const) {
        const response = await handler(
          new Request(origin + '/api/projects/' + sales.slug + '/git/remote', {
            method,
            headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        );
        expect(response.status, method).toBe(403);
      }
      expect(setRemote).not.toHaveBeenCalled();
      expect(removeRemote).not.toHaveBeenCalled();
    } finally {
      setRemote.mockRestore();
      removeRemote.mockRestore();
    }
  } finally {
    remote.dispose();
  }
});
