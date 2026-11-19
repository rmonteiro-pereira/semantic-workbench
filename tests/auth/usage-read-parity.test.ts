// The usage read operation answers the same over HTTP and as a twin, hides what a reader may not
// read exactly as if it did not exist, and never lets an unreadable file show in an answer.
import { afterEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createHandler } from '../../src/server/handler';
import { dataLayout } from '../../src/server/projects/paths';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { utcDay } from '../../src/server/usage/usage-retention';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { AUTH_PROJECTS, authWorkspace } from '../helpers/auth-workspace';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

const PROJECT = 'sales-contracts';
const RESTRICTED = 'finance/revenue-recognition.odcs.yaml';
const ORDINARY = 'orders.odcs.yaml';
const origin = 'http://localhost:5312';
const settings = { enabled: true, retentionDays: 30 };
const itemIn = (path: string) => {
  if (path === ORDINARY) return `sw1:${PROJECT}/${path}#contract:1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d01/object:orders`;
  return `sw1:${PROJECT}/${path}#contract:1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d02/object:recognized_revenue`;
};

async function setup() {
  const fixture = await authWorkspace();
  disposers.push(() => fixture[Symbol.dispose]());
  const access = createAccessControl(accessFixture());
  const store = createUsageStore(dataLayout(fixture.root));
  const write = (...paths: string[]) => {
    const file = emptyDayFile(PROJECT, utcDay(new Date()));
    for (const path of paths) addCount(file.counts, { address: itemIn(path), measure: 'workbench-requests', operation: 'agent.plan', origin: 'http' }, 4);
    store.writeDay(file);
  };
  const handlerFor = (name: TestUserName) => {
    const principal = access.principalFor(person(name));
    const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, principal: () => principal, publicOrigin: origin, usageSettings: settings });
    return { handler, principal, view: access.view(principal) };
  };
  return { fixture, store, write, handlerFor, clear: () => rmSync(dataLayout(fixture.root).usage, { recursive: true, force: true }) };
}

const names = Object.keys(TEST_USERS) as TestUserName[];

async function describeAnswer(response: Response) {
  return { status: response.status, headers: [...response.headers.entries()].filter(([name]) => name !== 'x-request-id').sort(), body: await response.text() };
}

test('the HTTP route and the twin answer alike', async () => {
  const { write, handlerFor } = await setup();
  write(ORDINARY);
  const { handler, principal } = handlerFor('dave');
  const http = await handler(new Request(`${origin}/api/projects/${PROJECT}/usage`));
  const twin = (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request: buildTwinRequest('usage.read', { params: { slug: PROJECT } }) })).response;
  expect(http.status).toBe(200);
  expect(twin.status).toBe(200);
  expect(await twin.json()).toEqual(await http.json());
});

test('a project the reader cannot see answers exactly like a project that does not exist', async () => {
  const { write, handlerFor } = await setup();
  write(ORDINARY);
  let compared = 0;
  for (const name of names) {
    const { handler, principal, view } = handlerFor(name);
    if (!principal.grants.length) continue;
    for (const project of AUTH_PROJECTS.filter(candidate => !view.readableProjects.has(candidate))) {
      const hidden = await describeAnswer(await handler(new Request(`${origin}/api/projects/${project}/usage`)));
      const missing = await describeAnswer(await handler(new Request(`${origin}/api/projects/${project}-absent/usage`)));
      expect(hidden, `${name} ${project}`).toEqual(missing);
      compared += 1;
    }
  }
  expect(compared).toBeGreaterThan(0);
});

test('an unreadable file with counts, without counts and missing give the same answer', async () => {
  const { write, handlerFor, clear } = await setup();
  const reader = names.map(handlerFor).find(candidate => candidate.view.readableProjects.has(PROJECT) && !candidate.view.canRead(PROJECT, RESTRICTED) && candidate.view.canRead(PROJECT, ORDINARY));
  expect(reader, 'fixture has a reader who may read the project but not the restricted file').toBeDefined();
  const ask = async () => describeAnswer(await reader!.handler(new Request(`${origin}/api/projects/${PROJECT}/usage`)));
  write(ORDINARY, RESTRICTED);
  const withCounts = await ask();
  write(ORDINARY);
  const withoutCounts = await ask();
  write(ORDINARY, 'finance/never-existed.odcs.yaml');
  const missingFile = await ask();
  expect(withCounts).toEqual(withoutCounts);
  expect(missingFile).toEqual(withoutCounts);
  expect(withCounts.body).not.toContain('finance');
  expect(withCounts.body).toContain(ORDINARY);
  clear();
});
