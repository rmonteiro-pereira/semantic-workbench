import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { createSessionStore } from '../../src/server/auth/sessions';
import { createHandler } from '../../src/server/handler';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

const origin = 'http://localhost:5173';
const restricted = 'finance/revenue-recognition.odcs.yaml';
const project = 'sales-contracts';
const cases = [
  { username: 'hank', project, status: 200, visible: false },
  { username: 'dave', project, status: 200, visible: true },
  { username: 'alice', project, status: 200, visible: false },
  { username: 'alice', project: 'hr-people', status: 404, visible: false },
] as const;

function auditDetails(record: unknown) {
  const { at, prev, requestId, ...details } = record as Record<string, unknown>;
  return details;
}

test('browser HTTP and the operation boundary agree on item comparison visibility and audit', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const file = join(fixture.root, 'projects', project, restricted);
  await Bun.write(file, 'unparseable: [');
  for (const entry of cases) {
    const principal = access.principalFor(person(entry.username));
    const directory = join(fixture.root, 'item-parity', entry.username, entry.project);
    const audit = createAuditLog({ dir: join(directory, 'audit') });
    const sessions = createSessionStore({ dir: join(directory, 'sessions'), key: randomBytes(32) });
    const session = await sessions.create({ principal, tokens: { accessToken: 'fixture', expiresAt: Date.now() + 60_000 } });
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      access,
      audit,
      principal: () => principal,
      publicOrigin: origin,
      remoteCredentials: allowEveryRemote(),
      authentication: {
        sessions,
        session: async () => session,
        login: async () => new Response(null, { status: 302 }),
        callback: async () => new Response(null, { status: 302 }),
        logout: async () => new Response(null, { status: 303 }),
        frontChannelLogout: async () => new Response(null, { status: 200 }),
      },
    });
    const url = `${origin}/api/projects/${entry.project}/item-diff?from=published&to=working`;
    const http = await handler(new Request(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
    const oper = await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'http', surface: 'browser', session }), request: new Request(url) });
    const body = await http.text();
    expect(http.status, entry.username).toBe(entry.status);
    expect(oper.response.status).toBe(http.status);
    expect(await oper.response.text()).toBe(body);
    expect(body.includes(restricted)).toBe(entry.visible);
    const records = audit.recent(10).map(auditDetails);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(records[1]);
  }
});
