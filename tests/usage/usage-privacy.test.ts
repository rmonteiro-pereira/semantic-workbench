// Tests that stored counts hold no identity, that their fields are the documented ones, and that the
// counting code stays apart from the audit log and telemetry.
import { afterEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { clientPrincipal } from '../../src/server/auth/principal';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createHandler } from '../../src/server/handler';
import { authWorkspace, fixtureFiles } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { accessFixture, person } from '../auth/access-fixture';

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

async function countedRequests() {
  const fixture = await authWorkspace();
  disposers.push(() => fixture[Symbol.dispose]());
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => access.principalFor(person('dave')),
    publicOrigin: 'http://localhost:5312',
    usageSettings: { enabled: true, retentionDays: 30 },
  });
  const principals = [...(['alice', 'bob', 'carol', 'dave', 'erin'] as TestUserName[]).map(name => access.principalFor(person(name))), clientPrincipal('sw-agent', 'Sales agent')];
  const identifiers: string[] = [];
  for (const [index, principal] of principals.entries()) {
    const connection = `connection-${index}-secret`;
    const sourceIp = `203.0.113.${index + 10}`;
    identifiers.push(principal.id, principal.name, principal.username, connection, sourceIp, ...(principal.verifiedEmail ? [principal.verifiedEmail] : []));
    const caller = mintCaller({ principal, origin: 'mcp', connection, sourceIp });
    const request = buildTwinRequest('agent.context.read', { params: {}, query: { project: 'sales-contracts', mappingId: 'sales-contracts/sales.mapping.yaml' } });
    await handler.boundary.operate({ caller, request });
  }
  await handler.usage.settled();
  handler.usage.close();
  return { fixture, handler, identifiers };
}

describe('stored counts', () => {
  test('hold no person, client, connection, address, request id or document text', async () => {
    const { fixture, identifiers } = await countedRequests();
    const stored = filesUnder(join(fixture.root, 'state', 'usage'));
    expect(stored.length).toBeGreaterThan(0);
    const secrets = [...identifiers, ...Object.values(TEST_USERS).flatMap(user => [user.oid, user.upn, user.email, user.name]), 'sw-agent'];
    for (const path of stored) {
      const text = readFileSync(path, 'utf8');
      for (const secret of secrets) expect(text, `${path} holds ${secret}`).not.toContain(secret);
      for (const file of fixtureFiles('sales-contracts')) {
        const firstLine = file.source.split('\n').find(line => line.trim().length > 20 && !line.includes('#'));
        if (firstLine) expect(text).not.toContain(firstLine.trim());
      }
    }
  });

  test('count requests of every caller together', async () => {
    const { fixture } = await countedRequests();
    const [file] = filesUnder(join(fixture.root, 'state', 'usage', 'sales-contracts'));
    const day = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(day).sort()).toEqual(['counts', 'day', 'formatVersion', 'migratedThrough', 'project']);
    const origins = Object.values<any>(day.counts).flatMap(item => Object.values<any>(item['workbench-requests']).flatMap(byOrigin => Object.keys(byOrigin)));
    expect(new Set(origins)).toEqual(new Set(['mcp']));
  });
});

describe('separation from audit and telemetry', () => {
  const forbidden = /auth\/audit|observability\/(telemetry|metrics|tracing|http-request|request-context)/;

  test('no usage module imports an audit or telemetry module', () => {
    for (const path of readdirSync('src/server/usage')) {
      const imports = [...readFileSync(join('src/server/usage', path), 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]);
      for (const target of imports) expect(forbidden.test(target), `${path} imports ${target}`).toBe(false);
    }
  });

  test('no audit or telemetry module imports a usage module', () => {
    const modules = [
      ...readdirSync('src/server/auth')
        .filter(name => name.startsWith('audit'))
        .map(name => join('src/server/auth', name)),
      ...readdirSync('src/server/observability').map(name => join('src/server/observability', name)),
    ];
    for (const path of modules) expect(readFileSync(path, 'utf8'), path).not.toMatch(/from '[^']*usage\//);
  });
});
