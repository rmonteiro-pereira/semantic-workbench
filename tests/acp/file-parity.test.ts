// A file request of the agent decides exactly as the ordinary route and the model-protocol twin do: same outcome, same stored text, same version and the same audit record apart from origin, tool and connection.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { mintAcpCaller } from '../../src/server/acp/connection-auth';
import { createFileRequests } from '../../src/server/acp/file-requests';
import { createVersionRecords } from '../../src/server/acp/version-records';
import { authWorkspace, fixtureFiles } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';
import type { TestUserName } from '../helpers/auth-identities';

const origin = 'http://localhost:5312';
const existingProjects = ['sales-contracts', 'hr-people', 'lab-notes', 'sales-metrics', 'shared-reference'];
type Transport = 'http' | 'mcp' | 'acp';
type Kind = 'read' | 'edit' | 'create';
type Case = { name: string; user: TestUserName; kind: Kind; project: string; path: string; change?: (text: string) => string };

const ORDERS = { project: 'sales-contracts', path: 'orders.odcs.yaml' };
const addNote = (text: string) => text.replace(/\n$/, '') + '\n# note from the parity test\n';
const classify = (text: string) => text.replace('        primaryKey: true\n', '        primaryKey: true\n        classification: restricted\n');
const breakSyntax = () => 'schema: [\n';

const cases: Case[] = [
  ...(['alice', 'bob', 'carol', 'dave', 'gina', 'erin', 'hank', 'frank'] as const).flatMap((user): Case[] => [
    { name: `${user} reads an ordinary file`, user, kind: 'read', ...ORDERS },
    { name: `${user} reads a restricted file`, user, kind: 'read', project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml' },
    { name: `${user} reads in a project they cannot see`, user, kind: 'read', project: 'hr-people', path: 'people.odcs.yaml' },
    { name: `${user} edits an ordinary file`, user, kind: 'edit', ...ORDERS, change: addNote },
  ]),
  { name: 'dave reads a missing file', user: 'dave', kind: 'read', project: 'sales-contracts', path: 'nothing.odcs.yaml' },
  { name: 'dave reads in a missing project', user: 'dave', kind: 'read', project: 'no-such-project', path: 'orders.odcs.yaml' },
  { name: 'dave edits a restricted file', user: 'dave', kind: 'edit', project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml', change: addNote },
  { name: 'frank edits a restricted file', user: 'frank', kind: 'edit', project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml', change: addNote },
  { name: 'alice edits a restricted file', user: 'alice', kind: 'edit', project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml', change: addNote },
  { name: 'alice makes a guarded classification change', user: 'alice', kind: 'edit', ...ORDERS, change: classify },
  { name: 'dave makes a guarded classification change', user: 'dave', kind: 'edit', ...ORDERS, change: classify },
  { name: 'dave saves invalid text', user: 'dave', kind: 'edit', ...ORDERS, change: breakSyntax },
  { name: 'bob edits in the hidden project', user: 'bob', kind: 'edit', project: 'hr-people', path: 'people.odcs.yaml', change: addNote },
  { name: 'dave creates a file', user: 'dave', kind: 'create', project: 'sales-contracts', path: 'created.odcs.yaml' },
  { name: 'carol creates a file in a project she only views', user: 'carol', kind: 'create', project: 'lab-notes', path: 'created.ontology.yaml' },
  { name: 'alice creates a file', user: 'alice', kind: 'create', project: 'sales-contracts', path: 'created.odcs.yaml' },
  { name: 'erin, who has no grant, creates a file', user: 'erin', kind: 'create', project: 'sales-contracts', path: 'created.odcs.yaml' },
];

const ignoredKeys = ['at', 'prev', 'requestId', 'origin', 'tool', 'connection', 'method', 'clientLabel', 'createdAt', 'updatedAt', 'commit'];
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignoredKeys.includes(key))
      .map(([key, item]) => [key, normalized(item)]),
  );
}

type Outcome = { read: boolean | null; saved: boolean | null; storedText: string | null; version: string | null; audit: unknown[] };

async function run(transport: Transport, testCase: Case): Promise<Outcome> {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(testCase.user));
  const audit = createAuditLog({ dir: join(fixture.root, 'parity-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  const base = `/api/projects/${testCase.project}/files/${testCase.path}`;
  const browser = (path: string, init: RequestInit = {}) => handler(new Request(origin + path, { ...init, headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' } }));
  const twin = (operation: string, body?: unknown) =>
    handler.boundary
      .operate({ caller: mintCaller({ principal, origin: 'mcp' }), request: buildTwinRequest(operation, { params: { slug: testCase.project, '*': testCase.path }, body }) })
      .then(result => result.response);
  const original = existingProjects.includes(testCase.project) ? (fixtureFiles(testCase.project).find(file => file.path === testCase.path)?.source ?? '') : '';
  const text = testCase.kind === 'create' ? fixtureFiles('sales-contracts')[3].source.replace(/id: .*/, 'id: 1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4daa') : (testCase.change?.(original) ?? original);
  let read: boolean | null = null;
  let saved: boolean | null = null;
  let version: string | null = null;

  if (transport === 'acp') {
    const versions = createVersionRecords();
    const caller = mintAcpCaller({ principal, connection: 'acp-parity', scope: ['read', 'localWrite'] });
    const requests = createFileRequests({ operate: async request => (await handler.boundary.operate({ caller, request })).response, versions, admit: () => ({ ok: true, release() {} }) });
    const virtual = `/workbench/${testCase.project}/${testCase.path}`;
    if (testCase.kind !== 'create') read = (await requests.read({ path: virtual })).ok;
    if (testCase.kind !== 'read') {
      const outcome = await requests.write({ path: virtual, content: text });
      saved = outcome.ok;
      version = outcome.ok ? (outcome.card?.version ?? null) : null;
    }
  } else {
    const first = transport === 'http' ? await browser(base) : await twin('files.read');
    read = testCase.kind === 'create' ? null : first.ok;
    const hash = first.ok ? ((await first.json()) as { hash: string }).hash : null;
    if (testCase.kind !== 'read') {
      const body = { baseHash: testCase.kind === 'create' ? null : hash, source: text };
      const response = transport === 'http' ? await browser(base, { method: 'PUT', body: JSON.stringify(body) }) : await twin('files.save', body);
      saved = response.ok;
      version = response.ok ? ((await response.json()) as { hash: string }).hash : null;
    }
  }
  const after = await browser(base);
  const storedText = after.ok ? ((await after.json()) as { source: string }).source : null;
  // The agent request reads once more before it writes, so only the records of the operation under test are compared. The ordinary route records no allowed read, so only refused reads are compared.
  const comparable = audit.recent(50).filter(entry => (testCase.kind === 'read' ? entry.action === 'read' && entry.decision === 'deny' : entry.action !== 'read'));
  return { read: read === null ? null : read, saved, storedText, version, audit: comparable.map(normalized) };
}

for (const testCase of cases) {
  test(`${testCase.name}: the route, the model-protocol twin and the agent request agree`, async () => {
    const http = await run('http', testCase);
    const mcp = await run('mcp', testCase);
    const acp = await run('acp', testCase);
    expect(mcp, 'twin against route').toEqual(http);
    expect(acp, 'agent request against route').toEqual(http);
  }, 60_000);
}

test('the table has at least thirty cases and covers every kind of outcome', () => {
  expect(cases.length).toBeGreaterThanOrEqual(30);
  expect(new Set(cases.map(item => item.kind))).toEqual(new Set(['read', 'edit', 'create']));
});
