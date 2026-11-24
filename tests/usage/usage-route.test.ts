// Tests the read route over HTTP: answers, refusals and headers.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { addressMigrationFile } from '../../src/server/projects/address-migrations';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { dataLayout } from '../../src/server/projects/paths';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { utcDay } from '../../src/server/usage/usage-retention';
import { AUTH_PROJECTS, authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { publishFixture } from '../helpers/published-workspace';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { publishedMigrationRecords } from '../../src/server/usage/usage-publication';
import { compactUsage } from '../../src/server/usage/usage-compaction';
import { testWorkspace } from '../helpers/temp-data-dir';
import { accessFixture, person } from '../auth/access-fixture';
import type { TestUserName } from '../helpers/auth-identities';

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

const settings = { enabled: true, retentionDays: 30 };
const today = () => utcDay(new Date());

function writeCounts(root: string, project: string, address: string) {
  const store = createUsageStore(dataLayout(root));
  const file = emptyDayFile(project, today());
  addCount(file.counts, { address, measure: 'workbench-requests', operation: 'agent.plan', origin: 'http' }, 3);
  store.writeDay(file);
}

describe('in local mode', () => {
  test('answers the counts of a project with no-store caching', async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const project = await fixture.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
    await publishFixture(fixture);
    const address = `sw1:${project.slug}/a.yaml#ontology:O/concept:A`;
    writeCounts(fixture.root, project.slug, address);
    const handler = createHandler(fixture.ws, { usageSettings: settings });
    const response = await handler(new Request(`http://localhost/api/projects/${project.slug}/usage`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const answer = await response.json();
    expect(answer.counters).toEqual({ enabled: true, retentionDays: 30 });
    expect(answer.measures[0].items).toEqual([{ address, total: 3, byOperation: { 'agent.plan': 3 }, byOrigin: { http: 3 } }]);
    handler.usage.close();
  });

  test('does not expose a day already rekeyed by unverified history', async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const project = await fixture.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
    await publishFixture(fixture);
    const address = `sw1:${project.slug}/a.yaml#ontology:O/concept:A`;
    const store = createUsageStore(fixture.ws.layout);
    const file = emptyDayFile(project.slug, today());
    file.migratedThrough = 'unverified';
    addCount(file.counts, { address, measure: 'workbench-requests', operation: 'agent.plan', origin: 'http' }, 3);
    store.writeDay(file);
    const handler = createHandler(fixture.ws, { usageSettings: settings });
    try {
      const response = await handler(new Request(`http://localhost/api/projects/${project.slug}/usage?days=1`));
      expect((await response.json()).measures[0]).toMatchObject({ items: [], unavailableDays: [file.day] });
      expect(store.readDay(project.slug, file.day)).toEqual({ status: 'ok', file });
    } finally {
      await handler.usage.close();
    }
  });

  test('answers that counters are off, without any count, when they are off', async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const project = await fixture.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
    writeCounts(fixture.root, project.slug, `sw1:${project.slug}/a.yaml#ontology:O/concept:A`);
    const response = await createHandler(fixture.ws)(new Request(`http://localhost/api/projects/${project.slug}/usage`));
    expect(await response.json()).toEqual({ counters: { enabled: false }, measures: [] });
  });

  test('refuses a bad period with 400 and a missing project with 404', async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const project = await fixture.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
    const handler = createHandler(fixture.ws, { usageSettings: settings });
    for (const query of ['days=0', 'days=31', 'days=ten', 'verbose=1']) {
      expect((await handler(new Request(`http://localhost/api/projects/${project.slug}/usage?${query}`))).status, query).toBe(400);
    }
    expect((await handler(new Request('http://localhost/api/projects/nobody/usage'))).status).toBe(404);
    handler.usage.close();
  });
});

describe('in server mode', () => {
  test('answers 200 to a reader, 404 for a project they cannot see and 403 to someone with no access', async () => {
    const fixture = await authWorkspace();
    disposers.push(() => fixture[Symbol.dispose]());
    const access = createAccessControl(accessFixture());
    for (const name of ['alice', 'bob', 'carol', 'dave', 'erin'] as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const view = access.view(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => principal,
        publicOrigin: 'http://localhost:5312',
        usageSettings: settings,
      });
      for (const project of AUTH_PROJECTS) {
        const response = await handler(new Request(`http://localhost/api/projects/${project}/usage`));
        let expected = view.readableProjects.has(project) ? 200 : 404;
        if (!principal.grants.length) expected = 403;
        expect(response.status, `${name} ${project}`).toBe(expected);
      }
      handler.usage.close();
    }
  });
});

for (const change of ['single rename', 'independent publication', 'two renames', 'two saves in one commit', 'merged rename'] as const) {
  test(`two readers follow only committed usage migrations after ${change}`, async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const source = 'name: O\nontology: [{concept: Before}]';
    const { slug } = await fixture.seed([{ path: 'a.yaml', source }], 'sales-contracts');
    await publishFixture(fixture);
    const oldAddress = `sw1:${slug}/a.yaml#ontology:O/concept:Before`;
    const newAddress = `sw1:${slug}/a.yaml#ontology:O/concept:PrivateRename`;
    const finalAddress = `sw1:${slug}/a.yaml#ontology:O/concept:Final`;
    writeCounts(fixture.root, slug, oldAddress);
    const store = createUsageStore(fixture.ws.layout);
    const access = createAccessControl(accessFixture());
    const handlers = (['alice', 'dave'] as const).map(name =>
      createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => access.principalFor(person(name)),
        publicOrigin: 'http://localhost',
        usageSettings: settings,
      }),
    );
    async function checkBoth(address: string | null) {
      for (const handler of handlers) {
        const response = await handler(new Request(`http://localhost/api/projects/${slug}/usage`));
        expect(response.status, await response.clone().text()).toBe(200);
        expect((await response.json()).measures[0].items).toEqual(address ? [{ address, total: 3, byOperation: { 'agent.plan': 3 }, byOrigin: { http: 3 } }] : []);
      }
    }
    try {
      const file = await fixture.ws.readFile(slug, 'a.yaml', LOCAL_READER);
      await fixture.ws.saveFile(
        slug,
        'a.yaml',
        {
          baseHash: file.hash,
          source: source.replace('Before', 'PrivateRename'),
          declaredMigrations: [{ kind: 'item', from: oldAddress, to: newAddress }],
        },
        LOCAL_READER,
      );
      if (change !== 'two saves in one commit') {
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Rename the concept', { paths: ['a.yaml'] });
      }
      await checkBoth(oldAddress);
      const compact = () =>
        compactUsage({
          store,
          today: today(),
          retentionDays: 30,
          migrationRecords: project => publishedMigrationRecords(fixture.ws.layout, project, fixture.ws.published.pin().commits.get(project)?.commit),
        });
      compact();
      const privateDay = store.readDay(slug, today());
      expect(privateDay.status === 'ok' && Object.keys(privateDay.file.counts)).toEqual([oldAddress]);
      if (change === 'independent publication') {
        const directory = fixture.ws.worktrees.baseDir(slug);
        await fixture.ws.git.run(directory, ['switch', '-c', 'independent', 'main']);
        writeFileSync(join(directory, 'a.yaml'), source.replace('Before', 'PrivateRename'));
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Add an independent item', { paths: ['a.yaml'] });
      }
      if (change === 'two renames' || change === 'two saves in one commit') {
        const renamed = fixture.ws.readFile(slug, 'a.yaml');
        await fixture.ws.saveFile(
          slug,
          'a.yaml',
          {
            baseHash: renamed.hash,
            source: source.replace('Before', 'Final'),
            declaredMigrations: [{ kind: 'item', from: newAddress, to: finalAddress }],
          },
          LOCAL_READER,
        );
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Rename the concept again', { paths: ['a.yaml'] });
      }
      if (change === 'merged rename') {
        const directory = fixture.ws.worktrees.baseDir(slug);
        await fixture.ws.git.run(directory, ['switch', '-c', 'integration', 'main']);
        await fixture.ws.git.run(directory, ['merge', '--no-ff', '--no-edit', 'work/local']);
      }
      await fixture.ws.publish(slug, LOCAL_READER);
      const expected = {
        'single rename': newAddress,
        'two renames': finalAddress,
        'two saves in one commit': finalAddress,
        'merged rename': newAddress,
        'independent publication': null,
      }[change];
      await checkBoth(expected);
      compact();
      const publicDay = store.readDay(slug, today());
      // Without a published rename the counts stay under the old address, which the published model no longer has.
      expect(publicDay.status === 'ok' && Object.keys(publicDay.file.counts)).toEqual([expected ?? oldAddress]);
      await checkBoth(expected);
      // An item renamed outside the workbench leaves no history, so reusing its old address is only checked after published renames.
      if (expected) {
        const directory = fixture.ws.worktrees.baseDir(slug);
        const path = join(directory, 'a.yaml');
        const current = fixture.ws.readFile(slug, 'a.yaml');
        writeFileSync(path, current.source.replace('ontology: [', 'ontology: [{concept: Before}, '));
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Add a different item at the original address', { paths: ['a.yaml'] });
        await fixture.ws.publish(slug, LOCAL_READER);
        await checkBoth(expected);
        const name = expected.slice(expected.lastIndexOf(':') + 1);
        const withBoth = fixture.ws.readFile(slug, 'a.yaml');
        await fixture.ws.saveFile(slug, 'a.yaml', { baseHash: withBoth.hash, source: withBoth.source.replace(`, {concept: ${name}}`, ''), deletedItems: [expected] }, LOCAL_READER);
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Delete the counted item', { paths: ['a.yaml'] });
        await fixture.ws.publish(slug, LOCAL_READER);
        await checkBoth(null);
        writeFileSync(path, source.replace('Before', name));
        await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Reuse the deleted address', { paths: ['a.yaml'] });
        await fixture.ws.publish(slug, LOCAL_READER);
        await checkBoth(null);
        compact();
        await checkBoth(null);
      }
    } finally {
      for (const handler of handlers) await handler.usage.close();
    }
  });
}

for (const failure of ['malformed journal', 'unwritable usage history'] as const) {
  test(`publication works with ${failure} while usage counters are off`, async () => {
    const fixture = await testWorkspace();
    disposers.push(fixture.dispose);
    const source = 'name: O\nontology: [{concept: Before}]';
    const { slug } = await fixture.seed([{ path: 'a.yaml', source }], 'Counted');
    await publishFixture(fixture);
    const file = fixture.ws.readFile(slug, 'a.yaml');
    const address = (name: string) => `sw1:${slug}/a.yaml#ontology:O/concept:${name}`;
    await fixture.ws.saveFile(
      slug,
      'a.yaml',
      {
        baseHash: file.hash,
        source: source.replace('Before', 'After'),
        declaredMigrations: [{ kind: 'item', from: address('Before'), to: address('After') }],
      },
      LOCAL_READER,
    );
    const commit = await (await fixture.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Rename the concept', { paths: ['a.yaml'] });
    const path = failure === 'malformed journal' ? addressMigrationFile(fixture.ws.layout, slug) : join(fixture.ws.layout.state, 'published-address-migrations');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'invalid');
    expect((await fixture.ws.publish(slug, LOCAL_READER)).commit).toBe(commit.commit);
    expect(fixture.ws.published.pin().commits.get(slug)?.commit).toBe(commit.commit);
  });
}
