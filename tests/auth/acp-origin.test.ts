// A caller with origin acp gets the same decisions and results as a caller with origin mcp, and its operations are counted under their own label.
import { expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller, type CallerOrigin } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import * as metrics from '../../src/server/observability/metrics';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

type Person = 'alice' | 'carol' | 'dave';
type Case = { name: string; person: Person; operation: string; params: Record<string, string>; body?: unknown };

const ordinary = 'orders.odcs.yaml';
const restricted = 'finance/revenue-recognition.odcs.yaml';

const cases: Case[] = [
  { name: 'list as an admin', person: 'dave', operation: 'projects.list', params: {} },
  { name: 'list as a reader', person: 'alice', operation: 'projects.list', params: {} },
  { name: 'read an ordinary file', person: 'dave', operation: 'files.read', params: { slug: 'sales-contracts', '*': ordinary } },
  { name: 'read a restricted file', person: 'alice', operation: 'files.read', params: { slug: 'sales-contracts', '*': restricted } },
  { name: 'read in a hidden project', person: 'alice', operation: 'files.read', params: { slug: 'hr-people', '*': 'people.odcs.yaml' } },
  { name: 'read in a missing project', person: 'dave', operation: 'files.read', params: { slug: 'missing', '*': ordinary } },
  { name: 'list metrics', person: 'dave', operation: 'metrics.list', params: { slug: 'sales-metrics' } },
  { name: 'validate text', person: 'dave', operation: 'files.validate', params: { slug: 'sales-contracts', '*': ordinary }, body: { source: 'ontology: []' } },
  { name: 'save as an admin', person: 'dave', operation: 'files.save', params: { slug: 'sales-contracts', '*': 'created.yaml' }, body: { baseHash: null, source: 'ontology: []' } },
  { name: 'save without the edit right', person: 'carol', operation: 'files.save', params: { slug: 'sales-contracts', '*': 'created.yaml' }, body: { baseHash: null, source: 'ontology: []' } },
];

const originDependentKeys = ['at', 'prev', 'requestId', 'origin', 'tool', 'connection', 'method', 'clientLabel', 'createdAt', 'updatedAt', 'commit'];

function withoutOriginDetails(value: unknown, field?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map(item => withoutOriginDetails(item));
    return field === 'rules' ? items.sort() : items;
  }
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).filter(([key]) => !originDependentKeys.includes(key));
  return Object.fromEntries(entries.map(([key, item]) => [key, withoutOriginDetails(item, key)]));
}

async function run(testCase: Case, origin: CallerOrigin) {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(testCase.person));
  const audit = createAuditLog({ dir: join(fixture.root, 'origin-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: 'http://localhost:5312', port: 5312, remoteCredentials: allowEveryRemote() });
  const request = buildTwinRequest(testCase.operation, { params: testCase.params, body: testCase.body });
  const { response } = await handler.boundary.operate({ caller: mintCaller({ principal, origin, connection: 'acp-abc123' }), request });
  const text = await response.text();
  const records = audit.recent(10);
  return { status: response.status, body: withoutOriginDetails(JSON.parse(text || 'null')), audit: records.map(record => withoutOriginDetails(record)), origins: records.map(record => record.origin) };
}

for (const testCase of cases) {
  test(`origin acp decides ${testCase.name} as origin mcp does`, async () => {
    const protocol = await run(testCase, 'mcp');
    const panel = await run(testCase, 'acp');
    expect(panel.status).toBe(protocol.status);
    expect(panel.body).toEqual(protocol.body);
    expect(panel.audit).toEqual(protocol.audit);
    expect(panel.origins).toEqual(protocol.origins.map(() => 'acp'));
    expect(panel.origins.length).toBe(1);
  }, 30_000);
}

test('an acp operation is counted under the acp label', async () => {
  const recorded = spyOn(metrics, 'recordOperation');
  try {
    await run(cases[0], 'acp');
    expect(recorded.mock.calls.some(call => call[0] === 'acp' && call[1] === 'projects.list')).toBe(true);
  } finally {
    recorded.mockRestore();
  }
}, 30_000);
