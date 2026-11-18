// Tests the read route over HTTP: answers, refusals and headers.
import { afterEach, describe, expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { dataLayout } from '../../src/server/projects/paths';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { utcDay } from '../../src/server/usage/usage-retention';
import { AUTH_PROJECTS, authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
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
